/**
 * The owner's own projects, read and written through their own Puter store.
 * Spec 0002, build task 2.
 *
 * AC-1: a project lives in its owner's `puter.kv` under `project:<id>`, and the
 * personal gallery is one prefix list against that store. No worker call and no
 * second store is involved in reading a signed-in person's own projects, which
 * is what keeps the gallery working when everything public is down.
 *
 * AC-14: nothing here throws at its caller and nothing raw escapes. Every
 * function returns a result carrying a plain sentence a person can read, and
 * every failure lands on one of them: signed out, unreachable, an unreadable
 * record, a record that broke an invariant, or a value too large to store.
 *
 * Puter is reached only through `withPuter` from `app/platform/puter.ts`, the
 * one module allowed to import the SDK.
 */
import { createSerialQueue } from "~/auth/singleFlight";
import { PuterGateError, withPuter } from "~/platform/puter";
import {
  checkProject,
  checkWriteSize,
  parseProject,
  type Violation,
} from "~/projects/invariants";
import {
  isLegalRenderTransition,
  MODEL_IDS,
  newProjectId,
  PROJECT_LIST_PATTERN,
  projectKey,
  SCHEMA_VERSION,
  type ModelId,
  type Project,
} from "~/projects/record";

/**
 * Every write to one project, run one at a time. Spec 0011, AC-20.
 *
 * Module scope, not per caller, because the point is that two callers who know
 * nothing about each other still take their turn: a render finishing while a
 * rename is in flight, two renders finishing together, a publish and an
 * unpublish of the same project. `updateProject` is a read, modify, write
 * against a store with no compare and swap, so two of those interleaving means
 * the second writes from a copy read before the first landed and the first
 * change is silently lost.
 *
 * This queue used to live in `app/render/useProjectRenders.ts`, which made it a
 * guarantee the render feature had and every other feature had to remember to
 * ask for. It is here now so the next feature that writes a project inherits it
 * instead, which is the single writer rule actually holding rather than being
 * documented.
 *
 * Honest about its limit, same as the store it protects: this serialises one
 * tab, not two. Across tabs, the render loop's `startedAt` stamp and the
 * publish path's `publishedRevision` compare do the same job differently, by
 * discarding a stale write rather than preventing it.
 */
const writesFor = createSerialQueue();

/** Why a store call did not do what was asked. Internal; the sentence is what a person sees. */
export type StoreFailure =
  | "signedOut"
  | "unavailable"
  | "notFound"
  | "unreadable"
  | "invalid"
  | "superseded"
  | "stillPublic"
  | "unsafeToDelete"
  | "tooLarge";

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly failure: StoreFailure;
      /** A plain sentence, safe to render as-is. */
      readonly message: string;
      /** The broken rules, for a developer. Empty unless the failure names a rule the record broke. */
      readonly violations: readonly Violation[];
    };

const MESSAGES: Readonly<Record<StoreFailure, string>> = {
  signedOut: "You are signed out. Sign in to see your projects.",
  unavailable:
    "Your projects could not be reached just now. Check your connection and try again.",
  notFound: "That project is no longer here. It may have been deleted.",
  unreadable:
    "That project was saved by a newer version of AV and cannot be opened here.",
  invalid:
    "That change could not be saved because it would leave the project in an impossible state.",
  superseded:
    "That change was already replaced by a newer one, so it was not saved.",
  stillPublic:
    "Make this project private first, so its public copies come down with it.",
  unsafeToDelete:
    "This project cannot be read, so there is no way to tell whether it was shared publicly. It has been left in place rather than deleted with its public copies possibly still up.",
  tooLarge: "That project is too large to save. Try a shorter name.",
};

const succeed = <T>(value: T): StoreResult<T> => ({ ok: true, value });

const fail = <T>(
  failure: StoreFailure,
  violations: readonly Violation[] = [],
): StoreResult<T> => ({
  ok: false,
  failure,
  message: MESSAGES[failure],
  violations,
});

/**
 * Turns anything thrown below into a failure, so no exception escapes.
 *
 * `PuterGateError` is the one case worth telling apart: it means the call was
 * made while signed out, which is a different sentence and a different fix from
 * a store that could not be reached.
 */
const toFailure = <T>(error: unknown): StoreResult<T> =>
  error instanceof PuterGateError
    ? fail<T>("signedOut")
    : fail<T>("unavailable");

/**
 * Writes a project, refusing anything that breaks an invariant or will not fit.
 *
 * Both checks happen before the store is touched, so a rejected write is never
 * a half-applied one. This is the single door every write below goes through,
 * which is what makes the invariants unavoidable rather than remembered.
 */
const putProject = async (project: Project): Promise<StoreResult<Project>> => {
  const violations = checkProject(project);
  if (violations.length > 0) return fail<Project>("invalid", violations);

  const key = projectKey(project.id);
  const oversize = checkWriteSize(key, project);
  if (oversize.length > 0) return fail<Project>("tooLarge", oversize);

  try {
    await withPuter((sdk) => sdk.kv.set(key, project));
    return succeed(project);
  } catch (error: unknown) {
    return toFailure<Project>(error);
  }
};

/** What a caller supplies to start a project. Everything else is derived here. */
export type NewProjectInput = {
  readonly name: string;
  /** The owner's Puter username, from the root loader's resolved user. Never typed or posted. */
  readonly owner: string;
  readonly floorPlan: Project["floorPlan"];
  /** At least one model, each requested once. */
  readonly models: readonly ModelId[];
};

/**
 * Creates a project and stores it. A new project is always private, and every
 * model it requested starts `pending` with nothing rendered yet.
 *
 * The id is generated here rather than being asked for, so no caller can choose
 * one, and the clock is read once so `createdAt` and `updatedAt` agree exactly
 * on a record that has never been changed.
 */
export const createProject = async (
  input: NewProjectInput,
): Promise<StoreResult<Project>> => {
  const now = Date.now();

  const renders = Object.fromEntries(
    input.models.map((model) => [
      model,
      {
        status: "pending",
        path: null,
        url: null,
        errorCode: null,
        startedAt: null,
        finishedAt: null,
      },
    ]),
  ) as Project["renders"];

  return putProject({
    schemaVersion: SCHEMA_VERSION,
    id: newProjectId(now),
    name: input.name.trim(),
    owner: input.owner,
    floorPlan: input.floorPlan,
    models: input.models,
    renders,
    visibility: "private",
    publishedAt: null,
    publicAssets: null,
    // A project that has never been changed has had no content changes. Every
    // later increment is relative to this, and nothing resets it.
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
};

/**
 * Reads one project.
 *
 * A missing key and an unreadable record are told apart on purpose: the first
 * means the project is gone, the second means it is there and this build cannot
 * understand it, and those deserve different sentences.
 */
export const readProject = async (
  id: string,
): Promise<StoreResult<Project>> => {
  try {
    const stored = await withPuter((sdk) =>
      sdk.kv.get<unknown>(projectKey(id)),
    );
    if (stored === undefined || stored === null)
      return fail<Project>("notFound");

    const project = parseProject(stored);
    return project === null ? fail<Project>("unreadable") : succeed(project);
  } catch (error: unknown) {
    return toFailure<Project>(error);
  }
};

/**
 * Lists the owner's projects, newest first. AC-1.
 *
 * One prefix list against their own store, and nothing else. A record that no
 * longer parses is skipped rather than failing the whole list: one project
 * written by a newer version of the app should cost that one card, not the
 * entire gallery. `unreadable` count is reported so a caller can say so if it
 * wants to.
 *
 * The sort is on the id, which carries creation time in its leading characters,
 * so ordering needs no second field and no comparison of clocks.
 */
export type ProjectList = {
  readonly projects: readonly Project[];
  /** How many stored records this build could not read. Usually zero. */
  readonly unreadable: number;
};

export const listProjects = async (): Promise<StoreResult<ProjectList>> => {
  try {
    const pairs = await withPuter((sdk) =>
      sdk.kv.list<unknown>({
        pattern: PROJECT_LIST_PATTERN,
        returnValues: true,
      }),
    );

    const parsed = pairs.map((pair) => parseProject(pair.value));
    const projects = parsed
      .filter((project): project is Project => project !== null)
      .slice()
      .sort((left, right) => right.id.localeCompare(left.id));

    return succeed({
      projects,
      unreadable: parsed.length - projects.length,
    });
  } catch (error: unknown) {
    return toFailure<ProjectList>(error);
  }
};

/**
 * The parts of a project a caller may change. Everything absent here is either
 * fixed at creation (`id`, `owner`, `createdAt`, `floorPlan`, `models`) or
 * derived (`updatedAt`, `schemaVersion`).
 *
 * `models` is deliberately not editable: changing what a project requested
 * after the fact would orphan a render that already ran. A different set of
 * models is a different project.
 */
export type ProjectChanges = Partial<
  Pick<
    Project,
    "name" | "renders" | "visibility" | "publishedAt" | "publicAssets"
  >
>;

/**
 * What a caller may ask for: a plain set of changes, or a function that decides
 * them from the record as it actually stands.
 *
 * The function form is what keeps a compare and swap honest. A caller that
 * needs to check something before writing (the render loop asking "is this
 * still my attempt?", the publish path asking "is this response still the
 * newest?") would otherwise have to read first and then call `updateProject`,
 * which reads again, and another write can land between the two. Deciding
 * inside the queued turn closes that gap without giving anyone a second door
 * into the store. Returning `null` abandons the write.
 */
export type ProjectChangeMaker = (current: Project) => ProjectChanges | null;

/**
 * A change to `name` or `renders` is a change to what the project IS, so it
 * moves `revision`. A change to `visibility`, `publishedAt` or `publicAssets`
 * is a change to how it is shared, so it must not.
 *
 * Spec 0011 leans on this hard, and the reason is worth keeping next to the
 * code: `publicAssets.publishedRevision` records the revision a publish was
 * built from, and freshness is those two integers differing. If committing a
 * publish bumped the counter, every publish would invalidate itself the instant
 * it succeeded and every public project would read as permanently out of date.
 */
const isContentChange = (changes: ProjectChanges): boolean =>
  changes.name !== undefined || changes.renders !== undefined;

/**
 * Reads a project, applies changes to it, and writes it back, one write per
 * project at a time.
 *
 * Read-modify-write rather than a blind write, so a caller only has to say what
 * changed, and so the render state machine can be enforced: a change is checked
 * against the statuses actually stored, not against whatever the caller thought
 * they were. The whole read, decide, write sequence runs inside `writesFor`, so
 * two callers in this tab take turns rather than reading the same copy and
 * overwriting each other (AC-20).
 *
 * `renders` merges per model rather than replacing the map. Its type is a
 * partial record, so `{ renders: { gemini } }` is a legal thing to write, and a
 * caller reporting one model's progress should not have to resend any other
 * model's state to keep it. Replacing wholesale would drop the untouched model,
 * which `checkProject` would then refuse as a missing render: a confusing
 * refusal for a change that was never wrong. One model's progress leaving the
 * others alone is what merging makes true here, and it stays right whether the
 * map holds one entry or several.
 */
export const updateProject = async (
  id: string,
  changes: ProjectChanges | ProjectChangeMaker,
): Promise<StoreResult<Project>> =>
  writesFor(id, async () => {
    const current = await readProject(id);
    if (!current.ok) return current;

    const resolved =
      typeof changes === "function" ? changes(current.value) : changes;
    if (resolved === null) return fail<Project>("superseded");

    const illegal = illegalTransitions(current.value, resolved.renders);
    if (illegal.length > 0) return fail<Project>("invalid", illegal);

    return putProject({
      ...current.value,
      ...resolved,
      ...(resolved.name === undefined ? {} : { name: resolved.name.trim() }),
      ...(resolved.renders === undefined
        ? {}
        : { renders: { ...current.value.renders, ...resolved.renders } }),
      revision: current.value.revision + (isContentChange(resolved) ? 1 : 0),
      updatedAt: Date.now(),
    });
  });

/**
 * Which of the proposed render statuses are not reachable from where the stored
 * render actually is. Spec 0002's state transitions, enforced.
 *
 * A model with no stored render yet is left alone here: whether it is allowed
 * to exist at all is `checkProject`'s question, and answering it twice, in two
 * places, with two different sentences, is how the two answers drift apart.
 */
const illegalTransitions = (
  current: Project,
  proposed: Project["renders"] | undefined,
): readonly Violation[] => {
  if (proposed === undefined) return [];

  return MODEL_IDS.flatMap((model) => {
    const before = current.renders[model];
    const after = proposed[model];
    if (before === undefined || after === undefined) return [];
    if (isLegalRenderTransition(before.status, after.status)) return [];

    return [
      {
        rule: "renders.transition",
        detail: `The ${model} render cannot go from ${before.status} to ${after.status}.`,
      },
    ];
  });
};

/**
 * Deletes a project, and refuses whenever it cannot prove the deletion is safe.
 *
 * Deleting a public project leaves its feed entry and its hosted image copies
 * behind, which AC-9 forbids. Withdrawing those is the worker's job and belongs
 * to feature 9, so this refuses to delete a public project rather than quietly
 * doing half of what AC-9 asks. Unpublish first, then delete.
 *
 * A record this build cannot parse is refused for the same reason, and it is a
 * named case rather than an oversight: an unreadable record's `visibility` is
 * unknown, so deleting it is a coin flip on whether a live feed entry and a set
 * of hosted copies just lost the only record that knew about them. Nothing else
 * can clean them up, because the worker cannot enumerate anyone else's store.
 * Failing closed leaves a record that a later build, or a hand edit, can still
 * read and unpublish properly; failing open destroys that chance for good. The
 * two refusals carry different sentences on purpose: one asks for an unpublish,
 * the other reports a record that needs looking at.
 */
export const deleteProject = async (id: string): Promise<StoreResult<true>> =>
  writesFor(id, async () => {
    const current = await readProject(id);

    if (!current.ok) {
      return current.failure === "unreadable"
        ? fail<true>("unsafeToDelete", [
            {
              rule: "delete.unreadable",
              detail:
                "The stored record does not parse, so its visibility is unknown and deleting it could strand a feed entry and its hosted copies.",
            },
          ])
        : current;
    }

    if (current.value.visibility === "public") {
      return fail<true>("stillPublic", [
        {
          rule: "delete.public",
          detail:
            "A public project has to be made private before it can be deleted, so its public copies go too.",
        },
      ]);
    }

    try {
      await withPuter((sdk) => sdk.kv.del(projectKey(id)));
      return succeed(true as const);
    } catch (error: unknown) {
      return toFailure<true>(error);
    }
  });
