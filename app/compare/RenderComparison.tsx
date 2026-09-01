/**
 * Before and after, on one square. Spec 0009.
 *
 * The product makes exactly one promise, that the walls in the render follow
 * the walls you drew, and this is where that promise becomes checkable. Two pictures
 * side by side make you hold one in your head while looking at the other; one
 * picture with a divider through it lets you slide the boundary until you can
 * see whether a wall lands where it should.
 *
 * It owns nothing. Two paths and a name go in, a section comes out, and there is
 * no write, no lease taken, no worker call and no stored state anywhere in
 * this directory (AC-11). That is also what lets feature 9's public project page
 * reuse it unchanged: it never asks who owns the files it is showing.
 *
 * The render is deliberately on the sheet twice, once in the plate above and
 * once here. It costs one image decode and no extra Puter call, because both
 * copies ask `useStoredUrl` for the same path and the promise cache in
 * `app/storage/urls.ts` writes its entry before its first await, so two callers
 * whose effects flush in the same commit share one mint. That is why this
 * component must mount in the same commit as the plate: no lazy mounting, no
 * intersection observer, or the two copies become two mints (AC-4).
 */
import { ReactCompareSlider } from "react-compare-slider";

import { CompareHandle } from "~/compare/CompareHandle";
import { COMPARE_LABELS, COMPARE_START_POSITION } from "~/compare/rules";
import { useStoredUrl } from "~/storage/useStoredUrl";

export function RenderComparison({
  planPath,
  renderPath,
  projectName,
}: {
  readonly planPath: string;
  /**
   * Never `string | null`. The sheet narrows it at the call site, so a render
   * with no file can never reach a slider that would have nothing on one side.
   */
  readonly renderPath: string;
  /** For the alt text. Neither image is decorative here, unlike the busy plan. */
  readonly projectName: string;
}) {
  const plan = useStoredUrl(planPath);
  const render = useStoredUrl(renderPath);

  /*
   * A failed mint takes the whole section away rather than showing half a
   * comparison (AC-10). The plate above already carries one sentence and one
   * `Try showing it again` for the very same file, and a second retry button for
   * one underlying mint is two ways to fix one thing.
   *
   * A mint that has not landed YET is a different case, and it is why the frame
   * below is rendered before the slider is. AC-3 wants the square reserved from
   * the first paint so a slow mint never shifts the page, and AC-10 wants no
   * comparison without both images. Both hold if the frame is always here and
   * only its contents wait.
   */
  if (plan.failed || render.failed) return null;

  // Read out of the hooks so the null check below narrows the type as well as
  // choosing the branch. A separate `ready` boolean would do neither.
  const planUrl = plan.url;
  const renderUrl = render.url;

  return (
    <section className="mt-8" aria-label="Before and after">
      <h2 className="type-heading text-ink">Before and after</h2>

      {planUrl !== null && renderUrl !== null ? (
        <ReactCompareSlider
          className="plate-frame mt-3"
          defaultPosition={COMPARE_START_POSITION}
          handle={<CompareHandle />}
          itemOne={
            <img
              className="compare-image compare-plan"
              src={planUrl}
              alt={`The floor plan for ${projectName}`}
            />
          }
          itemTwo={
            <img
              className="compare-image compare-render"
              src={renderUrl}
              alt={`The 3D render of ${projectName}`}
            />
          }
        />
      ) : (
        <div className="plate-frame mt-3" />
      )}

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p className="type-meta text-ink-soft">{COMPARE_LABELS.left}</p>
        <p className="type-meta text-ink-soft">{COMPARE_LABELS.right}</p>
      </div>
    </section>
  );
}
