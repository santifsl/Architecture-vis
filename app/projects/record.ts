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

/**
 * Bumped only when the stored shape changes, so a later change is detectable
 * rather than guessed.
 *
 * Version 2 is spec 0007: `prompt` left `RenderState` when the reading stage
 * did, so every record written at version 1 carries a field this build no
 * longer understands and is refused on read by `parseProject`. That is the
 * intended outcome, not a regression: a version 1 project simply stops
 * appearing rather than being half read.
 *
 * Version 3 is spec 0011: `revision` on the project and `publishedRevision` on
 * its public assets, which is what turns "the public copy is out of date" into
 * a comparison of two integers instead of two clocks. Unlike the last bump this
 * one is READ TOLERANTLY: a stored version 2 record is upgraded on read rather
 * than refused, because nothing about it is unreadable, it is only missing a
 * counter whose starting value is known. See `parseProject`.
 */
export const SCHEMA_VERSION = 3;
export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * The one older version `parseProject` still understands.
 *
 * Named rather than inlined so the tolerant branch is greppable, and so the day
 * a version 4 arrives it is obvious that this is the thing to think about.
 */
export const UPGRADABLE_SCHEMA_VERSION = 2;

/**
 * The models a project can request. Spec 0002's `ModelId`, as spec 0007 left
 * it: a union of one.
 *
 * The map shape around it, `models` plus `renders` plus `renderUrls`, is
 * deliberately kept rather than collapsed into single fields. Rewriting three
 * invariant functions in the same change that bumps the schema doubles the
 * exposure to the exact defect this file has already been caught by twice, for
 * a benefit that is only tidiness, and feature 9 gets to build against the
 * `FeedEntry` shape it was designed for. It is also the seam a second model
 * comes back through.
 */
export const MODEL_IDS = ["gemini"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const isModelId = (value: unknown): value is ModelId =>
  MODEL_IDS.some((id) => id === value);

/**
 * The statuses one model's render moves through. Each requested model carries
 * its own `RenderState`, which is what keeps the per-model machinery honest for
 * whatever comes back through the seam above.
 */
export const RENDER_STATUSES = [
  "pending",
  "running",
  "complete",
  "failed",
] as const;
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
const LEGAL_RENDER_TRANSITIONS: Readonly<
  Record<RenderStatus, readonly RenderStatus[]>
> = {
  pending: ["running"],
  running: ["complete", "failed"],
  complete: ["pending"],
  failed: ["pending"],
};

export const isLegalRenderTransition = (
  from: RenderStatus,
  to: RenderStatus,
): boolean =>
  from === to || LEGAL_RENDER_TRANSITIONS[from].some((status) => status === to);

/** One model's render. Embedded in the project, one per requested model. */
export type RenderState = {
  readonly status: RenderStatus;
  /** The `puter.fs` path, set when the status reaches `complete`. */
  readonly path: string | null;
  /**
   * The public, non-expiring URL of the hosted copy, written at publish time.
   * Null for the whole of feature 6 and until feature 9 publishes the project.
   *
   * Spec 0006 corrected spec 0002 here, the same correction spec 0005 made to
   * `FloorPlan`: a render is identified by its path, and a URL that displays it
   * is minted on demand and never stored. This field is the OTHER kind of URL,
   * the hosted copy that does not expire, which is why it survives when
   * `FloorPlan.url` did not. `checkProject` no longer requires it on a complete
   * render, because requiring it would make every render this feature produces
   * illegal to store.
   */
  readonly url: string | null;
  /** A short internal code. Never a provider message, per the project's rule that nothing raw reaches a screen. */
  readonly errorCode: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
};

/**
 * The uploaded plan, as feature 5's `puter.fs` write leaves it.
 *
 * Path only, deliberately. Spec 0005 corrected spec 0002 here: `puter.fs.write`
 * returns no URL, and the only anonymous URL the SDK offers, `getReadURL`,
 * expires. A URL stored beside the path would go stale on a timer and the
 * symptom would be a gallery of broken images a day after upload, a long way
 * from its cause. The path never expires, so it is the thing worth keeping, and
 * `app/upload/store.ts` mints a short lived view URL whenever a screen needs
 * one.
 *
 * `PublicAssets.floorPlanUrl` is a different field and is still a real stored
 * URL: it is the hosted copy the worker writes at publish time, which does not
 * expire.
 */
export type FloorPlan = {
  readonly path: string;
};

export type Visibility = "private" | "public";

/**
 * The public copies of a published project's images, written by the client from
 * the publish response. Non-null exactly while the project is public.
 *
 * `renderUrls` holds one entry per model that had a complete render at the
 * moment of publishing, which is why it is partial: publishing a project whose
 * render is still running produces an entry for no model at all.
 */
export type PublicAssets = {
  readonly floorPlanUrl: string;
  readonly renderUrls: Readonly<Partial<Record<ModelId, string>>>;
  /**
   * The project's `revision` at the moment the worker built the live public
   * copy. Spec 0011: the owner's view is out of date exactly when this differs
   * from `Project.revision`, which is why neither side reads a clock.
   */
  readonly publishedRevision: number;
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
  /**
   * Epoch milliseconds, written once by the client at the moment it decides to
   * publish, and never rewritten. Spec 0011: it is the feed's sort position and
   * the date a card shows, never one side of a comparison, which is what makes
   * the client's own clock an acceptable source for it. A republish leaves it
   * alone, so a renamed project keeps its place in the feed.
   *
   * Non-null whenever the project is public. It can also outlive the project
   * being public, for the moment between an unpublish writing `visibility` and
   * the worker confirming, because the worker needs it to derive the key it is
   * deleting. See `checkVisibility` in `invariants.ts`.
   */
  readonly publishedAt: number | null;
  readonly publicAssets: PublicAssets | null;
  /**
   * How many CONTENT changes this project has had. Spec 0011.
   *
   * Content means `name` or `renders`, and nothing else: a `visibility`,
   * `publishedAt` or `publicAssets` write must leave this alone, or committing
   * a publish would immediately invalidate the publish it just committed.
   * `updateProject` is the only thing that moves it, and it never goes down.
   */
  readonly revision: number;
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
  /** The owner's `revision` this entry was built from, so a republish can be told from a stale answer. */
  readonly publishedRevision: number;
};

/*
 * Ids.
 *
 * A project id sorts by creation time on its own, which is what lets the
 * gallery order by id with no second sort field. The feed does not use it: it
 * orders by an inverted `publishedAt` instead, because the order that matters
 * there is when something was shared, not when it was made. The time half is a
 * base36 millisecond timestamp padded to
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

const drawIdChars = (
  needed: number,
  drawn: readonly string[] = [],
): readonly string[] => {
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
 * Store A holds one key shape, named here. Store B's keys are named only inside
 * the worker.
 *
 * That asymmetry is deliberate. The worker cannot import this file, so any
 * store B key written here would be a second copy of a string the worker
 * already derives, free to drift out of step unnoticed. `feed:where:<id>`, the
 * pointer the anonymous single project route follows, was mirrored here for
 * exactly one commit and never read from `app/`; it is gone for that reason.
 *
 * Spec 0011 deleted three more of store B's keys outright. `feed:page:<nnnn>`
 * went with the chunked index, `feed:meta` went because the cursor is the whole
 * of `hasMore` and no screen shows a total, and `feed:lock` went because no key
 * in store B is ever read and then written back.
 */

export const PROJECT_KEY_PREFIX = "project:";

/** Store A: where one project lives in its owner's own store. */
export const projectKey = (id: string): string => `${PROJECT_KEY_PREFIX}${id}`;

/** Store A: the prefix the personal gallery lists against. AC-1. */
export const PROJECT_LIST_PATTERN = `${PROJECT_KEY_PREFIX}*`;
