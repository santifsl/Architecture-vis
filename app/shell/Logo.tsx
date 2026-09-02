/**
 * The mark. Spec 0010, AC-3.
 *
 * A component rather than a piece of markup in the navbar, for one reason: the
 * artwork should be a change to this file and to nothing else. The box it
 * renders into is fixed in `app/app.css` (`.logo`), so the mark occupies exactly
 * the space the wordmark it replaced did and the navbar's left edge never moves.
 *
 * The art is painted as a CSS mask rather than drawn as an `<img>`, which is a
 * change from the spec's assumption that the final art would be a vector. It
 * arrived as a monochrome raster instead, and a raster placed as an image brings
 * its own near-black with it, which is an off-system colour sitting in the
 * navbar. As a mask it is painted in `currentColor`, so the mark is ink from the
 * palette, it answers the hover with the rest of the link, and there is still
 * exactly one file to swap if a vector ever arrives. `app/shell/av-mark.png`
 * carries the mask; `assets/` keeps the source art it was cropped from.
 *
 * The wordmark sits beside the mark rather than behind an `aria-label`, because
 * a drawn monogram for a product nobody has heard of yet is a shape before it is
 * two letters, and the name spelled out is what makes it legible. It takes
 * `type-label`, the role the navigation already sets its text in, so the mark
 * and the `Projects` link beside it belong to one row rather than to two
 * different ideas about size.
 *
 * It is also now the link's accessible name, which is why there is no
 * `aria-label` any more: visible text naming its own link is the version that
 * cannot drift out of step with what is on screen. The painted span stays hidden
 * from assistive technology, so the name is announced once rather than twice.
 * The name is a literal here, deliberately not read from a route or a shared
 * constant: a name assembled from somewhere else is a name that can go missing.
 */
import { Link } from "react-router";

const NAME = "AV";

export function Logo() {
  return (
    <Link to="/" className="logo">
      <span className="logo-art" aria-hidden="true" />
      <span className="type-label">{NAME}</span>
    </Link>
  );
}
