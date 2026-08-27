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

/** Why a store call did not do what was asked. Internal; the sentence is what a person sees. */
export type StoreFailure =
  | "signedOut"
  | "unavailable"
  | "notFound"
  | "unreadable"
  | "invalid"
  | "stillPublic"
  | "tooLarge";

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly failure: StoreFailure;
      /** A plain sentence, safe to render as-is. */
      readonly message: string;
      /** The broken rules, for a developer. Empty unless the failure is `invalid` or `tooLarge`. */
      readonly violations: readonly Violation[];
    };

const MESSAGES: Readonly<Record<StoreFailure, string>> = {
  signedOut: "You are signed out. Sign in to see your projects.",
  unavailable: "Your projects could not be reached just now. Check your connection and try again.",
  notFound: "That project is no longer here. It may have been deleted.",
  unreadable: "That project was saved by a newer version of Roomify and cannot be opened here.",
  invalid: "That change could not be saved because it would leave the project in an impossible state.",
  stillPublic: "Make this project private first, so its public copies come down with it.",
  tooLarge: "That project is too large to save. Try a shorter name.",
};

const succeed = <T>(value: T): StoreResult<T> => ({ ok: true, value });

const fail = <T>(failure: StoreFailure, violations: readonly Violation[] = []): StoreResult<T> => ({
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
  error instanceof PuterGateError ? fail<T>("signedOut") : fail<T>("unavailable");

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
export const createProject = async (input: NewProjectInput): Promise<StoreResult<Project>> => {
  const now = Date.now();

  const renders = Object.fromEntries(
    input.models.map((model) => [
      model,
      { status: "pending", path: null, url: null, errorCode: null, startedAt: null, finishedAt: null },
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
export const readProject = async (id: string): Promise<StoreResult<Project>> => {
  try {
    const stored = await withPuter((sdk) => sdk.kv.get<unknown>(projectKey(id)));
    if (stored === undefined || stored === null) return fail<Project>("notFound");

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
      sdk.kv.list<unknown>({ pattern: PROJECT_LIST_PATTERN, returnValues: true }),
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
  Pick<Project, "name" | "renders" | "visibility" | "publishedAt" | "publicAssets">
>;

/**
 * Reads a project, applies changes to it, and writes it back.
 *
 * Read-modify-write rather than a blind write, so a caller only has to say what
 * changed, and so the render state machine can be enforced: a change is checked
 * against the statuses actually stored, not against whatever the caller thought
 * they were.
 *
 * This is not safe against two writers at once, and nothing in the store makes
 * it so. It does not need to be: this store is scoped to one person and one
 * app, and every path that writes it is driven by that person acting. The
 * concurrency that does matter, two people publishing at the same moment, is
 * store B's problem and is answered by the worker's lock in feature 9.
 */
export const updateProject = async (
  id: string,
  changes: ProjectChanges,
): Promise<StoreResult<Project>> => {
  const current = await readProject(id);
  if (!current.ok) return current;

  const illegal = illegalTransitions(current.value, changes.renders);
  if (illegal.length > 0) return fail<Project>("invalid", illegal);

  return putProject({
    ...current.value,
    ...changes,
    ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
    updatedAt: Date.now(),
  });
};

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
 * Deletes a project.
 *
 * Deleting a public project leaves its feed entry and its hosted image copies
 * behind, which AC-9 forbids. Withdrawing those is the worker's job and belongs
 * to feature 9, so this refuses to delete a public project rather than quietly
 * doing half of what AC-9 asks. Unpublish first, then delete.
 */
export const deleteProject = async (id: string): Promise<StoreResult<true>> => {
  const current = await readProject(id);

  if (current.ok && current.value.visibility === "public") {
    return fail<true>("stillPublic", [
      {
        rule: "delete.public",
        detail: "A public project has to be made private before it can be deleted, so its public copies go too.",
      },
    ]);
  }

  if (!current.ok && current.failure !== "unreadable") return current;

  try {
    await withPuter((sdk) => sdk.kv.del(projectKey(id)));
    return succeed(true as const);
  } catch (error: unknown) {
    return toFailure<true>(error);
  }
};
