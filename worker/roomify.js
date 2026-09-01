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

  let body;
  try {
    body = await request.json();
  } catch {
    return refuse("badRequest", 400);
  }

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

  let planUri;
  try {
    planUri = await readPlanAsDataUri(user.puter, plan);
  } catch (error) {
    return refuse("planUnreadable", isMissingFile(error) ? 404 : 502);
  }

  try {
    await paintPlan(user.puter, model, planUri, plan, out);
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
