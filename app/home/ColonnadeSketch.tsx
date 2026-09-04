/**
 * A portico, standing in the left margin of the SIGNED OUT home screen.
 * Spec 0004, amendments 5 and 7.
 *
 * The signed out page is the hero and the upload card and nothing else, so it is
 * roughly half the height of the signed in one. The two tall studies were drawn
 * for that taller sheet and crop badly into a short one, so this pair is drawn
 * squat instead: a portico and a pavilion, both of which read at a glance
 * without needing a tower's worth of height to do it.
 *
 * A portico is also the one piece of architecture that is legible at any size,
 * which is why it is here rather than a fourth tower. Steps, columns,
 * entablature, pediment: four bands, no detail that depends on scale.
 *
 * Amendment 7 made it a tetrastyle rather than a hexastyle, and that was forced
 * rather than chosen. The building had to grow upward to reach the top of the
 * sheet, and a pediment cannot supply that height: hold the span and raise the
 * apex and the raking cornice steepens past anything classical and starts
 * reading as a barn gable. So the height went into the columns, where it
 * belongs, and once a column is that much taller it has to be that much thicker
 * or it reads as a stick. Four thick columns fit across the stylobate; six do
 * not. An even count also keeps the doorway on the axis, which is why this went
 * from six to four rather than to five.
 *
 * Line only, no fills and no tonal wash, per spec 0004's flat rule. Colour,
 * weight and `vector-effect` all come from `.sketch` in `app/app.css`.
 */

const GROUND = 940;
const CENTRE = 200;
const CAPITAL = 260;
const ARCHITRAVE = 200;
const APEX = 132;
const FINIAL = 104;
const STYLOBATE = 898;

/** The three steps up to the floor the columns stand on. */
const STEPS = [
  { top: 926, from: 30, to: 370 },
  { top: 912, from: 42, to: 358 },
  { top: STYLOBATE, from: 54, to: 346 },
] as const;

const COLUMNS = 4;
const COLUMN_HALF = 28;

/** Where each column stands, spread evenly across the stylobate. */
const SHAFTS = Array.from(
  { length: COLUMNS },
  (_, at) => 84 + (at * (316 - 84)) / (COLUMNS - 1),
);

/** The flutes down a shaft, as a fraction of its width either side of centre. */
const FLUTES = [-0.72, -0.43, -0.14, 0.14, 0.43, 0.72] as const;

function Column({ x }: { readonly x: number }) {
  const left = x - COLUMN_HALF;
  const right = x + COLUMN_HALF;

  return (
    <g>
      {/* The shaft. */}
      <path
        className="stroke-heavy"
        d={`M ${left} ${STYLOBATE} V ${CAPITAL}`}
      />
      <path
        className="stroke-heavy"
        d={`M ${right} ${STYLOBATE} V ${CAPITAL}`}
      />

      {/* The base and the capital, each a little wider than the shaft. */}
      <path
        className="stroke-medium"
        d={`M ${left - 6} ${STYLOBATE} V ${STYLOBATE - 22} H ${right + 6} V ${STYLOBATE}`}
      />
      <path
        className="stroke-medium"
        d={`M ${left - 7} ${CAPITAL + 26} V ${CAPITAL} H ${right + 7} V ${CAPITAL + 26} Z`}
      />

      {FLUTES.map((at) => (
        <path
          key={at}
          d={`M ${x + at * COLUMN_HALF} ${STYLOBATE - 22} V ${CAPITAL + 26}`}
        />
      ))}
    </g>
  );
}

export function ColonnadeSketch({ className }: { readonly className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 60 400 940"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* The underdrawing: the axis, the horizon, and the lines the pediment
          was set out on. */}
      <g className="stroke-guide">
        <path d={`M ${CENTRE} 990 V 60`} />
        <path d={`M 6 ${CAPITAL} H 394`} />
        <path d={`M 6 ${ARCHITRAVE} H 394`} />
        <path d={`M 22 ${ARCHITRAVE + 8} L ${CENTRE} ${APEX - 8}`} />
        <path d={`M 378 ${ARCHITRAVE + 8} L ${CENTRE} ${APEX - 8}`} />
        <path d={`M 20 ${STYLOBATE} H 380`} />
      </g>

      {/* The pediment: the raking cornice, and the line inside it. */}
      <path
        className="stroke-heavy"
        d={`M 34 ${ARCHITRAVE} L ${CENTRE} ${APEX} L 366 ${ARCHITRAVE}`}
      />
      <path
        className="stroke-medium"
        d={`M 58 ${ARCHITRAVE} L ${CENTRE} ${APEX + 15} L 342 ${ARCHITRAVE}`}
      />

      {/* The acroterion on the ridge, which is where the drawing ends. */}
      <path className="stroke-medium" d={`M ${CENTRE} ${APEX} V ${FINIAL}`} />
      <path
        className="stroke-medium"
        d={`M ${CENTRE - 11} ${FINIAL} H ${CENTRE + 11}`}
      />

      {/* The entablature, in its three bands. */}
      <path
        className="stroke-heavy"
        d={`M 34 ${ARCHITRAVE} H 366 V ${ARCHITRAVE + 18} H 34 Z`}
      />
      <path
        className="stroke-medium"
        d={`M 44 ${ARCHITRAVE + 18} H 356 V ${ARCHITRAVE + 44} H 44 Z`}
      />
      <path
        className="stroke-heavy"
        d={`M 48 ${ARCHITRAVE + 44} H 352 V ${CAPITAL} H 48 Z`}
      />

      {SHAFTS.map((x) => (
        <Column key={x} x={x} />
      ))}

      {STEPS.map((step) => (
        <path
          key={step.top}
          className="stroke-medium"
          d={`M ${step.from} ${step.top + 14} H ${step.to} V ${step.top} H ${step.from} Z`}
        />
      ))}

      {/* The ground, heavier than anything standing on it. */}
      <path className="stroke-heavy" d={`M 0 ${GROUND} H 400`} />
      <path className="stroke-guide" d={`M 0 ${GROUND + 22} H 400`} />
    </svg>
  );
}
