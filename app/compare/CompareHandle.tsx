/**
 * The divider you drag. Spec 0009, AC-7 and AC-8.
 *
 * Ours, never the library's, and that is a hard requirement rather than a
 * preference: `ReactCompareSliderHandle` draws a 3.5rem circle with chevrons,
 * a backdrop blur and two drop shadows, entirely in inline styles, so it can be
 * replaced but never restyled.
 *
 * What replaces it comes from the sheet's own vernacular. A drawing marks a cut
 * with a line and terminates a dimension with an oblique tick, not with an
 * arrowhead, so the divider is a hairline and the grip is a pair of those ticks.
 * They read as a drawing mark and as two grip ridges at the same time, which is
 * the whole trick: the thing that says "this is a measurement between two
 * pictures" is also the thing that says "take hold of me".
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
export function CompareHandle() {
  return (
    <div className="compare-divider">
      <svg
        className="compare-grip"
        viewBox="0 0 12 24"
        aria-hidden="true"
        focusable="false"
      >
        {/*
          Each tick is drawn twice, the bone casing first and the clay stroke
          over it, the same clearance the divider itself carries and for the same
          reason: a 1.25 stroke of clay on a dark render is not reliably there.
        */}
        <path className="compare-grip-casing" d="M2 14 L10 6" />
        <path className="compare-grip-casing" d="M2 18 L10 10" />
        <path d="M2 14 L10 6" />
        <path d="M2 18 L10 10" />
      </svg>
    </div>
  );
}
