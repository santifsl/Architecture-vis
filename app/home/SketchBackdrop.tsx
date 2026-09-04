/**
 * The building studies behind the home screen. Spec 0004, amendments 4, 5 and 7.
 *
 * They stand in the margins either side of the content column and run the full
 * height of the page, from the top of the main content down past the projects
 * strip to wherever the page actually ends. Nothing about them is interactive or
 * announced: the layer takes no pointer events and every drawing is
 * `aria-hidden`.
 *
 * Which PAIR appears is what `variant` carries: the two tall studies with a
 * projects strip under the hero, the two squat ones without.
 *
 * The REASON changed under it in amendment 8 and the old one is worth recording
 * as dead. Amendment 5 chose the pair by page length because the drawings were
 * as tall as the page and `slice` cropped whatever did not fit, so a tall study
 * on a short sheet lost its top. Nothing crops any more, at any page length, so
 * either pair would work on either page. The split is now what it looks like
 * rather than what it was argued as: the signed in page and the signed out page
 * are different rooms and get different drawings. It stays a caller's decision
 * because the same answer decides whether the strip renders at all, and two
 * components working that out separately is how they would eventually disagree.
 *
 * It does still carry real weight in the layout, which is why the pair is not
 * simply picked at random. A squat sheet is less than half as tall at a given
 * width as a tall one, and the drawings are sized from their width now, so the
 * squat pair is what keeps the signed out page's short sheet from being outrun
 * by its own drawing.
 *
 * The sheet each pair is drawn on has its own shape, and `sketch-layer-${variant}`
 * is how the CSS is told which: the drawing's width is set from the margin and
 * its HEIGHT comes from that ratio, so the class is load bearing rather than a
 * hook for styling.
 *
 * All four are the building and the drafter's own setting out marks, and nothing
 * else. Amendment 5 had put a PLAN on the paper above each of the tall pair to
 * fill a sheet the elevation did not reach; amendment 7 took the plans out,
 * because a ring of circles and radials floating over a tower reads as an
 * ornament laid on the drawing rather than as part of it, which is the thing
 * scope.md feature 4 refused. Each building was drawn bigger instead, so all
 * four now run to within a few percent of the top of their own sheet.
 *
 * `.sketch-layer` carries the one opacity and the one mask in the whole
 * arrangement, and both are load bearing rather than tidy. See the note on it in
 * `app/app.css`.
 */
import { ColonnadeSketch } from "~/home/ColonnadeSketch";
import { LatticeSketch } from "~/home/LatticeSketch";
import { PavilionSketch } from "~/home/PavilionSketch";
import { TowerSketch } from "~/home/TowerSketch";

/** How long the page under these drawings is. */
export type SketchVariant = "tall" | "short";

export function SketchBackdrop({
  variant,
}: {
  readonly variant: SketchVariant;
}) {
  return (
    <div className={`sketch-layer sketch-layer-${variant}`} aria-hidden="true">
      {variant === "tall" ? (
        <>
          <TowerSketch className="sketch sketch-left" />
          <LatticeSketch className="sketch sketch-right" />
        </>
      ) : (
        <>
          <ColonnadeSketch className="sketch sketch-left" />
          <PavilionSketch className="sketch sketch-right" />
        </>
      )}
    </div>
  );
}
