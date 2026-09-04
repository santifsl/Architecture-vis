/**
 * A setback tower, standing in the left margin of the home screen.
 * Spec 0004, amendments 4 and 7.
 *
 * Recreated from `assets/image_6f1a843.jpg`, a pencil study of the Burj Khalifa.
 * What is taken from it is the thing that actually makes it read as that
 * building: the setbacks step at DIFFERENT heights on each side, because the
 * real plan is a three winged spiral and no two wings stop at the same floor. An
 * elevation with matched steps reads as a wedding cake instead, which is what a
 * first attempt at this drawing did.
 *
 * The second thing taken is that the tower is vertical before it is anything
 * else. The mullions are fine and closely spaced, and each one stops at the
 * height where the wall it sits on steps away, so the skin thins as it rises
 * without a single horizontal being needed to say so.
 *
 * What is deliberately NOT taken is everything that is not a line. The reference
 * gets its depth from graphite shading and paper tone; this has no fill, no
 * gradient and no tonal wash anywhere, per spec 0004's flat rule. Three line
 * weights do the work shading did.
 *
 * The geometry is frozen constants and pure functions over them, evaluated once
 * at module scope. There is no randomness and nothing that runs per frame: every
 * render returns the identical drawing.
 *
 * Colour, width and `vector-effect` all come from `.sketch` in `app/app.css`.
 */

const CENTRE = 200;
const GROUND = 1040;

/**
 * How the authored proportions are fitted to the sheet. Spec 0004, amendment 7.
 *
 * The profile below is written in the reference drawing's own proportions, where
 * the tower is 944 tall and 236 across. The sheet it now has to fill is 2000
 * tall and 400 across, because amendment 5 ran these drawings the whole length
 * of the page. Amendment 5 answered that by drawing the building at its authored
 * size and putting a PLAN on the paper above it; amendment 7 removed the plan,
 * on the grounds that a ring of setting out circles floating over a tower reads
 * as an ornament laid on top of the drawing rather than as part of it, which is
 * exactly what scope.md feature 4 refused. With the plan gone the honest answer
 * is the one a drafter would give: draw the building bigger.
 *
 * So the elevation is stretched about the ground line until its needle reaches
 * the top of the sheet, and widened by rather less, which is what turns it from
 * a tall building into a slender one. The two factors are separate on purpose:
 * equal factors would just be a zoom, and a zoom cannot fill a column this much
 * taller than it is wide without running off both sides of it.
 *
 * Both are applied at the LAST moment, so every number below stays in the
 * reference's proportions and stays comparable to it.
 */
const STRETCH = 1.8375;
const SPREAD = 1.2;

/** An authored height, placed on the sheet. The ground line does not move. */
const rise = (y: number): number => GROUND - (GROUND - y) * STRETCH;

/** An authored half width, placed on the sheet. The centre line does not move. */
const spread = (half: number): number => half * SPREAD;

/** The top of the shaft, where the two walls run together into the spire. */
const APEX = rise(96);

type Band = {
  /** The height this band steps in at. It runs from the band below up to here. */
  readonly top: number;
  readonly half: number;
};

/** An authored band, placed on the sheet. */
const place = (bands: readonly Band[]): readonly Band[] =>
  bands.map(({ top, half }) => ({ top: rise(top), half: spread(half) }));

/**
 * The two profiles, bottom to top, each stepping at heights the other does not.
 * This asymmetry is the whole drawing; matched arrays would undo it.
 */
const LEFT = place([
  { top: 900, half: 118 },
  { top: 760, half: 104 },
  { top: 620, half: 90 },
  { top: 500, half: 76 },
  { top: 400, half: 62 },
  { top: 320, half: 50 },
  { top: 250, half: 38 },
  { top: 195, half: 28 },
  { top: 150, half: 19 },
  { top: 96, half: 12 },
]);

const RIGHT = place([
  { top: 960, half: 112 },
  { top: 830, half: 99 },
  { top: 700, half: 85 },
  { top: 575, half: 71 },
  { top: 465, half: 57 },
  { top: 372, half: 45 },
  { top: 292, half: 34 },
  { top: 228, half: 24 },
  { top: 174, half: 16 },
  { top: 96, half: 10 },
]);

/** The half width in force at a height. Bands run bottom to top, so the first that reaches it wins. */
const halfAt = (y: number, bands: readonly Band[]): number =>
  (bands.find((band) => band.top <= y) ?? bands[bands.length - 1]).half;

/**
 * The silhouette of one side, as a stair: up the wall, in at the setback, up
 * again. `sign` is -1 for the left profile and 1 for the right.
 */
const profile = (bands: readonly Band[], sign: number): string =>
  bands.reduce(
    (path, band) =>
      `${path} V ${band.top.toFixed(1)} H ${(CENTRE + sign * band.half).toFixed(1)}`,
    `M ${(CENTRE + sign * bands[0].half).toFixed(1)} ${GROUND}`,
  );

/**
 * A mullion runs from the ground to the height where the wall carrying it steps
 * away. Fine, closely spaced, and each ending somewhere different, which is what
 * makes the skin read as thinning rather than as a grid.
 */
const mullions = (bands: readonly Band[], sign: number): readonly string[] =>
  Array.from({ length: 15 }, (_, at) => spread(7 + at * 7.5))
    .map((offset) => ({
      offset,
      // Bands run bottom to top with the half width shrinking, so the ones wide
      // enough to carry this mullion are a prefix, and the last of them is where
      // the wall steps away and the line stops.
      carrying: bands.filter((band) => band.half > offset),
    }))
    // An offset wider than the widest band belongs to no wall at all, and there
    // is nothing to draw. The right hand profile's widest band is exactly 112,
    // which is exactly the outermost offset, so this drops one mullion there and
    // none on the left. Both sides of that comparison go through `spread`, so it
    // is still one number against itself and the equality still holds exactly.
    // Removing this filter is what crashed the home screen.
    .filter(({ carrying }) => carrying.length > 0)
    .map(
      ({ offset, carrying }) =>
        `M ${(CENTRE + sign * offset).toFixed(1)} ${GROUND} V ${carrying[carrying.length - 1].top.toFixed(1)}`,
    );

/**
 * The floor bands, spanning whatever width the tower has at that height.
 *
 * Generated at an even authored pitch rather than typed, which is amendment 7's
 * doing: the twelve hand-placed heights were pitched for a 944 tall elevation
 * and left 200 unit gaps once it was stretched to fill the sheet, so the tower
 * lost the horizontal grain that stops the mullions reading as hatching.
 */
const BANDS = Array.from({ length: 15 }, (_, at) => rise(985 - at * 61));

/** The low city at its feet, which is what gives the tower its scale. */
const NEIGHBOURS = [
  { x: 4, width: 58, top: 906 },
  { x: 50, width: 40, top: 948 },
  { x: 306, width: 48, top: 918 },
  { x: 344, width: 52, top: 880 },
  { x: 96, width: 30, top: 964 },
  { x: 276, width: 32, top: 956 },
] as const;

export function TowerSketch({ className }: { readonly className: string }) {
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
        the right hand margin, the axis it is struck from, a horizon, and the two
        lines converging on the spire. Amendment 7 left exactly this and the
        building, and nothing else. The drawing is the tower and the marks a
        drafter would have made to get it, which is the whole brief.
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
        <path d={`M 14 1090 L 188 ${(APEX - 40).toFixed(1)}`} />
        <path d={`M 386 1090 L 212 ${(APEX - 40).toFixed(1)}`} />
        <path d="M 6 700 H 394" />
        <path d="M 6 -240 H 394" />
      </g>

      {NEIGHBOURS.map((block) => (
        <g key={`${block.x}-${block.top}`} className="stroke-medium">
          <path
            d={`M ${block.x} ${GROUND} V ${block.top} H ${block.x + block.width} V ${GROUND}`}
          />
          <path
            d={`M ${block.x} ${block.top + 28} H ${block.x + block.width}`}
          />
          <path
            d={`M ${block.x} ${block.top + 62} H ${block.x + block.width}`}
          />
        </g>
      ))}

      {/* The skin: fine verticals, each stopping where its wall steps away. */}
      {[...mullions(LEFT, -1), ...mullions(RIGHT, 1)].map((d) => (
        <path key={d} d={d} />
      ))}

      {BANDS.map((y) => (
        <path
          key={y}
          className="stroke-medium"
          d={`M ${(CENTRE - halfAt(y, LEFT)).toFixed(1)} ${y.toFixed(1)} H ${(CENTRE + halfAt(y, RIGHT)).toFixed(1)}`}
        />
      ))}

      {/* The silhouette last, so it reads as the edge of a solid thing. */}
      <path className="stroke-heavy" d={profile(LEFT, -1)} />
      <path className="stroke-heavy" d={profile(RIGHT, 1)} />

      {/* The spire: the two walls running together, then the needle. */}
      <path
        className="stroke-heavy"
        d={`M ${CENTRE - spread(12)} ${APEX.toFixed(1)} L ${CENTRE} ${rise(34).toFixed(1)}`}
      />
      <path
        className="stroke-heavy"
        d={`M ${CENTRE + spread(10)} ${APEX.toFixed(1)} L ${CENTRE} ${rise(34).toFixed(1)}`}
      />
      <path
        className="stroke-medium"
        d={`M ${CENTRE} ${rise(34).toFixed(1)} V ${rise(6).toFixed(1)}`}
      />

      {/* The ground, heavier than anything standing on it. */}
      <path className="stroke-heavy" d={`M 0 ${GROUND} H 400`} />
      <path className="stroke-guide" d={`M 0 ${GROUND + 24} H 400`} />
    </svg>
  );
}
