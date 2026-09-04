/**
 * A diagrid tower, standing in the right margin of the home screen.
 * Spec 0004, amendments 4 and 7.
 *
 * Recreated from `assets/Screenshot 2026-09-03 at 2.50.29 p.m..png`, a pencil
 * study of 30 St Mary Axe: the ovoid profile, the diagrid wrapping it, the
 * flattened rings where each floor meets the skin, and the blocks crowding its
 * base. As with the tower on the other side, the reference's graphite shading is
 * deliberately not taken: this is line only, no fill, no gradient, no tonal
 * wash, per spec 0004's flat rule.
 *
 * Amendment 7 drew it a great deal taller relative to its width than the
 * reference is, and that is a departure worth naming rather than hiding. The
 * column this stands in is about five times taller than it is wide, and
 * amendment 5's answer to that was to draw the building at the reference's own
 * squat proportions and fill the paper above it with a PLAN. Amendment 7 removed
 * the plan, on the grounds that a ring of circles and radials floating over a
 * building reads as an ornament laid on top of the drawing rather than as part
 * of it, which is exactly what scope.md feature 4 refused. Once it is gone the
 * building itself has to reach the top of the sheet, so it does. What survives
 * of the reference is everything that is not the aspect ratio: the ovoid swell,
 * the broad foot, the two families of helices and the diamonds where they cross.
 *
 * The diagrid is the one thing here worth computing rather than typing. Every
 * line is a helix wrapping a solid of revolution, so its screen position is
 * `cx + rx(u) * cos(phase + turns * u)`, and typing those points by hand would
 * be both unreadable and wrong. It is computed ONCE at module scope from frozen
 * constants, not during render: the module evaluates, the arrays exist, and
 * every render of this component returns the identical drawing. There is no
 * randomness and nothing that runs per frame.
 *
 * Colour, width and `vector-effect` all come from `.sketch` in `app/app.css`.
 */

const CENTRE = 200;
const GROUND = 1040;
const CROWN = -700;
const BASE = 950;
const WIDEST = 140;

/** The needle above the lantern, which is what carries the drawing to the top of the sheet. */
const MAST = -862;

/**
 * The silhouette, as a half width at a height. `u` runs 0 at the crown to 1 at
 * the base.
 *
 * The three numbers are fitted to the reference rather than picked: a narrow
 * rounded crown at about a sixth of the widest, the widest point at 45 percent
 * down rather than halfway, and a base still 58 percent of the widest. Getting
 * the last one wrong is what separates this shape from a rugby ball, which is
 * what a symmetric curve produced on the first attempt: the real building sits
 * on a broad foot, it does not taper back to a point.
 *
 * Only WIDEST and the two heights changed in amendment 7. The curve is the
 * reference's, stretched, which is why the swell still lands where it does.
 */
const halfWidthAt = (u: number): number =>
  WIDEST * Math.sin(Math.PI * (0.051 + 0.752 * u ** 0.646));

const heightAt = (u: number): number => CROWN + (BASE - CROWN) * u;

/**
 * How many points each curve is drawn with. Enough that no straight edge shows,
 * and raised with the height in amendment 7: the same 56 samples over twice the
 * drop had begun to show as facets on the slowest moving part of each helix.
 */
const SAMPLES = 96;

const samples = Array.from({ length: SAMPLES }, (_, at) => at / (SAMPLES - 1));

const pointsFor = (place: (u: number) => readonly [number, number]): string =>
  samples
    .map((u) => {
      const [x, y] = place(u);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

/** The outline: down one side and back up the other. */
const OUTLINE = [
  ...samples.map((u) => {
    const half = halfWidthAt(u);
    return `${(CENTRE - half).toFixed(1)},${heightAt(u).toFixed(1)}`;
  }),
  ...[...samples].reverse().map((u) => {
    const half = halfWidthAt(u);
    return `${(CENTRE + half).toFixed(1)},${heightAt(u).toFixed(1)}`;
  }),
].join(" ");

/**
 * How far round the building one diagrid line travels between crown and base.
 *
 * Raised with the height in amendment 7, and for the reason the count of turns
 * exists at all: what makes a diamond a diamond is the ratio between how far a
 * helix climbs and how far it travels round, so a taller building at the same
 * 1.55 turns would have stretched every diamond into a lozenge. 2.3 keeps them
 * about as wide as they are tall, the same as the reference.
 */
const TURNS = Math.PI * 2 * 2.3;
const LINES_PER_FAMILY = 16;

/**
 * The two families of helices. One winds clockwise and one anticlockwise, and
 * where they cross is the diamond the real building is famous for. A line that
 * reaches the silhouette simply carries on round the back, which is why each one
 * is a single continuous polyline rather than a run of separate arcs.
 */
const DIAGRID = [1, -1].flatMap((direction) =>
  Array.from({ length: LINES_PER_FAMILY }, (_, at) => {
    const phase = (at * Math.PI * 2) / LINES_PER_FAMILY;
    return {
      key: `${direction}-${at}`,
      points: pointsFor((u) => [
        CENTRE + halfWidthAt(u) * Math.cos(phase + direction * TURNS * u),
        heightAt(u),
      ]),
    };
  }),
);

/**
 * The floor rings, flattened by perspective the way a circle seen edge on is.
 * Drawn as underdrawing rather than structure: at full weight they read as hoops
 * around the building instead of as floors inside it, and they start competing
 * with the diagrid, which is the thing worth looking at.
 *
 * Their count follows the height for the same reason the tower's floor bands do:
 * thirteen of them over this drop would be storeys forty feet apart.
 */
const RINGS = Array.from({ length: 24 }, (_, at) => {
  const u = 0.04 + (at * 0.93) / 23;
  const half = halfWidthAt(u);
  return { key: u, cy: heightAt(u), rx: half, ry: Math.max(half * 0.1, 2) };
});

/** The neighbours crowding the base, which is what gives it its scale. */
const NEIGHBOURS = [
  { x: 6, width: 62, top: 812 },
  { x: 54, width: 40, top: 884 },
  { x: 300, width: 58, top: 846 },
  { x: 344, width: 50, top: 796 },
  { x: 74, width: 34, top: 936 },
  { x: 288, width: 36, top: 922 },
] as const;

export function LatticeSketch({ className }: { readonly className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 -885 400 1970"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {/*
        The sheet the elevation is set out on: the overall height dimension down
        the right hand margin, the axis it is struck from, the horizon through
        the widest point, and the two lines converging on the crown. Amendment 7
        left exactly this and the building, and nothing else.
      */}
      <g className="stroke-guide">
        <path d="M 352 -866 H 392" />
        <path d={`M 352 ${GROUND} H 392`} />
        <path d={`M 374 -866 V ${GROUND}`} />
        <path d="M 366 -858 L 382 -874" />
        <path d={`M 366 ${GROUND + 8} L 382 ${GROUND - 8}`} />
      </g>

      <g className="stroke-guide">
        <path d={`M ${CENTRE} 1090 V -890`} />
        <path d={`M 8 ${heightAt(0.45).toFixed(1)} H 392`} />
        <path d={`M 24 1090 L 178 ${(CROWN - 30).toFixed(1)}`} />
        <path d={`M 376 1090 L 222 ${(CROWN - 30).toFixed(1)}`} />
      </g>

      {NEIGHBOURS.map((block) => (
        <g key={`${block.x}-${block.top}`} className="stroke-medium">
          <path
            d={`M ${block.x} ${GROUND} V ${block.top} H ${block.x + block.width} V ${GROUND}`}
          />
          <path
            d={`M ${block.x} ${block.top + 30} H ${block.x + block.width}`}
          />
          <path
            d={`M ${block.x} ${block.top + 66} H ${block.x + block.width}`}
          />
        </g>
      ))}

      {/* The skin, before the silhouette goes over the top of it. */}
      {DIAGRID.map((line) => (
        <polyline key={line.key} points={line.points} />
      ))}

      {RINGS.map((ring) => (
        <ellipse
          key={ring.key}
          className="stroke-guide"
          cx={CENTRE}
          cy={ring.cy.toFixed(1)}
          rx={ring.rx.toFixed(1)}
          ry={ring.ry.toFixed(1)}
        />
      ))}

      {/* The silhouette last, so it reads as the edge of a solid thing. */}
      <polyline className="stroke-heavy" points={OUTLINE} />

      {/*
        The lantern at the crown. It sits ON the apex rather than above it: the
        outline's own top point is at CROWN, so the ellipse is centred there and
        the mast rises from its top edge to the top of the sheet.
      */}
      <ellipse
        className="stroke-heavy"
        cx={CENTRE}
        cy={CROWN}
        rx={halfWidthAt(0).toFixed(1)}
        ry="9"
      />
      <path
        className="stroke-medium"
        d={`M ${CENTRE} ${CROWN - 9} V ${MAST}`}
      />
      <path
        className="stroke-guide"
        d={`M ${CENTRE - 12} ${CROWN - 62} H ${CENTRE + 12}`}
      />

      {/*
        The plinth: the skin stops at BASE and the building meets the ground on
        straight walls, which is what stops it looking like it is balancing on a
        point.
      */}
      <path
        className="stroke-heavy"
        d={`M ${(CENTRE - halfWidthAt(1)).toFixed(1)} ${BASE} V ${GROUND}`}
      />
      <path
        className="stroke-heavy"
        d={`M ${(CENTRE + halfWidthAt(1)).toFixed(1)} ${BASE} V ${GROUND}`}
      />
      <path
        className="stroke-medium"
        d={`M ${(CENTRE - halfWidthAt(1)).toFixed(1)} ${BASE + 34} H ${(CENTRE + halfWidthAt(1)).toFixed(1)}`}
      />

      {/* The ground, heavier than anything standing on it. */}
      <path className="stroke-heavy" d={`M 0 ${GROUND} H 400`} />
      <path className="stroke-guide" d={`M 0 ${GROUND + 22} H 400`} />
    </svg>
  );
}
