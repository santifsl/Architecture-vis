/**
 * One project, as a card. Spec 0008, AC-3 to AC-5 and AC-12.
 *
 * The card is the plate from the project sheet, shrunk: the same square frame,
 * the same busy treatment, the same state words. That is deliberate rather than
 * lazy. A gallery of renders and a page showing one render are the same subject
 * at two sizes, and inventing a second look for the smaller one is how two
 * surfaces start disagreeing about what "working" looks like.
 *
 * Under the frame sits the drawing-sheet meta line: the plan itself as a small
 * chip, the way a sheet carries its key, beside the date. The name is above it,
 * because the name is what you scan for.
 *
 * The whole card is one link and contains nothing else you can operate (AC-5).
 * There is no retry here even when an image cannot be shown: the project page
 * already has that action, and a button inside a link is both a nested control
 * and a second thing to aim at in a grid of them.
 */
import { Link } from "react-router";

import {
  cardRender,
  formatProjectDate,
  type CardRender,
} from "~/gallery/rules";
import type { Project } from "~/projects/record";
import { BusyPlan, PlateNote } from "~/render/RenderPlate";
import {
  isWorkingView,
  renderView,
  STATE_WORDS,
  type RenderView,
} from "~/render/rules";
import { useStoredUrl } from "~/storage/useStoredUrl";

/**
 * What the square says while it is fetching the URL for a finished render.
 *
 * Not a state word: the render is done and nothing about the project is in
 * progress, only this card's view of it. It borrows the same scrim so the wait
 * looks like every other wait in the app.
 */
const MINTING_MESSAGE = "Loading";

/**
 * The square, and everything that can be inside it. AC-3, AC-4, AC-12.
 *
 * The mint lives here rather than one level further down so that the frame
 * itself knows it is busy. A finished card whose view URL has not arrived yet is
 * waiting on the same kind of work as a card whose render is still running, so
 * it now says so the same way: the plan blurred under the scrim, and the clay
 * hairline sweeping the bottom edge. Rendering nothing during that window left
 * an empty ivory square on a card that has a picture to show, which reads as a
 * project with no render rather than as one a moment from appearing.
 *
 * The caller keys this on the render path, so a card pointed at a new file
 * remounts and the previous URL goes with it. The key is the reset, and it stays
 * the reset here even though `useStoredUrl` now discards a result whose path no
 * longer matches: a remount also drops everything else this component is holding
 * about the old file, which a hook cannot do for it.
 */
function CardPlate({
  project,
  card,
  view,
}: {
  readonly project: Project;
  readonly card: CardRender | null;
  readonly view: RenderView | null;
}) {
  // Null unless there is a finished render to fetch, which is what makes one
  // unconditional hook call safe for every state a card can be in.
  const renderPath =
    view === "complete" && card !== null ? card.render.path : null;
  const { url, failed } = useStoredUrl(renderPath);

  // The two waits that look identical from the outside: the render itself, and
  // the URL that shows it. Mutually exclusive, since minting needs `complete`.
  const minting = renderPath !== null && !failed && url === null;
  const busyNote = minting
    ? MINTING_MESSAGE
    : view !== null && isWorkingView(view)
      ? STATE_WORDS[view]
      : null;

  return (
    <div
      className="plate-frame"
      data-busy={busyNote === null ? undefined : "true"}
    >
      {busyNote !== null && (
        <BusyPlan
          planPath={project.floorPlan.path}
          note={busyNote}
          decorative={false}
        />
      )}

      {url !== null && (
        <img
          className="plate-image"
          src={url}
          alt={`The 3D render of ${project.name}`}
        />
      )}

      {failed && <PlateNote text="Can't be shown right now" />}

      {(view === null || view === "failed" || view === "stalled") && (
        <PlateNote text={view === null ? "No render" : STATE_WORDS[view]} />
      )}
    </div>
  );
}

/**
 * The floor plan on the meta line, small enough to read as a key rather than as
 * a second picture.
 *
 * Decorative, so `alt=""`: the link is already named by the project, and a
 * screen reader announcing a thumbnail of the drawing on every card in a grid
 * adds nothing a person can act on. The chip keeps its box before the URL is
 * minted, so the line does not jump as the grid fills in.
 */
function PlanChip({ path }: { readonly path: string }) {
  const { url } = useStoredUrl(path);

  return url === null ? (
    <span className="plan-chip" aria-hidden="true" />
  ) : (
    <img className="plan-chip" src={url} alt="" />
  );
}

export function ProjectCard({ project }: { readonly project: Project }) {
  const card = cardRender(project);
  // The VIEW state, never the stored status. `stalled` is derived from
  // `isStaleRender` and is not a status anything writes, so a card reading
  // `renders[model].status` would say "Working" forever about an abandoned
  // render while the project page beside it said "Stopped".
  const view = card === null ? null : renderView(card.render);

  return (
    <Link to={`/project/${project.id}`} className="gallery-card">
      <CardPlate
        key={card?.render.path ?? "none"}
        project={project}
        card={card}
        view={view}
      />

      {/*
        The rhythm, spec 0010 AC-14: the name sits tight under its frame and the
        meta line hangs further below it, so a card reads as one picture with a
        caption rather than as three evenly spaced lines. The two gaps were the
        other way round, which is what made a card look like a list.
      */}
      <h3 className="gallery-card-name mt-2 type-heading text-ink">
        {project.name}
      </h3>

      <div className="mt-3 flex items-center gap-2">
        <PlanChip path={project.floorPlan.path} />
        <span className="type-meta text-ink-soft">
          {formatProjectDate(project.createdAt)}
        </span>
      </div>
    </Link>
  );
}
