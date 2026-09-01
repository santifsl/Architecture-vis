/**
 * The project page's engine: it starts renders, waits for them, and moves the
 * record through its states. Spec 0006, build tasks 7 and 8.
 *
 * The client owns the record and the worker owns nothing, which is spec 0002's
 * single-writer rule kept intact: every invariant a project has to satisfy is
 * enforced in `app/projects/` behind one door, and this hook goes through that
 * door like everything else.
 *
 * Three guards keep AC-18 true, and all three are here from the first version
 * rather than added after something went wrong. No one of them covers every
 * cause on its own:
 *
 *   1. A latch per `${projectId}:${model}` collapses a double effect in
 *      development, and any two starts in the same tab, into one worker call.
 *   2. A start is refused when the stored status is already `running` and not
 *      yet stale. That is what a second tab sees when it opens a project that
 *      is already generating.
 *   3. Every write carries the `startedAt` its attempt began from and is
 *      abandoned when the stored `startedAt` has moved on. A compare and swap
 *      in the client, and the thing that makes a late answer from a timed-out
 *      attempt harmless: a retry stamps a new `startedAt`, so the old attempt's
 *      write finds a value that is not its own and drops it.
 *
 * Two tabs are handled honestly rather than perfectly, same as the store's own
 * admission: the guarantee is that a stale write is discarded, not that two
 * tabs coordinate.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createKeyedSingleFlight,
  createSerialQueue,
} from "~/auth/singleFlight";
import {
  readProject,
  updateProject,
  type StoreFailure,
} from "~/projects/store";
import type { ModelId, Project, RenderState } from "~/projects/record";
import type { RenderFailure } from "~/render/failures";
import { mayStartRender, renderOutPath } from "~/render/rules";
import { readAbsolutePath, requestRender } from "~/render/store";

/**
 * Module scope, not per hook instance.
 *
 * A latch inside the component would be recreated on remount, which is exactly
 * the case guard 1 exists for: React's development double effect mounts,
 * unmounts and mounts again, and a per-instance latch would let both mounts
 * start the same render.
 */
const startOne = createKeyedSingleFlight();
const writesFor = createSerialQueue();

/** What the page renders per model. Everything here is read, never guessed at. */
export type ProjectRenders = {
  /** The project as it currently stands, refreshed after every write. */
  readonly project: Project;
  /** Ask for one model to be rendered again. Ignored while that model is genuinely running. */
  readonly retry: (model: ModelId) => void;
  /**
   * A model whose render could not even be RECORDED as started, and why.
   *
   * Held here rather than on the record, because the reason it is here is that
   * the record could not be written. Without it a store that cannot be reached
   * leaves a card reading "Queued" for as long as the page is open, with no
   * sentence and nothing to press, which is the screen claiming work is
   * happening when nothing is. It is cleared the moment a start succeeds.
   */
  readonly blocked: Readonly<Partial<Record<ModelId, RenderFailure>>>;
};

/** Why a write did not land, in the render vocabulary. */
const writeFailure = (failure: StoreFailure): RenderFailure =>
  failure === "signedOut" ? "signedOut" : "unreachable";

/** What a start attempt did. `refused` means another attempt owns this render. */
type StartResult =
  | { readonly kind: "started"; readonly project: Project }
  | { readonly kind: "refused" }
  | { readonly kind: "blocked"; readonly failure: RenderFailure };

/** Applies one model's change to the record, if this attempt still owns it. */
const commitRender = async (
  project: Project,
  model: ModelId,
  startedAt: number,
  change: Partial<RenderState>,
): Promise<Project | null> =>
  writesFor(project.id, async () => {
    const current = await readProject(project.id);
    if (!current.ok) return null;

    const stored = current.value.renders[model];
    // Guard 3. The attempt that wrote this `startedAt` is the only one allowed
    // to finish it. Anything else is a superseded attempt answering late, and
    // its answer is dropped rather than written over the retry that replaced it.
    if (stored === undefined || stored.startedAt !== startedAt) return null;

    const written = await updateProject(project.id, {
      renders: { [model]: { ...stored, ...change } },
    });
    return written.ok ? written.value : null;
  });

export const useProjectRenders = (loaded: Project): ProjectRenders => {
  const [project, setProject] = useState(loaded);
  const [blocked, setBlocked] = useState<
    Readonly<Partial<Record<ModelId, RenderFailure>>>
  >({});

  /**
   * The plan's absolute path, resolved once and reused by every model.
   *
   * A promise rather than a value, so two models starting in the same tick
   * share one `fs.stat` instead of racing to make the same call twice.
   */
  const absolutePlan = useRef<Promise<
    Awaited<ReturnType<typeof readAbsolutePath>>
  > | null>(null);

  /** False once the page is gone, so a finished render never writes to a dead component. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * The record after a write, or nothing.
   *
   * The write itself is never conditional on the component still being here:
   * abandoning a completed render because someone navigated away would lose an
   * image that has already been generated and paid for. Only the state update
   * is guarded.
   */
  const absorb = useCallback((next: Project | null) => {
    if (next !== null && alive.current) setProject(next);
  }, []);

  /** Records, or clears, the reason a model's render could not be started. */
  const note = useCallback((model: ModelId, failure: RenderFailure | null) => {
    if (!alive.current) return;
    setBlocked((current) => {
      if (current[model] === (failure ?? undefined)) return current;
      // Rebuilt rather than deleted from, so the state stays immutable and the
      // cleared case does not leave an explicit `undefined` key behind.
      const rest = Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== model),
      );
      return failure === null ? rest : { ...rest, [model]: failure };
    });
  }, []);

  const run = useCallback(
    async (current: Project, model: ModelId) => {
      const started = Date.now();

      const marked = await commitRenderStart(current, model, started);
      if (marked.kind === "refused") return;
      if (marked.kind === "blocked") {
        note(model, marked.failure);
        return;
      }
      note(model, null);
      absorb(marked.project);

      const resolved = await resolveAbsolutePlan(absolutePlan, current);
      if (!resolved.ok) {
        absorb(await finish(current, model, started, resolved.failure));
        return;
      }

      const out = renderOutPath(resolved.value, current.id, model);
      if (out === null) {
        absorb(await finish(current, model, started, "planUnreadable"));
        return;
      }

      const outcome = await requestRender({
        plan: resolved.value,
        out,
        model,
      });

      if (!outcome.ok) {
        absorb(await finish(current, model, started, outcome.failure));
        return;
      }

      absorb(
        await commitRender(current, model, started, {
          status: "complete",
          path: outcome.value.path,
          errorCode: null,
          finishedAt: Date.now(),
        }),
      );
    },
    [absorb, note],
  );

  /**
   * Starts every render that is waiting to be started, whenever the project
   * changes.
   *
   * This is what makes AC-17 true: a `pending` render is work not started, not
   * work lost, so a Generate that was interrupted between writing the record
   * and reaching this page resolves itself on the next visit rather than
   * stranding a plan someone already paid to upload. It is also why the stale
   * rule is scoped to `running`. A `pending` render needs no rule; it just runs.
   *
   * `models` is the source of the loop rather than `renders`, because `models`
   * is what was requested and `checkProject` guarantees one render key per
   * entry. Each model gets its own independent call, so one being slow or
   * broken never touches another's status, path, or codes. Spec 0007 left one
   * model in that set, and the loop is written to stay correct either way.
   */
  useEffect(() => {
    const now = Date.now();
    project.models.forEach((model) => {
      const render = project.renders[model];
      // Guard 2. A render that is genuinely running, in this tab or another
      // one, is left alone.
      if (render === undefined || !mayStartRender(render, now)) return;

      // Guard 1.
      void startOne(`${project.id}:${model}`, () => run(project, model));
    });
  }, [project, run]);

  /**
   * Retry, in the two shapes a retry actually comes in. Spec 0006, AC-8.
   *
   * A `failed` render goes back to `pending`, and the effect above is what
   * starts it. That is deliberate: `pending` to `running` is the only way a
   * render ever starts, so there is one start path rather than a second one a
   * retry would have to be kept in step with. It is also the transition AC-8
   * names, failed to pending to running.
   *
   * A stale `running` render cannot take that route, because `running` to
   * `pending` is not a legal move and should not become one: a render that is
   * running as far as the record knows has not been given up on by the record,
   * only by the tab that was watching it. So it starts directly, writing
   * `running` again with a fresh `startedAt`. That new stamp is what makes the
   * abandoned attempt's answer, if it ever does arrive, get dropped.
   *
   * Either way this touches one model and nothing else about the project.
   */
  const retry = useCallback(
    (model: ModelId) => {
      const render = project.renders[model];
      if (render === undefined) return;

      if (render.status === "failed") {
        void writesFor(project.id, async () => {
          const written = await updateProject(project.id, {
            renders: {
              [model]: {
                ...render,
                status: "pending",
                errorCode: null,
                startedAt: null,
                finishedAt: null,
              },
            },
          });
          if (written.ok) {
            note(model, null);
            absorb(written.value);
          } else {
            note(model, writeFailure(written.failure));
          }
        });
        return;
      }

      if (!mayStartRender(render)) return;
      void startOne(`${project.id}:${model}`, () => run(project, model));
    },
    [absorb, note, project, run],
  );

  return { project, retry, blocked };
};

/**
 * Writes `running` and stamps the attempt.
 *
 * Separate from `commitRender` because there is no previous `startedAt` to
 * compare against here: this write is what CREATES the stamp every later write
 * for this attempt is checked against. It re-reads and re-checks under the
 * queue anyway, so two starts that somehow got past the latches still produce
 * one `running` render rather than two.
 */
const commitRenderStart = async (
  project: Project,
  model: ModelId,
  startedAt: number,
): Promise<StartResult> =>
  writesFor(project.id, async () => {
    const current = await readProject(project.id);
    if (!current.ok)
      return { kind: "blocked", failure: writeFailure(current.failure) };

    const stored = current.value.renders[model];
    if (stored === undefined) return { kind: "refused" };
    // Someone else got here first: another tab, or a start that landed while
    // this one was waiting its turn in the queue. Not a failure, and not
    // something to tell anyone about.
    if (!mayStartRender(stored)) return { kind: "refused" };

    const written = await updateProject(project.id, {
      renders: {
        [model]: {
          ...stored,
          status: "running",
          errorCode: null,
          startedAt,
          finishedAt: null,
        },
      },
    });
    return written.ok
      ? { kind: "started", project: written.value }
      : { kind: "blocked", failure: writeFailure(written.failure) };
  });

/** Records a failed render, with the code that explains it. */
const finish = (
  project: Project,
  model: ModelId,
  startedAt: number,
  failure: RenderFailure,
): Promise<Project | null> =>
  commitRender(project, model, startedAt, {
    status: "failed",
    errorCode: failure,
    finishedAt: Date.now(),
  });

/**
 * One `fs.stat` per project, shared by every model that needs the answer.
 *
 * A FAILED lookup is not kept. Caching it would mean one flaky network moment
 * left every render on the page permanently unable to start, and no amount of
 * pressing Retry would ever get past it, which is the same reasoning
 * `app/storage/urls.ts` uses for a failed mint.
 */
const resolveAbsolutePlan = async (
  cache: {
    current: Promise<Awaited<ReturnType<typeof readAbsolutePath>>> | null;
  },
  project: Project,
): Promise<Awaited<ReturnType<typeof readAbsolutePath>>> => {
  const pending = (cache.current ??= readAbsolutePath(project.floorPlan.path));
  const resolved = await pending;
  if (!resolved.ok && cache.current === pending) cache.current = null;
  return resolved;
};
