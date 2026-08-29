/**
 * The rules a floor plan file has to pass, and the path it gets stored at.
 * Spec 0005, build tasks 2 and 3.
 *
 * Everything here is a pure function of its inputs. Nothing in this module
 * touches Puter, the network, or the clock unless a caller hands it one, which
 * is what lets the awkward cases (an emoji only filename, a name longer than
 * the cap, a `.jpeg` against a `.jpg`) be checked by hand against a table
 * rather than by uploading real files. On a project with no test runner that
 * matters: the rules that are easiest to get subtly wrong are the ones with no
 * I/O in the way of reading them.
 */
import { newProjectId } from "~/projects/record";

/**
 * The types the models can actually take. Spec 0005, AC-1.
 *
 * Deliberately narrow. A `.tiff` or a `.heic` would upload perfectly happily
 * and then fail one feature later inside the render, where the failure reads as
 * "generation broke" rather than "that file was never going to work". Refusing
 * it here turns a confusing failure into a clear one.
 */
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

/** 10 MB. Comfortably above a high resolution scan, well inside a sane upload. */
export const MAX_BYTES = 10 * 1024 * 1024;

/**
 * The extension each type is stored with. Spec 0005, AC-2.
 *
 * Taken from the validated type, never from the supplied filename, so
 * `plan.jpeg`, `plan.JPG` and a file called `plan.png` that is really a JPEG
 * all land on the same honest extension.
 */
const EXTENSIONS: Readonly<Record<AllowedType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const isAllowedType = (value: string): value is AllowedType =>
  ALLOWED_TYPES.some((allowed) => allowed === value);

/** Why a file was refused. The sentence a person reads lives in `failures.ts`. */
export type PlanRejection = "wrongType" | "tooLarge" | "notAnImage";

export type PlanCheck =
  | { readonly ok: true; readonly type: AllowedType }
  | { readonly ok: false; readonly reason: PlanRejection };

/**
 * The cheap half of validation: type and size, both from the `File` itself.
 *
 * Separate from the decode check below because this half is synchronous and
 * free, so a 40 MB file is refused without ever being read. `File.type` is the
 * browser's guess from the extension and is trivially spoofed, which is why it
 * is a first pass rather than the whole answer.
 */
export const checkPlanFile = (file: File): PlanCheck => {
  if (!isAllowedType(file.type)) return { ok: false, reason: "wrongType" };
  if (file.size > MAX_BYTES) return { ok: false, reason: "tooLarge" };
  return { ok: true, type: file.type };
};

/**
 * The full check. Spec 0005, AC-5.
 *
 * The decode is what makes the check honest: a `.txt` renamed to `.png` passes
 * every string comparison above and fails here, because the browser cannot turn
 * it into an image. `createImageBitmap` is used rather than an `Image` element
 * so nothing has to be attached to the document, and the bitmap is closed
 * immediately since it holds decoded pixels and a 10 MB photo is not small.
 *
 * This is the one function here that is not pure, and only in that it awaits a
 * decode. It reads no global state.
 */
export const validatePlanFile = async (file: File): Promise<PlanCheck> => {
  const cheap = checkPlanFile(file);
  if (!cheap.ok) return cheap;

  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return cheap;
  } catch {
    return { ok: false, reason: "notAnImage" };
  }
};

/** How much of the original filename survives into the path. */
const NAME_CAP = 40;
const FALLBACK_NAME = "plan";

/**
 * Turns a filename into something safe to put in a path. Spec 0005, AC-2.
 *
 * The extension is dropped first: it is re added from the validated type, and
 * leaving it here would produce `my-plan-png.png`. Then everything outside
 * `[a-z0-9]` collapses to a single `-`, which handles spaces, brackets,
 * accents, and emoji in one rule rather than a list of special cases.
 *
 * The trim and the fallback are the cases worth naming, because both produce a
 * broken path rather than an ugly one. A filename of `!!!.png` collapses to
 * `-`, which trims to the empty string, and `plans/<id>-.png` is a path with a
 * dangling separator. A filename that is only emoji does the same. Both land on
 * `plan`.
 */
export const sanitisePlanName = (filename: string): string => {
  const withoutExtension = filename.replace(/\.[^.]*$/, "");
  const collapsed = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_CAP)
    .replace(/-+$/g, "");

  return collapsed.length > 0 ? collapsed : FALLBACK_NAME;
};

/** The directory every plan is written into, relative to the app's own folder. */
export const PLANS_DIRECTORY = "plans";

/**
 * Where a plan gets stored. Spec 0005, AC-2.
 *
 * The id prefix is what makes a collision impossible, which is why `dedupeName`
 * stays off: with it on, a second `floorplan.png` would be stored as
 * `floorplan(1).png` and the real path would be whatever the server decided
 * rather than what we asked for, so every caller would have to read the path
 * back out of the response instead of knowing it.
 *
 * The id is the same time sortable generator projects use, so a directory
 * listing in Puter's own file browser comes out in upload order for free.
 *
 * `now` is a parameter rather than a hidden clock read, matching
 * `newProjectId`, so a path can be checked against a fixed timestamp.
 */
export const planPath = (
  filename: string,
  type: AllowedType,
  now: number = Date.now(),
): string =>
  `${PLANS_DIRECTORY}/${newProjectId(now)}-${sanitisePlanName(filename)}.${EXTENSIONS[type]}`;
