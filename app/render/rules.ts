/**
 * The rules a render follows, with no I/O anywhere in them. Spec 0006, build
 * task 5.
 *
 * Everything here is a pure function of its arguments, same as
 * `app/upload/plan.ts`, and for the same reason: on a project with no test
 * runner, the parts that are easiest to get subtly wrong are the ones you can
 * read without starting anything. A path derivation and a staleness rule are
 * exactly that, so they are checkable against a table by hand rather than by
 * generating an image and looking at where it landed.
 */
import { NAME_MAX_LENGTH } from "~/projects/invariants";
import type { ModelId, RenderState } from "~/projects/record";
import { PLANS_DIRECTORY, sanitisePlanName } from "~/upload/plan";

/** Where renders live, beside `plans/` in the same app data directory. */
export const RENDERS_DIRECTORY = "renders";

/** Every render is written as PNG, which is what `puter_output_path` gets handed. */
export const RENDER_EXTENSION = "png";

/**
 * The shape the plate reserves for a render. Spec 0007, AC-8.
 *
 * Square now rather than 16:9. The old figure came from an option the worker
 * passed to a painter that no longer exists; spec 0007 passes no `ratio` at all
 * until one real call settles whether Gemini's image model accepts one, so this
 * is the frame's own choice rather than a promise about what comes back. The
 * frame crops with `object-fit: cover`, so a render of another shape is absorbed
 * rather than shifting the page.
 *
 * `.plate-frame` in `app/app.css` is what actually applies it. This constant is
 * the written-down version of that number, and the CSS names it back, so the two
 * halves of one decision can be found from either side.
 */
export const RENDER_ASPECT_RATIO = "1 / 1";

/**
 * How long the client waits for one render before giving up. Spec 0006, AC-13.
 *
 * A guess rather than a measurement, and the spec says so: Puter publishes no
 * worker execution limit, so the real ceiling is unknown until it is hit. Two
 * minutes is long enough for an image call, with room to spare now that there is
 * only one of them, and short enough that nobody watches a dead card for the
 * length of a coffee break.
 */
export const RENDER_TIMEOUT_MS = 120 * 1000;

/**
 * When a `running` render stops being believable. Spec 0006, AC-10.
 *
 * Comfortably longer than the timeout above, because the timeout is what THIS
 * tab enforces on its own request and this rule is about a render nothing is
 * waiting on any more: a tab closed mid render, a laptop shut. Nothing resumes
 * that work, so the screen says so rather than claiming something is happening
 * when nothing is.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Where one model's render is written, derived from where the plan is.
 *
 * Both paths are absolute and share an app data root, which is what makes the
 * worker's guard possible: it takes the root from the plan it was given and
 * refuses any `out` that does not sit under `renders/` inside that same root. A
 * relative path would mean something different inside the worker, which runs
 * under its own app identity, so this only ever operates on the absolute path
 * `fs.stat` reports.
 *
 * Returns `null` rather than guessing when the plan is not where a plan should
 * be. A path that cannot be derived is a bug worth surfacing as a refusal, not
 * a directory invented on the spot.
 */
export const renderOutPath = (
  absolutePlanPath: string,
  projectId: string,
  model: ModelId,
): string | null => {
  const marker = `/${PLANS_DIRECTORY}/`;
  const at = absolutePlanPath.lastIndexOf(marker);
  if (at < 0) return null;

  const file = absolutePlanPath.slice(at + marker.length);
  if (file.length === 0 || file.includes("/")) return null;

  const root = absolutePlanPath.slice(0, at);
  return `${root}/${RENDERS_DIRECTORY}/${projectId}-${model}.${RENDER_EXTENSION}`;
};

/**
 * What a project is called, derived from the file that was uploaded.
 *
 * `sanitisePlanName` already produces a safe, non-empty slug and already falls
 * back when a filename sanitises to nothing, so `NAME_MIN_LENGTH` cannot be
 * tripped from here and this function does not re-check it. On top of that
 * slug: hyphens become spaces, the first letter is capitalised, nothing else is
 * recased, and the result is cut to the store's ceiling.
 *
 * Nothing else is recased on purpose. Title casing a name would turn
 * `flat-2b-north` into `Flat 2b North`, and guessing which words deserve a
 * capital is a guess that is wrong often enough to be noticed.
 *
 * `ground-floor-plan.png` becomes `Ground floor plan`.
 */
export const projectNameFrom = (filename: string): string => {
  const spaced = sanitisePlanName(filename).replace(/-/g, " ");
  const named = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return named.slice(0, NAME_MAX_LENGTH).trimEnd();
};

/**
 * Has this `running` render been abandoned? Spec 0006, AC-10.
 *
 * Scoped to `running` deliberately. A `pending` render is work not started
 * rather than work lost, and the project page starts every pending render when
 * it mounts, so `pending` needs no staleness rule at all: it just runs.
 *
 * A `running` render with no `startedAt` counts as stale. It should be
 * impossible, since the same write sets both, but a render that is running
 * according to the record and has no way to ever age out is the one state that
 * could leave someone watching a card forever.
 */
export const isStaleRender = (
  render: RenderState,
  now: number = Date.now(),
): boolean => {
  if (render.status !== "running") return false;
  if (render.startedAt === null) return true;
  return now - render.startedAt > STALE_AFTER_MS;
};

/**
 * May this attempt start? Spec 0006, AC-18, and the first of the three guards.
 *
 * `pending` is work waiting to be done. A `running` render that has gone stale
 * is work nobody is waiting on, so a retry is allowed to take it over. Anything
 * else, and especially a `running` render that is still live, is refused: that
 * is what a second tab sees, and it is what stops one model having two attempts
 * at once.
 */
export const mayStartRender = (
  render: RenderState,
  now: number = Date.now(),
): boolean =>
  render.status === "pending" ||
  (render.status === "running" && isStaleRender(render, now));

/**
 * What a render card is showing right now. Derived, never stored.
 *
 * `stalled` is the display-only state behind AC-10: a stale `running` render is
 * SHOWN as failed without any write happening, because writing would mean every
 * viewer of a project racing to be the one that records the failure. Its retry
 * writes `running` directly, which the state machine already permits.
 */
export type RenderView =
  "pending" | "running" | "complete" | "failed" | "stalled";

/**
 * The word a screen puts on a render state. Spec 0008, AC-4.
 *
 * It lives here, beside `RenderView` itself, because two surfaces now read it:
 * the plate on the project page and the card in the gallery. Written out twice
 * the two would eventually disagree, and a card saying `Working` beside a page
 * saying `Stopped` is exactly the defect the card is most likely to have.
 *
 * "Working" rather than "generating" while it runs, for no cleverer reason than
 * that it is the honest word: something is happening and it is not finished. It
 * used to be justified by the model reading the plan first, and that stage is
 * gone, but the word it produced was right on its own terms.
 *
 * Keyed by `RenderView` and not by the stored status, so `stalled` has a word at
 * all. A screen reading `renders[model].status` could not say `Stopped`.
 */
export const STATE_WORDS: Readonly<Record<RenderView, string>> = {
  pending: "Queued",
  running: "Working",
  complete: "Done",
  failed: "Didn't finish",
  stalled: "Stopped",
};

export const renderView = (
  render: RenderState,
  now: number = Date.now(),
): RenderView => (isStaleRender(render, now) ? "stalled" : render.status);

/**
 * What a plate is showing, with the one thing the record cannot know folded in.
 *
 * A render that could not even be RECORDED as started reads as failed, even
 * though the record still says pending, because from where the person is sitting
 * it is: nothing is happening and nothing will until they press the button
 * again. That fact lives in the page's state rather than in the record, for the
 * good reason that the record is the thing that could not be written.
 */
export const plateView = (
  render: RenderState,
  blocked: boolean,
  now: number = Date.now(),
): RenderView => (blocked ? "failed" : renderView(render, now));

/**
 * Is this plate mid-render? Spec 0007, AC-5.
 *
 * One function rather than the same comparison written in two places, because
 * two places are exactly what it governs: the plate shows the blurred plan while
 * this is true, and the sheet hides the small key for precisely the same period,
 * so that the drawing is never on screen twice at once. Written twice, the two
 * could drift and the page would show one plan or three.
 */
export const isWorkingView = (view: RenderView): boolean =>
  view === "pending" || view === "running";

/**
 * The one place the floor plan is allowed to be. Spec 0009, AC-5.
 *
 * Where the drawing appears is one decision about the whole sheet, not three
 * components each testing their own condition. It replaces the sheet's previous
 * `working` boolean rather than sitting beside it, for exactly the reason
 * `isWorkingView` exists: two facts that must agree are one fact.
 *
 * The order matters and is not arbitrary. With two models, one working and one
 * complete, three independent checks would put the blurred plan behind the busy
 * plate AND the sharp plan inside a comparison on screen at the same time. Busy
 * wins, because that plate has already taken the drawing to make the wait out
 * of, and a comparison next to a render that is still being redone would be
 * comparing against something about to be replaced.
 *
 *   any view working   -> "busy"        the plate holds the blurred plan,
 *                                       and NO comparison renders anywhere
 *   else any complete  -> "comparison"  the comparison holds the plan
 *   else               -> "key"         failed or stalled only, so the small
 *                                       key is the only place left
 */
export type PlanPlacement = "busy" | "comparison" | "key";

export const planPlacement = (views: readonly RenderView[]): PlanPlacement => {
  if (views.some(isWorkingView)) return "busy";
  if (views.includes("complete")) return "comparison";
  return "key";
};
