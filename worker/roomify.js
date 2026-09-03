/**
 * Roomify's serverless worker. Spec 0006, build tasks 1 and 2.
 *
 * This file runs on Puter's worker runtime, not in the browser and not in this
 * repository's build. It is plain JavaScript on purpose: a worker is deployed
 * as a single source file, so there is no bundler, no TypeScript, and no import
 * of anything from `app/`. It is also the one thing in this system with no
 * types, no build, and no local run, which is why the client parses its answers
 * rather than trusting them (`parseRenderResponse` in `app/render/store.ts`).
 *
 * What it does, and the whole of it: takes an absolute path to a floor plan and
 * an absolute path to write to, hands the plan to one image model with one
 * pinned instruction, and answers with the path it wrote. It holds no state,
 * writes no key, and touches no file outside the `out` it was handed. Every
 * invariant about a project lives in the client, which is spec 0006's
 * single-writer rule.
 *
 * Spec 0007 collapsed this from two provider calls to one. There used to be a
 * reading stage, a chat model writing a paragraph about the space, and a second
 * image model painting that paragraph, so that two models could be compared on
 * how they READ a plan. With one model there is nothing to compare, and prose
 * turned out to be the wrong channel for geometry anyway: a paragraph cannot say
 * where a wall is. The plan itself goes to the model instead.
 *
 * Everything here runs as `user.puter`, the CALLER's own Puter, so every model
 * call is billed to the person who asked for it and every file touched is their
 * own. There is no API key anywhere in this system and none to leak.
 */

/**
 * The one model, and the only provider call a render makes. Spec 0007.
 *
 * Picked by spec 0006's own model rule applied to `txt2img`'s image list rather
 * than to the chat list: a native `google:` provider prefix rather than a
 * router, not a preview, and the nearest generation rather than the newest. The
 * newer Gemini image ids on that list are all previews, so the rule excludes
 * them and their weights cannot move under a render.
 */
const RENDER_MODEL = "google:google/gemini-2.5-flash-image";

/**
 * Which model each `ModelId` means.
 *
 * A map with one entry rather than a hardcoded comparison. It says the same
 * thing today and it keeps the guard below reading as "a model this worker
 * understands", which is the seam a second model comes back through.
 */
const RENDER_MODELS = {
  gemini: RENDER_MODEL,
};

/**
 * What the model is asked for, verbatim. Spec 0007, AC-3.
 *
 * Pinned here rather than built per request, and nothing is appended to it or
 * interpolated into it: AC-2 and AC-3 cannot be checked without knowing exactly
 * what was asked, and a prompt assembled at call time is a prompt nobody can
 * check. The typographic characters in it are part of the pasted text and are
 * kept as they are.
 */
const RENDER_PROMPT = `TASK: Convert the input 2D floor plan into a **photorealistic, top‑down 3D architectural render**.
STRICT REQUIREMENTS (do not violate):
1) **REMOVE ALL TEXT**: Do not render any letters, numbers, labels, dimensions, or annotations. Floors must be continuous where text used to be.
2) **GEOMETRY MUST MATCH**: Walls, rooms, doors, and windows must follow the exact lines and positions in the plan. Do not shift or resize.
3) **TOP‑DOWN ONLY**: Orthographic top‑down view. No perspective tilt.
4) **CLEAN, REALISTIC OUTPUT**: Crisp edges, balanced lighting, and realistic materials. No sketch/hand‑drawn look.
5) **NO EXTRA CONTENT**: Do not add rooms, furniture, or objects that are not clearly indicated by the plan.
STRUCTURE & DETAILS:
- **Walls**: Extrude precisely from the plan lines. Consistent wall height and thickness.
- **Doors**: Convert door swing arcs into open doors, aligned to the plan.
- **Windows**: Convert thin perimeter lines into realistic glass windows.
FURNITURE & ROOM MAPPING (only where icons/fixtures are clearly shown):
- Bed icon → realistic bed with duvet and pillows.
- Sofa icon → modern sectional or sofa.
- Dining table icon → table with chairs.
- Kitchen icon → counters with sink and stove.
- Bathroom icon → toilet, sink, and tub/shower.
- Office/study icon → desk, chair, and minimal shelving.
- Porch/patio/balcony icon → outdoor seating or simple furniture (keep minimal).
- Utility/laundry icon → washer/dryer and minimal cabinetry.
STYLE & LIGHTING:
- Lighting: bright, neutral daylight. High clarity and balanced contrast.
- Materials: realistic wood/tile floors, clean walls, subtle shadows.
- Finish: professional architectural visualization; no text, no watermarks, no logos.`;

/** The two directories this worker will touch, and the only two. */
const PLANS_SEGMENT = "/plans/";
const RENDERS_SEGMENT = "/renders/";

/** The extensions the client can have stored, mapped to what an image model needs told. */
const MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/*
 * Answers. A failure carries a code and never a message: no provider text, no
 * exception, and no HTTP status from anywhere in between ever reaches a screen,
 * so none of it is put in the body in the first place (AC-9). The client turns a
 * code into a sentence in `app/render/failures.ts`.
 */

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Every code here is one the client already knows, from spec 0006's failure
 * vocabulary. The worker deliberately invents none of its own: a code with no
 * sentence behind it would reach `app/render/failures.ts`, miss, and land on
 * "something unexpected", which is a worse answer than the one it had.
 *
 * So a lost session answers `signedOut`, the code the client also decides for
 * itself when it notices the same thing, and a path the guard refuses answers
 * `badRequest`, because a caller cannot cause it by anything they did on screen
 * and it means the request was malformed.
 */
const refuse = (errorCode, status) => json({ errorCode }, status);

/*
 * The path guard (AC-12).
 *
 * A relative Puter path resolves against the CALLING APP's data directory, and
 * a worker runs under its own app identity, so `plans/x.png` in here is not the
 * file the client wrote. Every path crossing this boundary is absolute, and a
 * relative one is refused outright rather than read as whatever it resolves to.
 *
 * The guard is not the only thing standing between two people's files: the
 * worker acts as the caller, so it can only ever reach that person's own
 * storage whatever it is handed. What it does stop is a caller asking the worker
 * to overwrite one of their OWN unrelated files, which is a mistake worth
 * refusing rather than performing.
 */
const isSafeAbsolutePath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.startsWith("/") &&
  !value.includes("//") &&
  !value.split("/").some((segment) => segment === ".." || segment === ".");

/**
 * Do these two paths belong together, and is each one where it is allowed to be?
 *
 * `out` has to share the plan's app data root and sit directly under
 * `renders/`, so the answer to a render can only ever land beside the plan it
 * came from. The root is taken from the plan rather than parsed out of `out`,
 * which is what makes it impossible to name a root of your choosing.
 */
const checkPaths = (plan, out) => {
  if (!isSafeAbsolutePath(plan) || !isSafeAbsolutePath(out)) return false;

  const marker = plan.lastIndexOf(PLANS_SEGMENT);
  if (marker < 0) return false;

  const planFile = plan.slice(marker + PLANS_SEGMENT.length);
  if (planFile.length === 0 || planFile.includes("/")) return false;

  const root = plan.slice(0, marker);
  if (!out.startsWith(root + RENDERS_SEGMENT)) return false;

  const outFile = out.slice(root.length + RENDERS_SEGMENT.length);
  return outFile.length > 0 && !outFile.includes("/");
};

/*
 * Reading the plan.
 *
 * Spec 0006 said to hand the plan to the model by `puter_path`. The installed
 * SDK disproved that and this is the corrected version: `txt2img`'s
 * `input_image` wants base64 or a data URI. So the bytes are read here, once,
 * and that data URI is what the model is given. Reading in here rather than
 * minting a URL on the client is what keeps a private file from being handed
 * around as an anonymous link, which is the rule spec 0005 set.
 */

const mimeTypeFor = (path) => {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_TYPES[extension] ?? "image/png";
};

/**
 * Base64, in fixed-size chunks.
 *
 * `String.fromCharCode(...bytes)` on a whole 10 MB image spreads several million
 * arguments across one call and blows the argument limit, which fails as a stack
 * overflow rather than as anything that names the real problem. Chunking keeps
 * every call small.
 */
const CHUNK = 0x8000;

const toBase64 = (bytes) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(offset, offset + CHUNK),
    );
  }
  return btoa(binary);
};

const readPlanAsDataUri = async (puter, plan) => {
  const blob = await puter.fs.read(plan);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${mimeTypeFor(plan)};base64,${toBase64(bytes)}`;
};

/*
 * The render: one call, the plan in and an image out.
 *
 * `puter_output_path` is what makes this a path in, path out worker: the image
 * is written straight into the caller's own storage and the bytes never travel
 * back through here.
 *
 * `quality` and `ratio` are deliberately NOT passed. Whether a Gemini image
 * model honours, ignores or rejects the options `gpt-image-1-mini` accepted is
 * unverified, and an option that gets rejected turns into a `paintFailed` on
 * every single render with nothing in the answer saying why. The frame's own
 * 1:1 with `object-fit: cover` absorbs whatever shape comes back until one real
 * call settles it.
 */
const paintPlan = async (puter, model, planUri, plan, out) => {
  await puter.ai.txt2img({
    prompt: RENDER_PROMPT,
    model: RENDER_MODELS[model],
    input_image: planUri,
    input_image_mime_type: mimeTypeFor(plan),
    puter_output_path: out,
  });
};

/*
 * Turning a provider failure into one of our codes.
 *
 * Everything a provider can say arrives here as an exception of an unknown
 * shape. Two cases are worth telling apart from a general failure, because they
 * mean something different to the person waiting: they are out of allowance, or
 * the model declined the request. Everything else is the stage's own code.
 */
const describeFailure = (error) => {
  const parts = [
    error?.code,
    error?.error?.code,
    error?.status,
    error?.message,
    error?.error?.message,
  ]
    .filter((part) => part !== undefined && part !== null)
    .join(" ")
    .toLowerCase();

  if (
    parts.includes("insufficient") ||
    parts.includes("usage-limited") ||
    parts.includes("usage_limited") ||
    parts.includes("quota") ||
    parts.includes("credit") ||
    parts.includes("402")
  ) {
    return "outOfAllowance";
  }

  if (
    parts.includes("refus") ||
    parts.includes("moderation") ||
    parts.includes("content_policy") ||
    parts.includes("safety")
  ) {
    return "refused";
  }

  return "failed";
};

const isMissingFile = (error) => {
  const parts = [error?.code, error?.status, error?.message]
    .filter((part) => part !== undefined && part !== null)
    .join(" ")
    .toLowerCase();
  return parts.includes("subject_does_not_exist") || parts.includes("404");
};

/**
 * The request body, or null when it is not JSON at all.
 *
 * A helper rather than a `let` filled in from a `catch`, so the handler binds
 * every value it reads once and never reassigns one. A body that IS the literal
 * `null` is not told apart from unparseable, and does not need to be: neither
 * carries a plan, so both leave by the same 400.
 */
const readJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

/**
 * The plan as a data URI, or the status its failure deserves.
 *
 * The status is decided here, next to the error that explains it, so the
 * handler stays a sequence of single-assignment steps: a file that is simply
 * not there is a 404 the client can act on, anything else is a 502.
 */
const readPlan = async (puter, plan) => {
  try {
    return { ok: true, uri: await readPlanAsDataUri(puter, plan) };
  } catch (error) {
    return { ok: false, status: isMissingFile(error) ? 404 : 502 };
  }
};

/**
 * POST /render. The whole feature, in one request.
 *
 * One request per render, awaited by the client: nothing guarantees a
 * serverless worker keeps running after it responds, so a polling job would buy
 * a loop and a second source of truth and still leave the stuck case
 * unanswered.
 */
router.post("/render", async ({ request, user }) => {
  // AC-11. No session means no `user.puter`, so there is nothing to call
  // anything with and nothing is attempted.
  if (!user || !user.puter) return refuse("signedOut", 401);

  const body = await readJsonBody(request);
  if (body === null) return refuse("badRequest", 400);

  const plan = body?.plan;
  const out = body?.out;
  const model = body?.model;

  if (typeof model !== "string" || !(model in RENDER_MODELS)) {
    return refuse("badRequest", 400);
  }
  if (typeof plan !== "string" || typeof out !== "string") {
    return refuse("badRequest", 400);
  }
  // AC-12, refused before a model is ever called, which is the point of doing
  // it here rather than after the expensive part.
  if (!checkPaths(plan, out)) return refuse("badRequest", 403);

  const read = await readPlan(user.puter, plan);
  if (!read.ok) return refuse("planUnreadable", read.status);

  try {
    await paintPlan(user.puter, model, read.uri, plan, out);
  } catch (error) {
    const kind = describeFailure(error);
    if (kind === "outOfAllowance") return refuse("outOfAllowance", 507);
    return refuse(kind === "refused" ? "paintRefused" : "paintFailed", 502);
  }

  // The path is echoed back only now, after the write succeeded, which is what
  // makes "complete implies an image exists" true by construction rather than
  // by hope.
  return json({ path: out }, 200);
});

/* ==========================================================================
 * Publishing, and the community feed. Spec 0011, build tasks 4, 5 and 7.
 *
 * Everything above this line runs as `user.puter`, the caller's own Puter, and
 * touches nothing but the file it was handed. Everything below it uses TWO
 * identities on purpose, and which one does what is the whole security model:
 *
 *   - `user.puter`, the CALLER. Every fact about a project is read back through
 *     it, never taken from a request body (AC-7), and the plan and render bytes
 *     are read as the person who owns them. A caller who cannot read a record is
 *     a caller who cannot publish it, with no separate permission check needed.
 *   - `me.puter`, the APP itself. It owns the public copies, the subdomain over
 *     them, and store B, the feed index. An anonymous visitor holds no
 *     credential of any kind, so the feed can only be served out of a store the
 *     app owns and only the app can write.
 *
 * The worker still owns no project state. It writes store B, which is derived
 * from records it read, and the owner's own record stays the system of record
 * and is written only by the client (spec 0002's single writer rule).
 * ========================================================================== */

/**
 * The app's public host, and the directory it serves.
 *
 * `PUBLIC_SUBDOMAIN` is a name in ONE GLOBAL NAMESPACE across all of Puter, the
 * same trap `WORKER_NAME` in `scripts/deploy-worker.mjs` already paid for, so it
 * carries the project prefix rather than being anything a stranger is likely to
 * hold. Changing it after anything is published orphans every URL already
 * written into a record, so treat it as fixed.
 *
 * `PUBLIC_ROOT` is app RELATIVE, and that is not a style choice: spec 0011's
 * task 4 probe found that only relative paths resolve inside the app's root
 * (`~/AppData/<appId>`) and every absolute one failed, `createMissingParents`
 * included, because that flag creates parents under a root it can resolve and
 * cannot invent the filesystem root.
 *
 * The spec's data model writes store C's paths as `/<projectId>/...` relative to
 * that app root, with the subdomain served from the root itself. This binds the
 * subdomain to a dedicated `public` directory one level down instead, which
 * produces the identical public URL and keeps everything else the app account
 * ever writes out of a directory that is served to the world. The URL shape the
 * record stores, and everything the client checks about it, is unchanged.
 */
const PUBLIC_SUBDOMAIN = "architecture-vis-public";
const PUBLIC_ROOT = "public";
const PUBLIC_ORIGIN = `https://${PUBLIC_SUBDOMAIN}.puter.site`;

/*
 * Store B's two keys. Spec 0011 deleted the other three: no chunk, no meta, no
 * lock. Both of these are only ever written WHOLE and never read then written
 * back, which is the invariant that replaces the lock and the first thing to
 * check if anyone is ever tempted to add a counter here.
 */
const FEED_ENTRY_PREFIX = "feed:entry:";
const FEED_ENTRY_PATTERN = "feed:entry:*";

const feedWhereKey = (projectId) => `feed:where:${projectId}`;

/**
 * The sort key: an inverted `publishedAt`, so plain key order is newest first
 * and `kv.list` needs no sort of its own.
 *
 * Padded to a fixed width, for the same reason a project id pads its timestamp:
 * without it the string comparison that gives the free ordering breaks the day
 * the number needs one more character. 10^13 sits above any epoch millisecond
 * value this side of the year 2286, so the subtraction never goes negative.
 */
const SORT_KEY_CEILING = 10 ** 13;
const SORT_KEY_LENGTH = 13;

const sortKeyFor = (publishedAt) =>
  String(SORT_KEY_CEILING - publishedAt).padStart(SORT_KEY_LENGTH, "0");

const feedEntryKey = (sortKey, projectId) =>
  `${FEED_ENTRY_PREFIX}${sortKey}:${projectId}`;

/** Store A's key, so the worker can read a record back as its owner. */
const projectKey = (projectId) => `project:${projectId}`;

/**
 * The schema version an entry is written at, and the one the client parses.
 *
 * Duplicated from `app/projects/record.ts` rather than imported, because a
 * worker is deployed as a single source file and can import nothing from
 * `app/`. That duplication is the standing cost of this boundary; the client
 * parses whatever comes back rather than trusting it, which is what keeps the
 * two disagreeing loudly instead of silently.
 */
const FEED_SCHEMA_VERSION = 3;

/** A page of the feed, and the most anyone may ask for in one request (AC-12). */
const FEED_PAGE_DEFAULT = 24;
const FEED_PAGE_MAX = 48;

/** The store's real value ceiling, the same number `app/projects/invariants.ts` uses. */
const MAX_VALUE_BYTES = 399 * 1024;

/** Mirrors `PROJECT_ID_PATTERN` in `app/projects/record.ts`. */
const PROJECT_ID_PATTERN = /^[0-9a-z]{9}-[0-9a-z]{8}$/;

const isProjectId = (value) =>
  typeof value === "string" && PROJECT_ID_PATTERN.test(value);

/**
 * The app scoped Puter, under whichever name this runtime injects it.
 *
 * Both spellings, kept from spec 0011's task 1 probe that established this
 * surface exists at all: `me` may be a true global or a binding in the wrapper
 * scope, so it is read directly as well as off `globalThis`. A `null` here is
 * not a caller's fault and is never their failure, it is the app's own identity
 * being unavailable, which is why both routes below answer 503 rather than 4xx.
 */
const appPuter = () => {
  const injected = typeof me !== "undefined" ? me : globalThis.me;
  return injected && injected.puter ? injected.puter : null;
};

/*
 * Reading the record back, as its owner.
 *
 * AC-7 in one function: every field of a feed entry comes from here, and the
 * request body carries nothing but a project id. A caller asking about someone
 * else's project reads nothing, because `user.puter` is their own store and
 * holds no key for it, so "you may only publish your own" needs no separate
 * check.
 */
const readRecord = async (userPuter, projectId) => {
  try {
    const stored = await userPuter.kv.get(projectKey(projectId));
    return stored === undefined || stored === null ? null : stored;
  } catch {
    return null;
  }
};

const isRecordValue = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCounter = (value) => Number.isInteger(value) && value >= 0;

/**
 * Is this stored value the shape a publish can be built from? AC-11.
 *
 * Deliberately narrower than `checkProject` on the client and deliberately not a
 * second copy of it: this checks only the fields an entry is actually built
 * from, so a record that is legal on the client and unusable here is impossible
 * rather than merely unlikely. Answers `null` when the record is fine, and the
 * name of the first broken rule otherwise, which the handler turns into a 422.
 */
const checkPublishable = (record, projectId) => {
  if (!isRecordValue(record)) return "record";
  if (record.schemaVersion !== FEED_SCHEMA_VERSION) return "schemaVersion";
  if (record.id !== projectId) return "id";
  if (typeof record.name !== "string" || record.name.trim().length === 0)
    return "name";
  if (typeof record.owner !== "string" || record.owner.length === 0)
    return "owner";
  if (!isRecordValue(record.floorPlan)) return "floorPlan";
  if (
    typeof record.floorPlan.path !== "string" ||
    record.floorPlan.path.length === 0
  )
    return "floorPlan.path";
  if (!Array.isArray(record.models) || record.models.length === 0)
    return "models";
  if (record.models.some((model) => !(model in RENDER_MODELS))) return "models";
  if (!isRecordValue(record.renders)) return "renders";
  if (!isCounter(record.publishedAt)) return "publishedAt";
  if (!isCounter(record.revision)) return "revision";
  return null;
};

/**
 * The models whose render is finished and has a file behind it.
 *
 * Both halves matter. A `complete` status with no path is a record the client
 * should never have written, and copying from a null path would fail three
 * steps later with nothing saying why.
 */
const completeRenders = (record) =>
  record.models.filter((model) => {
    const render = record.renders[model];
    return (
      isRecordValue(render) &&
      render.status === "complete" &&
      typeof render.path === "string" &&
      render.path.length > 0
    );
  });

/*
 * Store C: the public copies.
 *
 * Paths are a pure function of the project id and the source extension (AC-18),
 * so a republish overwrites exactly what it wrote last time and an unpublish can
 * derive what to delete without any manifest being kept anywhere.
 */

const extensionOf = (path) =>
  path.slice(path.lastIndexOf(".") + 1).toLowerCase();

const publicPath = (projectId, name, extension) =>
  `${PUBLIC_ROOT}/${projectId}/${name}.${extension}`;

const publicUrl = (projectId, name, extension) =>
  `${PUBLIC_ORIGIN}/${projectId}/${name}.${extension}`;

/**
 * Reads one file as the caller and writes it as the app, returning its public
 * URL.
 *
 * The bytes cross identities through this process, which spec 0011's task 4
 * probe proved works with no grant, no copy driver and no re-encode: a 46 KB
 * JPEG came back byte for byte from its public URL first try. An unknown
 * extension is refused rather than defaulted, because a defaulted extension
 * would produce a URL whose name does not match its bytes and no later
 * unpublish could derive it.
 */
const copyToPublic = async (userPuter, mePuter, projectId, source, name) => {
  const extension = extensionOf(source);
  if (!(extension in MIME_TYPES)) return null;

  const blob = await userPuter.fs.read(source);
  await mePuter.fs.write(publicPath(projectId, name, extension), blob, {
    overwrite: true,
    createMissingParents: true,
  });

  return publicUrl(projectId, name, extension);
};

/**
 * Makes sure the public subdomain exists and points at the served directory.
 *
 * Idempotent, and on a path already doing real work, so it costs one list per
 * publish and nothing at all on any other request. Spec 0011 and spec 0002 both
 * said a person had to create this by hand once in a browser; the task 4 probe
 * proved otherwise, so it is code rather than a checklist item nobody would
 * remember on a fresh deploy.
 *
 * Ownership is read from `list()` and NEVER from `get()`, per `worker/AGENTS.md`:
 * `get` resolves a name across all of Puter, so a name that answers is not a
 * name you own, which is the exact trap `apps.get` set for the deploy script.
 */
const ensureHosting = async (mePuter) => {
  try {
    await mePuter.fs.mkdir(PUBLIC_ROOT, { createMissingParents: true });
  } catch {
    // Already there. `mkdir` rejects on an existing directory, which is the
    // ordinary case here, so it is not a failure worth telling anyone about.
  }

  const owned = await mePuter.hosting.list();
  const held =
    Array.isArray(owned) &&
    owned.some((entry) => entry && entry.subdomain === PUBLIC_SUBDOMAIN);

  if (!held) await mePuter.hosting.create(PUBLIC_SUBDOMAIN, PUBLIC_ROOT);
};

const byteLength = (value) => new TextEncoder().encode(value).length;

/**
 * POST /publish. Spec 0011, build task 5.
 *
 * The order is the design. The client has already written `visibility: public`
 * on its own record before calling this, so this refuses a record that does not
 * already say so: that is the intent first rule enforced in the one place that
 * can enforce it, and it is one more check than before rather than one fewer.
 * Then the files are copied, then the record is read A SECOND TIME and the
 * publish abandoned if the visibility moved while copying, then the entry, then
 * the pointer. Entry before pointer, so the disagreement a crash between them
 * leaves is an orphaned pointer resolving to a 404 rather than a card pointing
 * at nothing.
 *
 * No lock is taken and no key is read and written back (AC-15).
 */
router.post("/publish", async ({ request, user }) => {
  if (!user || !user.puter) return refuse("signedOut", 401);

  const mePuter = appPuter();
  if (!mePuter) return refuse("publishUnavailable", 503);

  const body = await readJsonBody(request);
  const projectId = body === null ? null : body.projectId;
  if (!isProjectId(projectId)) return refuse("badRequest", 400);

  const record = await readRecord(user.puter, projectId);
  if (record === null) return refuse("notFound", 404);

  if (checkPublishable(record, projectId) !== null)
    return refuse("malformed", 422);

  // AC-6 and the intent first rule, in the order they cost the least: both are
  // refusals a caller can act on, and neither should be reached after a copy.
  if (record.visibility !== "public") return refuse("notPublic", 409);

  const models = completeRenders(record);
  if (models.length === 0) return refuse("noRender", 409);

  try {
    await ensureHosting(mePuter);
  } catch {
    return refuse("publishUnavailable", 503);
  }

  const copied = await (async () => {
    try {
      const floorPlanUrl = await copyToPublic(
        user.puter,
        mePuter,
        projectId,
        record.floorPlan.path,
        "floor-plan",
      );
      if (floorPlanUrl === null) return null;

      const renders = await Promise.all(
        models.map(async (model) => [
          model,
          await copyToPublic(
            user.puter,
            mePuter,
            projectId,
            record.renders[model].path,
            model,
          ),
        ]),
      );
      if (renders.some(([, url]) => url === null)) return null;

      return { floorPlanUrl, renderUrls: Object.fromEntries(renders) };
    } catch {
      return null;
    }
  })();

  if (copied === null) return refuse("copyFailed", 502);

  /*
   * The second read (AC-13, AC-17). Copying takes time and the visibility can
   * change during it, so this narrows the window from the whole copy to one
   * round trip. It does not close it, and spec 0011 says so in as many words:
   * closing it properly needs a lease around the sequence, which is machinery
   * this project has already had to fix twice in the render loop.
   */
  const current = await readRecord(user.puter, projectId);
  if (current === null || checkPublishable(current, projectId) !== null)
    return refuse("withdrawn", 409);
  if (current.visibility !== "public") return refuse("withdrawn", 409);

  const entry = {
    schemaVersion: FEED_SCHEMA_VERSION,
    projectId,
    name: current.name.trim(),
    // The session's own username where the runtime offers one, and the record's
    // stored owner otherwise. The two are the same person by construction: the
    // record was read through `user.puter`, so only its owner could have read
    // it at all.
    author:
      typeof user.username === "string" && user.username.length > 0
        ? user.username
        : current.owner,
    models,
    renderUrls: copied.renderUrls,
    floorPlanUrl: copied.floorPlanUrl,
    publishedAt: current.publishedAt,
    // The FIRST read's revision, not the second's, because that is the one the
    // copied bytes belong to. Everything above derived from the copy, `models`
    // and both URL fields, comes from `record`, and this has to agree with them
    // or the entry describes bytes it does not hold: a content write landing in
    // another tab between the copy and the second read would otherwise stamp
    // N+1 onto revision N's images, and `publicState` reads equal revisions as
    // `live`, which hides the republish that would fix it.
    //
    // Under claiming is always safe and over claiming never is. If nothing
    // changed, this is exact. If something did, the record's `revision` is now
    // ahead of it, the project reads `stale`, and the copy is made again, which
    // is the correct answer for a copy whose vintage nothing can pin down: a
    // write landing DURING the copy can leave it holding some of each revision,
    // and no second read can detect that, since a regenerated render overwrites
    // the same path rather than taking a new one.
    publishedRevision: record.revision,
  };

  if (byteLength(JSON.stringify(entry)) > MAX_VALUE_BYTES)
    return refuse("malformed", 422);

  const sortKey = sortKeyFor(current.publishedAt);

  try {
    await mePuter.kv.set(feedEntryKey(sortKey, projectId), entry);
    await mePuter.kv.set(feedWhereKey(projectId), sortKey);
  } catch {
    return refuse("publishUnavailable", 503);
  }

  return json(
    {
      publicAssets: {
        floorPlanUrl: copied.floorPlanUrl,
        renderUrls: copied.renderUrls,
        // The same value the entry carries, so the owner's record and the feed
        // never disagree about which revision is public.
        publishedRevision: entry.publishedRevision,
      },
    },
    200,
  );
});

/**
 * Is this a feed entry this build can serve? Spec 0011, AC-11's read side.
 *
 * Store B is written only by this worker, so a value that fails here is either
 * from an older build or was never an entry, and either way one bad key should
 * cost its own card rather than the page it sits on.
 */
const isFeedEntry = (value) =>
  isRecordValue(value) &&
  value.schemaVersion === FEED_SCHEMA_VERSION &&
  isProjectId(value.projectId) &&
  typeof value.name === "string" &&
  typeof value.author === "string" &&
  Array.isArray(value.models) &&
  isRecordValue(value.renderUrls) &&
  typeof value.floorPlanUrl === "string" &&
  isCounter(value.publishedAt) &&
  isCounter(value.publishedRevision);

/** A cursor is opaque to us, so this checks only that it could be one at all. */
const MAX_CURSOR_LENGTH = 1024;

const isPlausibleCursor = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_CURSOR_LENGTH &&
  !/\s/.test(value);

/**
 * GET /feed. Spec 0011, build task 7. Anonymous, and that is the whole point:
 * a visitor with no account browses the feed, which is what makes it discovery
 * rather than a members' page.
 *
 * One `kv.list` against the app's own store, bounded by a limit on every call
 * (AC-12), reading newest first for free because the key is an inverted
 * timestamp. The cursor is the entire pagination story and the entire `hasMore`:
 * spec 0011's task 1 probe established it is opaque rather than positional, so
 * an entry deleted between two pages cannot make an unrelated card disappear.
 *
 * Nothing here touches `user`. A caller who happens to have a session gets
 * exactly the same answer as one who does not, and nothing about a private
 * project is in this store to leak (AC-13).
 */
router.get("/feed", async ({ request }) => {
  const mePuter = appPuter();
  if (!mePuter) return refuse("feedUnavailable", 503);

  const params = new URL(request.url).searchParams;

  const asked = params.get("limit");
  const limit = asked === null ? FEED_PAGE_DEFAULT : Number(asked);
  if (!Number.isInteger(limit) || limit < 1 || limit > FEED_PAGE_MAX)
    return refuse("badRequest", 400);

  const cursor = params.get("cursor");
  if (cursor !== null && !isPlausibleCursor(cursor))
    return refuse("badRequest", 400);

  try {
    const page = await mePuter.kv.list({
      pattern: FEED_ENTRY_PATTERN,
      limit,
      ...(cursor === null ? {} : { cursor }),
      returnValues: true,
    });

    // `limit` makes this the paginated form, which answers with a page envelope
    // rather than the legacy flat array. The array branch is kept because a
    // runtime that answers with one should degrade to a single page rather than
    // to an empty feed.
    const items = Array.isArray(page) ? page : (page && page.items) || [];
    const entries = items
      .map((item) => (item && "value" in item ? item.value : item))
      .filter(isFeedEntry);

    return json(
      {
        entries,
        cursor: (!Array.isArray(page) && page && page.cursor) || null,
      },
      200,
    );
  } catch {
    return refuse("feedUnavailable", 503);
  }
});

/**
 * GET /feed/project/:projectId. Spec 0011, build task 8.
 *
 * The one route that needs the pointer key to exist at all. It is anonymous and
 * holds a project id and nothing else: it cannot read the owner's record,
 * because it has no session to read it with, and it cannot scan for the entry
 * either, because `kv.list`'s `pattern` is documented as prefix only with a
 * trailing `*` as the wildcard, so `feed:entry:*:<projectId>` matches nothing.
 * `feed:where:<projectId>` is the only way in.
 *
 * A missing pointer, a missing entry, an entry this build cannot read, and a
 * project that never existed all answer the SAME bare 404 with no body (AC-24).
 * That is deliberate rather than lazy: telling those cases apart would tell an
 * anonymous caller whether a private project exists, which is exactly what
 * AC-13 says must not leak.
 *
 * The id is taken off the path rather than out of `params`, so the handler does
 * not depend on how this runtime spells its route parameters.
 */
router.get("/feed/project/:projectId", async ({ request }) => {
  const mePuter = appPuter();
  if (!mePuter) return refuse("feedUnavailable", 503);

  const path = new URL(request.url).pathname;
  const projectId = path.slice(path.lastIndexOf("/") + 1);
  if (!isProjectId(projectId)) return new Response(null, { status: 404 });

  try {
    const sortKey = await mePuter.kv.get(feedWhereKey(projectId));
    if (typeof sortKey !== "string" || sortKey.length === 0)
      return new Response(null, { status: 404 });

    const entry = await mePuter.kv.get(feedEntryKey(sortKey, projectId));
    if (!isFeedEntry(entry)) return new Response(null, { status: 404 });

    return json({ entry }, 200);
  } catch {
    return refuse("feedUnavailable", 503);
  }
});

/**
 * POST /unpublish. Spec 0011, build task 9.
 *
 * **Idempotent, with no "not published" error.** It deletes what it can derive
 * and answers `{ ok: true }` whether or not anything was there. That is not
 * tidiness: it is what lets an owner abandon a publish stuck in the uncommitted
 * state, where the intent write landed and no entry was ever written, instead of
 * being offered only a retry of a publish that will not complete.
 *
 * Which key to delete is derived from the record's own `publishedAt`, read back
 * through `user.puter` before the client clears it. When the record no longer
 * carries one, `feed:where:<projectId>` answers instead, which is the case a
 * half finished unpublish leaves behind.
 *
 * Pointer before entry, mirroring publish's entry before pointer. Either way the
 * disagreement a crash between the two leaves is an orphaned pointer, which
 * resolves to a 404 above, rather than a reachable card for a project nobody
 * meant to share.
 */
router.post("/unpublish", async ({ request, user }) => {
  if (!user || !user.puter) return refuse("signedOut", 401);

  const mePuter = appPuter();
  if (!mePuter) return refuse("publishUnavailable", 503);

  const body = await readJsonBody(request);
  const projectId = body === null ? null : body.projectId;
  if (!isProjectId(projectId)) return refuse("badRequest", 400);

  // Reading the record as the caller is the whole permission check: a caller
  // who cannot read it is a caller who cannot withdraw it, and someone else's
  // project simply is not in their store.
  const record = await readRecord(user.puter, projectId);
  if (record === null) return refuse("notFound", 404);

  try {
    const pointer = await mePuter.kv.get(feedWhereKey(projectId));

    const sortKey = isCounter(record.publishedAt)
      ? sortKeyFor(record.publishedAt)
      : typeof pointer === "string" && pointer.length > 0
        ? pointer
        : null;

    await mePuter.kv.del(feedWhereKey(projectId));
    if (sortKey !== null)
      await mePuter.kv.del(feedEntryKey(sortKey, projectId));

    // The public copies, by the same derivation that wrote them (AC-18): the
    // project id is the directory name, so there is no manifest to keep in step
    // and nothing to look up. `recursive` is the default and is stated anyway,
    // because what is being removed is a directory and that should be obvious
    // from the call.
    await mePuter.fs.delete(`${PUBLIC_ROOT}/${projectId}`, {
      recursive: true,
    });
  } catch {
    // A directory that was never created, or a key that was already gone, is
    // the ordinary case on a second unpublish and on abandoning an uncommitted
    // publish. Neither is a failure worth reporting, and reporting it would
    // make the route non idempotent in exactly the case it exists for.
  }

  return json({ ok: true }, 200);
});
