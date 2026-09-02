/**
 * The divider you drag. Spec 0009, AC-7 and AC-8.
 *
 * Ours, never the library's, and that is a hard requirement rather than a
 * preference: `ReactCompareSliderHandle` draws a 3.5rem circle with chevrons,
 * a backdrop blur and two drop shadows, entirely in inline styles, so it can be
 * replaced but never restyled.
 *
 * The mark itself went through three versions and the history matters, because
 * this one reverses the other two. It began as a pair of oblique dimension
 * ticks, from the sheet's own vernacular: spec 0009 refused a circle with
 * arrows precisely because that is the library's own look and says nothing about
 * drawings. The ticks turned out to be too quiet to read as draggable on a busy
 * render, so a shaft and two arrowheads were added either side of them, and that
 * was still judged too subtle in use.
 *
 * So it is now the plain icon: a disc, a ring, a double arrow. The engineer
 * called it, knowing what it costs. What it buys is that nobody has to learn the
 * mark to know the divider moves. What it costs is the drawing vernacular on the
 * one element that had it, and spec 0009's AC-7 is amended rather than pretended
 * to still hold. It stays OUR node, not the library's: the library's handle is a
 * 3.5rem circle with a backdrop blur and two drop shadows in inline styles, and
 * none of that is here. This is one flat disc in two palette colours.
 *
 * Both the line and the ticks are drawn with bone clearance either side of the
 * clay. That is not decoration. Clay is a single hairline sitting on top of
 * whatever render came back, and against a dark or busy image a bare 1px line
 * disappears; the casing is what makes it a line on a sheet rather than a line
 * that is sometimes there.
 *
 * The handle root above this element takes the focus, not this element, and it
 * cannot show a ring: it sets `outline: 0` inline and unconditionally, takes no
 * className or style from us, and is the full size of the frame anyway, so a
 * ring on it would draw a rectangle around the whole square. The indicator is
 * put on `.compare-grip` instead, from `app/app.css`, in the same two tokens the
 * app-wide ring uses. See spec 0009, AC-8, before trying to move it back.
 *
 * Nothing here is interactive on its own. The root element handles the pointer,
 * so this whole node stays `pointer-events: none` (the library's own default for
 * the handle root) and a press on the divider reaches the frame beneath it.
 */
/*
 * The figure, in a 40 by 40 box centred on the divider.
 *
 * A bone disc with a clay ring and a double arrow across it. The disc is opaque,
 * which is what replaces the bone casing every earlier version of this mark
 * carried: the ring and the arrow always sit on bone now, whatever render is
 * underneath, so the clay never has to survive on top of somebody's picture.
 *
 * Every number here is a coordinate in that box, not a design value. The colour,
 * the stroke weight and the size all come from `.compare-grip` in `app/app.css`.
 */
const ARROW = "M11 20 L29 20 M15 16 L11 20 L15 24 M25 16 L29 20 L25 24";

export function CompareHandle() {
  return (
    <div className="compare-divider">
      <svg
        className="compare-grip"
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="compare-grip-disc" cx="20" cy="20" r="15" />
        <path d={ARROW} />
      </svg>
    </div>
  );
}
