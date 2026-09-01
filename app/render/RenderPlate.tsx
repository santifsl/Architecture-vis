/**
 * The render, as a plate on the sheet. Spec 0006, and spec 0007 for the busy
 * state and the shape.
 *
 * A plate is the frame and a label row. There is no panel and no border around
 * the whole thing on purpose: a bordered box inside the sheet would give the
 * page two competing frames, the same reason the upload card is itself the drop
 * zone rather than holding a second dashed one.
 *
 * The frame reserves its square from the first paint, before there is any image
 * to put in it, so a render arriving never shifts the page under someone
 * reading it (AC-8).
 */
import type { ModelId } from "~/projects/record";
import type { RenderState } from "~/projects/record";
import { renderMessage, type RenderFailure } from "~/render/failures";
import { isWorkingView, plateView, renderView } from "~/render/rules";
import { useStoredUrl } from "~/storage/useStoredUrl";

/** What each model is called on screen. Not the worker's model id, which nobody needs to read. */
const MODEL_NAMES: Readonly<Record<ModelId, string>> = {
  gemini: "Gemini",
};

/**
 * The state word in the label row.
 *
 * "Working" rather than "generating" while it runs, for no cleverer reason than
 * that it is the honest word: something is happening and it is not finished. It
 * used to be justified by the model reading the plan first, and that stage is
 * gone, but the word it produced was right on its own terms.
 */
const STATE_WORDS = {
  pending: "Queued",
  running: "Working",
  complete: "Done",
  failed: "Didn't finish",
  stalled: "Stopped",
} as const;

/** The line the busy overlay carries. Spec 0007, AC-5, in as many words. */
const WORKING_MESSAGE = "Generating your 3D render";

function PlateImage({
  path,
  alt,
}: {
  readonly path: string;
  readonly alt: string;
}) {
  const { url, failed, retry } = useStoredUrl(path);

  if (failed) {
    return (
      <div>
        <p className="type-body text-ink">
          This render is saved, but it can&rsquo;t be shown right now.
        </p>
        <button type="button" className="btn-quiet mt-1" onClick={retry}>
          Try showing it again
        </button>
      </div>
    );
  }
  if (url === null) return null;

  return <img className="plate-image" src={url} alt={alt} />;
}

/**
 * The wait, made of the person's own drawing. Spec 0007, AC-5 to AC-7.
 *
 * Their floor plan, blurred, under a scrim carrying one line, so the wait looks
 * like something happening to their file rather than like an empty rectangle.
 * The plan is decorative here and carries `alt=""`: it is the same drawing the
 * key shows, and the words are what carry the meaning.
 *
 * The message is `aria-hidden`, because the label row already announces
 * `Working` through a `role="status"`. Two live regions saying the same thing at
 * the same moment is noise rather than redundancy.
 *
 * The scrim and the words do not wait for the image. A URL that has not been
 * minted yet, or a mint that failed, leaves the frame's own ivory behind them
 * and changes nothing else, so the busy state can never be held up by a picture
 * that is only there to be looked at.
 */
function BusyPlan({ planPath }: { readonly planPath: string }) {
  const { url } = useStoredUrl(planPath);

  return (
    <>
      {url !== null && <img className="plate-plan" src={url} alt="" />}
      <div className="plate-veil">
        <p className="plate-message type-meta" aria-hidden="true">
          {WORKING_MESSAGE}
        </p>
      </div>
    </>
  );
}

export function RenderPlate({
  model,
  render,
  planPath,
  blocked,
  onRetry,
}: {
  readonly model: ModelId;
  readonly render: RenderState;
  /** The floor plan, which the plate blurs behind the scrim while it works. */
  readonly planPath: string;
  /** Set when the render could not even be recorded as started. Shown instead of the stored state. */
  readonly blocked: RenderFailure | undefined;
  readonly onRetry: (model: ModelId) => void;
}) {
  const view = plateView(render, blocked !== undefined);
  const working = isWorkingView(view);
  // A stalled render is DISPLAYED as failed without any write happening, per
  // AC-10, so its sentence is the one the client decides rather than whatever
  // the record last stored.
  const failure =
    blocked ??
    (renderView(render) === "stalled" ? "stalled" : render.errorCode);

  return (
    <section aria-label={`${MODEL_NAMES[model]} render`}>
      <div className="plate-frame" data-busy={working ? "true" : undefined}>
        {working && <BusyPlan planPath={planPath} />}

        {view === "complete" && render.path !== null && (
          <PlateImage
            key={render.path}
            path={render.path}
            alt="A top-down 3D render of the space your floor plan draws"
          />
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h2 className="type-heading text-ink">{MODEL_NAMES[model]}</h2>
        <p className="type-meta text-ink-soft" role="status">
          {STATE_WORDS[view]}
        </p>
      </div>

      {(view === "failed" || view === "stalled") && (
        <>
          <p className="mt-2 type-body text-ink">{renderMessage(failure)}</p>
          <button
            type="button"
            className="btn-quiet mt-1"
            onClick={() => {
              onRetry(model);
            }}
          >
            Try this render again
          </button>
        </>
      )}
    </section>
  );
}
