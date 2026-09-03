/**
 * What a downloaded render is called. Spec 0012, build task 2, AC-3.
 *
 * Pure, like `app/upload/plan.ts` and `app/render/rules.ts`, and for the same
 * reason: a filename rule is exactly the kind of thing that is easy to get
 * subtly wrong and easy to check by hand against a table, on a project with no
 * test runner.
 *
 * `sanitisePlanName` is deliberately NOT reused here even though the collapse
 * rule is the same. It strips a trailing extension first, because it is naming
 * a stored file from an uploaded filename, and a project is not a filename: a
 * project called `Flat 2.b north` would lose everything from the dot onward and
 * be saved as `flat-2.png`. The collapse is shared in spirit, the strip is not,
 * and the fallback is different too.
 */
import { RENDER_EXTENSION } from "~/render/rules";

/**
 * What a name that slugifies to nothing falls back to.
 *
 * `render` rather than `plan`, which is `app/upload/plan.ts`'s fallback for a
 * different job. A file in a Downloads folder called `plan.png` would be the
 * drawing that went in, not the picture that came out.
 */
export const FALLBACK_STEM = "render";

/**
 * A project name, made safe to put in a filename.
 *
 * Everything outside `[a-z0-9]` collapses to a single `-`, which handles spaces,
 * brackets, accents, and emoji in one rule rather than a list of special cases,
 * and takes the path separator and the Windows reserved characters with it. No
 * length cap is applied: `NAME_MAX_LENGTH` already holds project names to 80
 * characters, which is a filename every operating system here accepts.
 *
 * `Ground floor plan` becomes `ground-floor-plan`. `!!!` becomes the empty
 * string, which is what the fallback below exists for.
 */
export const slugifyProjectName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * The name the browser saves a render under. Spec 0012, AC-3.
 *
 * The extension is `RENDER_EXTENSION`, the constant every render is written
 * under, rather than something derived from the stored path. A derivation would
 * have a branch nothing can currently reach, since nothing writes any other
 * format. The day a second output format arrives, the extension belongs on the
 * record beside the path, and this is one of the two places that changes.
 */
export const downloadFilename = (projectName: string): string => {
  const stem = slugifyProjectName(projectName);
  return `${stem.length > 0 ? stem : FALLBACK_STEM}.${RENDER_EXTENSION}`;
};
