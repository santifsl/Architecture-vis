/**
 * What makes a project record legal. Spec 0002, build task 3.
 *
 * Two jobs, kept apart on purpose:
 *
 *   - `parseProject` narrows something that came back out of the key-value
 *     store into a `Project`, or gives up. It answers "is this the right
 *     shape", and it exists because a stored value crosses back into the app as
 *     `unknown`: an older schema version, a half-written record, or a key
 *     someone wrote by hand all arrive down the same path as a good one.
 *   - `checkProject` answers "is this record self-consistent", the spec's key
 *     invariants. It runs on the way in, before a write, so a broken record is
 *     refused rather than stored.
 *
 * Everything here is a pure function of its arguments, so the store module can
 * call them without setting anything up, and so they can be checked by hand.
 * They return findings rather than throwing, because the store turns a finding
 * into a plain sentence and never lets an exception reach a screen (AC-14).
 */
import {
  isModelId,
  isProjectId,
  isRenderStatus,
  MODEL_IDS,
  SCHEMA_VERSION,
  UPGRADABLE_SCHEMA_VERSION,
  type ModelId,
  type Project,
  type PublicAssets,
  type RenderState,
} from "~/projects/record";

/** 1 to 80 characters after trimming, per spec 0002's field table. */
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 80;

/**
 * The store's own ceilings, in bytes.
 *
 * The spec quotes 1 KB and 400 KB. The installed SDK actually refuses a value
 * at `399 * 1024`, so that is the number checked here: the point of checking at
 * all is to produce a plain sentence before the SDK throws its own error, and a
 * ceiling one kilobyte above the real one would let exactly the failing case
 * through. The SDK's own guard only measures `.length`, which an object does
 * not have, so a project record is never actually measured by it. This is.
 */
export const MAX_KEY_BYTES = 1024;
export const MAX_VALUE_BYTES = 399 * 1024;

/** A single broken rule. `rule` is for a developer, never for a person to read. */
export type Violation = {
  readonly rule: string;
  readonly detail: string;
};

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isNullableTimestamp = (value: unknown): value is number | null =>
  value === null || isTimestamp(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** A counter that only ever goes up: `revision` and `publishedRevision`. */
const isCounter = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/*
 * Structural narrowing: is this the right shape?
 */

/**
 * Spec 0007 removed `prompt`, and this is the half that enforces the shape at
 * runtime. A field added to the type but not to this function, or left here
 * after leaving the type, does not fail to compile:
 * it makes `parseProject` return `null` for every stored record, so every
 * project reads as unreadable and the gallery is simply empty. Spec 0005 was
 * caught by exactly this on `FloorPlan.url`. The type and this parser change
 * together, or the change is not done.
 */
const parseRenderState = (value: unknown): RenderState | null => {
  if (!isRecordValue(value)) return null;

  const { status, path, url, errorCode, startedAt, finishedAt } = value;
  if (!isRenderStatus(status)) return null;
  if (
    !isNullableString(path) ||
    !isNullableString(url) ||
    !isNullableString(errorCode)
  )
    return null;
  if (!isNullableTimestamp(startedAt) || !isNullableTimestamp(finishedAt))
    return null;

  return { status, path, url, errorCode, startedAt, finishedAt };
};

/**
 * Narrows a map keyed by model id. Any key that is not a model id, or any value
 * the element parser rejects, fails the whole map rather than being dropped:
 * silently discarding half a record would hand the app a project that looks
 * fine and is missing a render.
 */
const parseModelMap = <T>(
  value: unknown,
  parseElement: (element: unknown) => T | null,
): Readonly<Partial<Record<ModelId, T>>> | null => {
  if (!isRecordValue(value)) return null;

  const parsed = Object.entries(value).map(([key, element]) => {
    if (!isModelId(key)) return null;
    const model = parseElement(element);
    return model === null ? null : ([key, model] as const);
  });

  if (parsed.some((entry) => entry === null)) return null;
  return Object.fromEntries(parsed.filter((entry) => entry !== null));
};

const parseString = (value: unknown): string | null =>
  isNonEmptyString(value) ? value : null;

const parsePublicAssets = (value: unknown): PublicAssets | null => {
  if (!isRecordValue(value)) return null;

  const { floorPlanUrl, renderUrls, publishedRevision } = value;
  if (!isNonEmptyString(floorPlanUrl)) return null;
  if (!isCounter(publishedRevision)) return null;

  const urls = parseModelMap(renderUrls, parseString);
  if (urls === null) return null;

  return { floorPlanUrl, renderUrls: urls, publishedRevision };
};

const parseModels = (value: unknown): readonly ModelId[] | null => {
  if (!Array.isArray(value)) return null;
  // `Array.isArray` on an `unknown` widens to `any[]`, which would make the
  // cast below vacuous. Restating the element type as `unknown` keeps the
  // guard doing the narrowing.
  const items: readonly unknown[] = value;
  return items.every(isModelId) ? items : null;
};

/**
 * Spec 0005 dropped `url` from `FloorPlan`, and this parser is the half that
 * enforced it at runtime. Requiring a field the writer no longer produces does
 * not fail to compile: it makes `parseProject` return `null` for every record,
 * so `readProject` reports each project unreadable and `listProjects` skips
 * them all, and the gallery is simply empty. Whenever the stored shape changes,
 * this function changes with the type or the change is not done.
 */
const parseFloorPlan = (value: unknown): Project["floorPlan"] | null => {
  if (!isRecordValue(value)) return null;
  const { path } = value;
  return isNonEmptyString(path) ? { path } : null;
};

/**
 * Turns a stored value back into a `Project`, or `null` if it is not one.
 *
 * A record written by a FUTURE schema version lands on `null` here rather than
 * being coerced, which is the point of storing `schemaVersion` at all: reading
 * a shape this build does not understand is a refusal, not a guess.
 *
 * Spec 0011 adds the other direction, and it is deliberately not symmetrical. A
 * stored version 2 record is upgraded rather than refused, because this build
 * understands every field it holds and the only thing missing is a counter
 * whose starting value is known. Refusing it instead would empty a gallery of
 * every project made before this change, for no gain (AC-21).
 *
 * The upgrade sets `revision` to `0` and `publicAssets` to `null`. Clearing the
 * assets is the deliberate half: feature 9 has never shipped, so no version 2
 * record can legitimately carry a live public copy, and a record that somehow
 * does is carrying assets with no `publishedRevision` to compare against.
 * Forcing a clean republish beats trusting a field that cannot exist. Nothing
 * is stranded by it, because a version 2 record cannot have a feed entry either.
 *
 * The upgrade is a read. Nothing is written back until the project is next
 * changed for some other reason, which is the lazy write half of spec 0011's
 * migration plan.
 */
export const parseProject = (value: unknown): Project | null => {
  if (!isRecordValue(value)) return null;

  const {
    schemaVersion,
    id,
    name,
    owner,
    floorPlan,
    models,
    renders,
    visibility,
    publishedAt,
    publicAssets,
    revision,
    createdAt,
    updatedAt,
  } = value;

  const upgrading = schemaVersion === UPGRADABLE_SCHEMA_VERSION;
  if (schemaVersion !== SCHEMA_VERSION && !upgrading) return null;
  if (!isProjectId(id)) return null;
  if (typeof name !== "string" || !isNonEmptyString(owner)) return null;
  if (visibility !== "private" && visibility !== "public") return null;
  if (!isTimestamp(createdAt) || !isTimestamp(updatedAt)) return null;
  if (!isNullableTimestamp(publishedAt)) return null;
  // A version 2 record has no `revision` at all, and that is the whole of what
  // makes it a version 2 record. A version 3 one must carry a real counter.
  const counter = isCounter(revision) ? revision : null;
  if (!upgrading && counter === null) return null;

  const plan = parseFloorPlan(floorPlan);
  const requested = parseModels(models);
  const renderStates = parseModelMap(renders, parseRenderState);
  if (plan === null || requested === null || renderStates === null) return null;

  const stored =
    publicAssets === null || publicAssets === undefined
      ? null
      : parsePublicAssets(publicAssets);
  if (!upgrading && publicAssets !== null && stored === null) return null;

  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    owner,
    floorPlan: plan,
    models: requested,
    renders: renderStates,
    visibility,
    publishedAt,
    publicAssets: upgrading ? null : stored,
    // Non-null above whenever this is not an upgrade, so the fallback is only
    // ever the upgrade's own starting value.
    revision: upgrading ? 0 : (counter ?? 0),
    createdAt,
    updatedAt,
  };
};

/*
 * Semantic checks: is this record self-consistent?
 */

const checkName = (project: Project): readonly Violation[] => {
  const trimmed = project.name.trim();
  if (trimmed.length < NAME_MIN_LENGTH) {
    return [{ rule: "name.length", detail: "A project name cannot be blank." }];
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return [
      {
        rule: "name.length",
        detail: `A project name is at most ${NAME_MAX_LENGTH} characters; this one is ${trimmed.length}.`,
      },
    ];
  }
  return [];
};

/**
 * `renders` holds exactly one key per entry in `models`, and no others.
 *
 * This is what backs AC-2 at the record level: a model that was requested
 * always has somewhere for its own status to live, and a model that was not
 * requested can never acquire one.
 */
const checkRendersMatchModels = (project: Project): readonly Violation[] => {
  const requested = new Set<string>(project.models);
  const tracked = new Set(Object.keys(project.renders));

  const missing = [...requested].filter((model) => !tracked.has(model));
  const extra = [...tracked].filter((model) => !requested.has(model));

  return [
    ...(project.models.length === 0
      ? [
          {
            rule: "models.empty",
            detail: "A project has to request at least one model.",
          },
        ]
      : []),
    ...(requested.size !== project.models.length
      ? [
          {
            rule: "models.duplicate",
            detail: "A model can only be requested once.",
          },
        ]
      : []),
    ...(missing.length > 0
      ? [
          {
            rule: "renders.missing",
            detail: `No render state for ${missing.join(", ")}.`,
          },
        ]
      : []),
    ...(extra.length > 0
      ? [
          {
            rule: "renders.extra",
            detail: `Render state for a model that was not requested: ${extra.join(", ")}.`,
          },
        ]
      : []),
  ];
};

/**
 * A complete render carries the thing that makes it complete: a stored image.
 *
 * Without this a render can read as finished while holding no image, which is
 * the state the gallery and the publish path would both then have to guess at.
 *
 * It used to demand a `url` as well, and spec 0006 corrected that. `url` is the
 * public hosted copy feature 9 writes at publish time, so requiring it on every
 * complete render would make every render feature 6 produces illegal to store,
 * and the symptom would be an `invalid` refusal on the write that finishes a
 * render rather than anything naming the real rule. The path is what proves an
 * image exists; the URL proves something about publishing, which is checked by
 * `checkPublicAssets` where it belongs.
 */
const checkRenderStates = (project: Project): readonly Violation[] =>
  MODEL_IDS.flatMap((model) => {
    const render = project.renders[model];
    if (render === undefined) return [];
    if (render.status !== "complete") return [];
    return render.path === null
      ? [
          {
            rule: "renders.complete",
            detail: `The ${model} render is complete but has no stored image.`,
          },
        ]
      : [];
  });

/**
 * Publishing state agrees with itself, which is most of AC-13.
 *
 * Spec 0011 loosened this, and the loosening is the point rather than a
 * concession. It used to demand that `publishedAt` and `publicAssets` were both
 * set exactly when the project was public, which is a rule only a publish that
 * happens all at once can keep. Publishing is not atomic: it writes the owner's
 * intent, calls the worker, and commits the response, and a browser can close
 * between any two of those. So there are two legal disagreements now, both of
 * them transient states of a sequence in progress, and both of them pointing
 * the safe way:
 *
 *   - **public with no `publicAssets`**, the uncommitted state. The owner asked
 *     for this and their own gallery shows it as out of date with a retry. The
 *     alternative ordering, worker first, would instead leave a live feed card
 *     for a project whose own record reads private, which nobody can repair.
 *   - **private with `publishedAt` or `publicAssets` still set**, mid unpublish.
 *     The worker needs `publishedAt` to derive the key it is deleting, so those
 *     two fields are cleared only after it confirms (AC-17).
 *
 * What stays a hard rule is the direction that could actually mislead: a public
 * project always carries the timestamp that gives it a place in the feed, and
 * assets never exist without the timestamp that says when they were made.
 */
const checkVisibility = (project: Project): readonly Violation[] => {
  const isPublic = project.visibility === "public";
  const stamped = project.publishedAt !== null;
  const hasAssets = project.publicAssets !== null;

  return [
    ...(isPublic && !stamped
      ? [
          {
            rule: "publishedAt.visibility",
            detail:
              "A public project has no publishedAt, so it has no position in the feed.",
          },
        ]
      : []),
    ...(hasAssets && !stamped
      ? [
          {
            rule: "publicAssets.publishedAt",
            detail:
              "publicAssets is set on a project that was never stamped as published.",
          },
        ]
      : []),
  ];
};

/**
 * `revision` is a counter, and the freshness rule is only as good as it is.
 *
 * `parseProject` already refuses a stored record whose counter is not one, so
 * this catches the other direction: a record built in memory by the store and
 * about to be written. Both halves matter, because the value is arithmetic
 * rather than something a person typed, and arithmetic that has gone wrong
 * shows up as a project permanently stale rather than as anything failing.
 */
const checkRevision = (project: Project): readonly Violation[] =>
  Number.isInteger(project.revision) && project.revision >= 0
    ? []
    : [
        {
          rule: "revision.counter",
          detail: `revision must be a whole number of zero or more; it is ${project.revision}.`,
        },
      ];

/**
 * Every public URL points at the app's own hosted subdomain over https.
 *
 * This is the client's half of AC-11's URL shape rule. The exact subdomain is a
 * worker-side constant the browser deliberately does not hold (spec 0002:
 * public URLs are read off the record, never composed here), so what can be
 * checked here is the scheme and the host suffix. The worker checks the exact
 * subdomain when it writes the entry, which is the side that matters for the
 * feed, and this side catches a URL that never came from the worker at all.
 */
const PUBLIC_HOST_SUFFIX = ".puter.site";

const isPublicAssetUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.hostname.endsWith(PUBLIC_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
};

const checkPublicAssets = (project: Project): readonly Violation[] => {
  const assets = project.publicAssets;
  if (assets === null) return [];

  const complete = new Set(
    MODEL_IDS.filter((model) => project.renders[model]?.status === "complete"),
  );

  const urls: readonly (readonly [string, string])[] = [
    ["floorPlanUrl", assets.floorPlanUrl],
    ...MODEL_IDS.flatMap((model) => {
      const url = assets.renderUrls[model];
      return url === undefined ? [] : [[`renderUrls.${model}`, url] as const];
    }),
  ];

  const badShape = urls
    .filter(([, url]) => !isPublicAssetUrl(url))
    .map(([field]) => ({
      rule: "publicAssets.url",
      detail: `${field} is not an https ${PUBLIC_HOST_SUFFIX} URL.`,
    }));

  const unbacked = MODEL_IDS.filter(
    (model) => assets.renderUrls[model] !== undefined && !complete.has(model),
  ).map((model) => ({
    rule: "publicAssets.unbacked",
    detail: `A public URL for ${model}, whose render is not complete.`,
  }));

  // Present exactly when the assets are, which the type says and this proves
  // for a record built in memory. Without a counter to compare against, the
  // project would read as permanently fresh no matter what changed under it.
  const counter =
    Number.isInteger(assets.publishedRevision) && assets.publishedRevision >= 0
      ? []
      : [
          {
            rule: "publicAssets.publishedRevision",
            detail: `publishedRevision must be a whole number of zero or more; it is ${assets.publishedRevision}.`,
          },
        ];

  return [...badShape, ...unbacked, ...counter];
};

const checkTimestamps = (project: Project): readonly Violation[] =>
  project.updatedAt < project.createdAt
    ? [{ rule: "timestamps.order", detail: "updatedAt is before createdAt." }]
    : [];

/**
 * Every key invariant the store enforces on a project, in one call.
 *
 * An empty array means the record is legal. The store refuses to write anything
 * that returns findings, so a broken record is never what is stored.
 */
export const checkProject = (project: Project): readonly Violation[] => [
  ...checkName(project),
  ...checkRendersMatchModels(project),
  ...checkRenderStates(project),
  ...checkVisibility(project),
  ...checkPublicAssets(project),
  ...checkRevision(project),
  ...checkTimestamps(project),
];

/*
 * Size, checked before the write leaves.
 */

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

/**
 * Does this key-and-value pair fit inside the store's ceilings?
 *
 * Measured in bytes rather than characters, because the store's limit is in
 * bytes and a project name in a non-Latin script costs more than one byte a
 * character. The value is measured as JSON because that is what the store
 * receives.
 */
export const checkWriteSize = (
  key: string,
  value: unknown,
): readonly Violation[] => {
  const keyBytes = byteLength(key);
  const valueBytes = byteLength(JSON.stringify(value) ?? "");

  return [
    ...(keyBytes > MAX_KEY_BYTES
      ? [
          {
            rule: "size.key",
            detail: `Key is ${keyBytes} bytes; the limit is ${MAX_KEY_BYTES}.`,
          },
        ]
      : []),
    ...(valueBytes > MAX_VALUE_BYTES
      ? [
          {
            rule: "size.value",
            detail: `Value is ${valueBytes} bytes; the limit is ${MAX_VALUE_BYTES}.`,
          },
        ]
      : []),
  ];
};
