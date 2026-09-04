/**
 * A pavilion, standing in the right margin of the SIGNED OUT home screen.
 * Spec 0004, amendments 5 and 7.
 *
 * The counterpart to the portico on the other side, and chosen against it on
 * purpose: one is load bearing masonry and the other is a flat slab held up on
 * thin posts, so the pair reads as two ways of standing something up rather than
 * as one drawing done twice.
 *
 * Amendment 7 gave it a second storey, and that is the same problem the portico
 * had solved a different way. Both drawings had to reach the top of the sheet.
 * The portico could not get there by stretching, because a pediment held at its
 * span goes wrong as soon as it steepens, so its height went into taller
 * columns. This one could not get there by stretching either, for the opposite
 * reason: the whole idea of the thing is a slab carried on posts thin enough to
 * disappear, and posts twice as long at the same thickness stop being posts and
 * start being wires. A frame gains height the way a frame actually does, by
 * repeating: one more deck, one more tier of posts, one more band of glazing.
 *
 * Line only, no fills and no tonal wash, per spec 0004's flat rule. Colour,
 * weight and `vector-effect` all come from `.sketch` in `app/app.css`.
 */

const GROUND = 940;
const CENTRE = 200;
const ROOF_TOP = 118;
const ROOF_SOFFIT = 148;
/** The upper deck: the underside of the storey above, and the floor of the one below. */
const DECK_TOP = 468;
const DECK_SOFFIT = 490;
const FLOOR = 856;

const POSTS = [96, 148, 200, 252, 304] as const;

/** The glazing behind the posts: horizontal rails, then the panes between them. */
const UPPER_RAILS = [212, 276, 340, 404] as const;
const LOWER_RAILS = [554, 618, 682, 746, 810] as const;
const MULLIONS = [122, 174, 226, 278] as const;

/** One tier of the frame: posts, glazing rails and mullions between two slabs. */
function Storey({
  top,
  bottom,
  rails,
}: {
  readonly top: number;
  readonly bottom: number;
  readonly rails: readonly number[];
}) {
  return (
    <g>
      {/* The glazing, drawn before the posts so the posts read as in front. */}
      {rails.map((y) => (
        <path key={y} d={`M 76 ${y} H 324`} />
      ))}
      {MULLIONS.map((x) => (
        <path key={x} d={`M ${x} ${top} V ${bottom}`} />
      ))}
      <path className="stroke-medium" d={`M 76 ${top} V ${bottom}`} />
      <path className="stroke-medium" d={`M 324 ${top} V ${bottom}`} />

      {POSTS.map((x) => (
        <g key={x}>
          <path className="stroke-heavy" d={`M ${x - 4} ${top} V ${bottom}`} />
          <path className="stroke-heavy" d={`M ${x + 4} ${top} V ${bottom}`} />
        </g>
      ))}
    </g>
  );
}

export function PavilionSketch({ className }: { readonly className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 60 400 940"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* The underdrawing: the axis, the horizon, and the cantilever the roof
          was set out to. */}
      <g className="stroke-guide">
        <path d={`M ${CENTRE} 990 V 60`} />
        <path d="M 6 660 H 394" />
        <path d={`M 6 ${DECK_TOP} H 394`} />
        <path d={`M 60 ${ROOF_TOP} V ${GROUND}`} />
        <path d={`M 340 ${ROOF_TOP} V ${GROUND}`} />
      </g>

      {/* The roof: one slab, cantilevered well past the posts at both ends. */}
      <path
        className="stroke-heavy"
        d={`M 36 ${ROOF_TOP} H 364 V ${ROOF_SOFFIT} H 36 Z`}
      />
      <path className="stroke-medium" d={`M 48 ${ROOF_TOP - 10} H 352`} />

      <Storey top={ROOF_SOFFIT} bottom={DECK_TOP} rails={UPPER_RAILS} />

      {/* The upper deck, cantilevered less than the roof over it. */}
      <path
        className="stroke-heavy"
        d={`M 52 ${DECK_TOP} H 348 V ${DECK_SOFFIT} H 52 Z`}
      />

      <Storey top={DECK_SOFFIT} bottom={FLOOR} rails={LOWER_RAILS} />

      {/* The core, the one solid thing inside an otherwise glass box. It runs
          both storeys, which is what makes them read as one building. */}
      <path
        className="stroke-medium"
        d={`M 168 ${FLOOR} V ${ROOF_SOFFIT} H 236 V ${FLOOR}`}
      />

      {/* The floor slab, and the terrace it sits on. */}
      <path
        className="stroke-heavy"
        d={`M 60 ${FLOOR} H 340 V ${FLOOR + 18} H 60 Z`}
      />
      <path className="stroke-medium" d={`M 20 900 H 380 V 918 H 20 Z`} />

      {/* One step down off the terrace at the near corner. */}
      <path className="stroke-medium" d={`M 244 918 H 330 V ${GROUND} H 244`} />

      {/* The ground, heavier than anything standing on it. */}
      <path className="stroke-heavy" d={`M 0 ${GROUND} H 400`} />
      <path className="stroke-guide" d={`M 0 ${GROUND + 22} H 400`} />
    </svg>
  );
}
