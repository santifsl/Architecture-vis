/**
 * The project record's shape, written down once. Spec 0002, build task 1.
 *
 * Features 5, 6, 7, 9 and 10 all read and write the same record, so the types,
 * the id generator, and the key builders live here rather than being re-derived
 * per feature. Nothing in this module touches Puter or performs I/O: it is
 * shapes and pure functions only, so it can be reasoned about, and reused by
 * the worker later, without dragging the SDK in behind it.
 *
 * Two stores are named here. Store A is the owner's own `puter.kv`, the system
 * of record, and `app/projects/store.ts` is the only thing that writes it.
 * Store B is the app account's `puter.kv`, reachable only from inside the Puter
 * worker, and only the worker ever writes it. `FeedEntry` and the `feed:` key
 * builders describe store B's shape so that feature 9 builds against the shape
 * decided here instead of inventing a second one.
 */

/** Bumped only when the stored shape changes, so a later change is detectable rather than guessed. */
export const SCHEMA_VERSION = 1;
export type SchemaVersion = typeof SCHEMA_VERSION;

/** The two models a project can request. Spec 0002, `ModelId`. */
export const MODEL_IDS = ["claude", "gemini"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const isModelId = (value: unknown): value is ModelId =>
  MODEL_IDS.some((id) => id === value);

/**
 * The statuses one model's render moves through. AC-2: each requested model
 * carries its own `RenderState`, so one model failing cannot touch the other's
 * status, URL, or error code.
 */
export const RENDER_STATUSES = ["pending", "running", "complete", "failed"] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

export const isRenderStatus = (value: unknown): value is RenderStatus =>
  RENDER_STATUSES.some((status) => status === value);

/**
 * The legal moves for one model's render, from spec 0002's state transitions.
 *
 * `complete` is terminal apart from the deliberate regenerate the spec names,
 * which is why `complete → pending` is here and `complete → running` is not: a
 * regenerate goes back to the start of the machine rather than jumping into the
 * middle of it. A status staying where it is counts as legal, so a write that
 * changes something else about a render is never rejected as a bad transition.
 */
const LEGAL_RENDER_TRANSITIONS: Readonly<Record<RenderStatus, readonly RenderStatus[]>> = {
  pending: ["running"],
  running: ["complete", "failed"],
  complete: ["pending"],
  failed: ["pending"],
};

export const isLegalRenderTransition = (from: RenderStatus, to: RenderStatus): boolean =>
  from === to || LEGAL_RENDER_TRANSITIONS[from].some((status) => status === to);

/** One model's render. Embedded in the project, one per requested model. */
export type RenderState = {
  readonly status: RenderStatus;
  /** The `puter.fs` path, set when the status reaches `complete`. */
  readonly path: string | null;
  /** The owner-readable URL, set when the status reaches `complete`. */
  readonly url: string | null;
  /** A short internal code. Never a provider message, per the project's rule that nothing raw reaches a screen. */
  readonly errorCode: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
};

/** The uploaded plan, as feature 5's `puter.fs` write leaves it. */
export type FloorPlan = {
  readonly path: string;
  readonly url: string;
};

export type Visibility = "private" | "public";

/**
 * The public copies of a published project's images, written by the client from
 * the publish response. Non-null exactly while the project is public.
 *
 * `renderUrls` holds one entry per model that had a complete render at the
 * moment of publishing, which is why it is partial: publishing a project whose
 * Gemini render is still running produces a Claude URL and no Gemini one.
 */
export type PublicAssets = {
  readonly floorPlanUrl: string;
  readonly renderUrls: Readonly<Partial<Record<ModelId, string>>>;
};

/**
 * A project, as it is stored in its owner's own `puter.kv` under
 * `project:<id>`. AC-1: this copy is the truth, and the personal gallery is one
 * prefix list against it with no worker call involved.
 *
 * `renders` is deliberately `Partial` rather than the total record the spec's
 * field table writes. The spec's own invariant is that `renders` holds exactly
 * one key per entry in `models` "and no others", which a total record cannot
 * express for a project that requested one model. `checkProject` in
 * `invariants.ts` enforces the exact correspondence the type cannot.
 */
export type Project = {
  readonly schemaVersion: SchemaVersion;
  readonly id: string;
  readonly name: string;
  /** The owner's Puter username, denormalized so a snapshot needs no second lookup. */
  readonly owner: string;
  readonly floorPlan: FloorPlan;
  /** What was requested. At least one, and every entry has a matching `renders` key. */
  readonly models: readonly ModelId[];
  readonly renders: Readonly<Partial<Record<ModelId, RenderState>>>;
  readonly visibility: Visibility;
  /** Epoch milliseconds. Non-null exactly while `visibility` is `public`. */
  readonly publishedAt: number | null;
  readonly publicAssets: PublicAssets | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

/**
 * One card in the community feed, held in store B and written only by the
 * worker. Every field is derived from what the worker reads back out of the
 * owner's own store, never from a request body (AC-7).
 *
 * It is declared here so the public routes feature 9 builds, and the worker
 * that writes them, share this file's definition rather than drifting apart.
 */
export type FeedEntry = {
  readonly schemaVersion: SchemaVersion;
  readonly projectId: string;
  readonly name: string;
  /** The publisher's Puter username, taken from the session inside the worker. */
  readonly author: string;
  /** Only the models whose render was complete when the entry was written. */
  readonly models: readonly ModelId[];
  readonly renderUrls: Readonly<Partial<Record<ModelId, string>>>;
  readonly floorPlanUrl: string;
  readonly publishedAt: number;
};

/*
 * Ids.
 *
 * A project id sorts by creation time on its own, which is what lets the
 * gallery order by id and lets a feed chunk stay in a meaningful order without
 * a second sort key. The time half is a base36 millisecond timestamp padded to
 * a fixed width: without the padding, the string comparison that gives the free
 * ordering would break the day the timestamp needs one more character. Nine
 * characters carries the scheme well past any horizon worth planning for.
 *
 * The random half exists so two devices creating a project in the same
 * millisecond do not collide. Its characters are drawn from
 * `crypto.getRandomValues`, and bytes at or above 252 are discarded rather than
 * folded in, because 252 is the largest multiple of 36 inside a byte and
 * folding the remainder would quietly favour the first four letters.
 */

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_TIME_LENGTH = 9;
const ID_RANDOM_LENGTH = 8;
const UNBIASED_BYTE_CEILING = 252;

export const PROJECT_ID_PATTERN = /^[0-9a-z]{9}-[0-9a-z]{8}$/;

export const isProjectId = (value: unknown): value is string =>
  typeof value === "string" && PROJECT_ID_PATTERN.test(value);

const drawIdChars = (needed: number, drawn: readonly string[] = []): readonly string[] => {
  if (drawn.length >= needed) return drawn.slice(0, needed);

  const bytes = crypto.getRandomValues(new Uint8Array(needed * 2));
  const usable = Array.from(bytes)
    .filter((byte) => byte < UNBIASED_BYTE_CEILING)
    .map((byte) => ID_ALPHABET.charAt(byte % ID_ALPHABET.length));

  return drawIdChars(needed, [...drawn, ...usable]);
};

/**
 * A fresh, time-sortable project id.
 *
 * `now` is a parameter rather than a hidden read of the clock so the generator
 * stays a pure function of its inputs and can be checked by hand against a
 * fixed timestamp.
 */
export const newProjectId = (now: number = Date.now()): string =>
  `${now.toString(36).padStart(ID_TIME_LENGTH, "0")}-${drawIdChars(ID_RANDOM_LENGTH).join("")}`;

/*
 * Keys.
 *
 * Store A holds one key shape. Store B's `feed:lock` and `feed:cleanup:<id>`
 * are deliberately absent: they are internal to the worker's publish sequence,
 * they carry logic rather than just a name, and they land with feature 9's
 * tasks 4 to 11 alongside the code that uses them.
 */

export const PROJECT_KEY_PREFIX = "project:";

/** Store A: where one project lives in its owner's own store. */
export const projectKey = (id: string): string => `${PROJECT_KEY_PREFIX}${id}`;

/** Store A: the prefix the personal gallery lists against. AC-1. */
export const PROJECT_LIST_PATTERN = `${PROJECT_KEY_PREFIX}*`;

const FEED_CHUNK_DIGITS = 4;
const MAX_FEED_CHUNK = 10 ** FEED_CHUNK_DIGITS - 1;

/**
 * Store B: one chunk of the feed index, zero-padded so chunks sort in order.
 *
 * Throws on a chunk number the padding cannot represent, because a silently
 * truncated key would read and write the wrong chunk rather than fail.
 */
export const feedPageKey = (chunk: number): string => {
  if (!Number.isInteger(chunk) || chunk < 0 || chunk > MAX_FEED_CHUNK) {
    throw new RangeError(`Feed chunk must be an integer between 0 and ${MAX_FEED_CHUNK}.`);
  }
  return `feed:page:${String(chunk).padStart(FEED_CHUNK_DIGITS, "0")}`;
};

/** Store B: which chunk holds a project's entry, so an update needs no scan. */
export const feedWhereKey = (projectId: string): string => `feed:where:${projectId}`;

/** Store B: the one read that tells the feed route where to start. */
export const FEED_META_KEY = "feed:meta";
