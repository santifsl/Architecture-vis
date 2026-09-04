/**
 * Saving a finished render to your own machine. Spec 0012.
 *
 * The one thing this product makes finally leaves the product. Until now a
 * render could only be looked at inside AV, or shared as a link.
 *
 * It renders inside `RenderPlate`'s label row, which sits inside `/project/:id`
 * and therefore behind `RequireUser`. Nothing here appears on the public project
 * page, the community feed, the gallery, or the comparison, because none of them
 * mounts a plate (AC-12).
 *
 * Three looks, and the third one is the interesting one:
 *
 *   complete            an ordinary button
 *   pending or running  present, focusable, and `aria-disabled`, so a keyboard
 *                       user can find out that a download is coming rather than
 *                       wonder whether the feature exists
 *   failed or stalled   nothing at all, so the failure sentence and its retry
 *                       keep the space under the plate to themselves (AC-6)
 */
import { DOWNLOAD_MESSAGES, isRetryable, RETRY_LABEL } from "~/export/failures";
import { useDownloadRender } from "~/export/useDownloadRender";
import { isWorkingView, type RenderView } from "~/render/rules";
import { Notice } from "~/ui/Notice";

/**
 * The button's words, which are also its accessible name. Spec 0012's Copy
 * table.
 *
 * There is no separate `aria-label` on purpose, so the visible label and the
 * announced name cannot drift apart, the same pattern `AuthControl` uses for
 * signing in.
 */
const LABELS = {
  available: "Download",
  busy: "Preparing your render",
  unavailable: "Download when it is ready",
} as const;

export function DownloadRender({
  projectName,
  path,
  view,
}: {
  readonly projectName: string;
  /** Where the render is stored. Null until one exists. */
  readonly path: string | null;
  readonly view: RenderView;
}) {
  const waiting = isWorkingView(view);
  const { state, failure, download } = useDownloadRender({
    path,
    projectName,
  });

  // Nothing to offer and nothing to promise: a render that failed or stalled has
  // no file now and no file coming.
  if (!waiting && path === null) return null;

  const busy = state === "busy";
  const label = waiting
    ? LABELS.unavailable
    : busy
      ? LABELS.busy
      : LABELS.available;

  return (
    /*
     * A column rather than a bare button, so the sentence lands under the
     * control that produced it rather than beside the state word at the far end
     * of the row. `AuthControl` stacks its sign-in notice the same way.
     */
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn-primary"
        aria-busy={busy}
        aria-disabled={waiting || busy}
        onClick={() => {
          // `aria-disabled` styles and announces but does not block, so both
          // refusals are the handler's job. AC-4 and AC-5 both live on this line.
          if (waiting) return;
          download();
        }}
      >
        {label}
      </button>

      {failure !== null && (
        <>
          <Notice>{DOWNLOAD_MESSAGES[failure]}</Notice>
          {isRetryable(failure) && (
            <button type="button" className="btn-quiet" onClick={download}>
              {RETRY_LABEL}
            </button>
          )}
        </>
      )}
    </div>
  );
}
