/**
 * Spec 0004 (docs/specs/0004-design-system-tokens-and-states/index.md), AC-1.
 *
 * Asserts that every colour token Roomify uses as text clears 4.5:1 against both
 * surface tones, and that clay clears 3:1 as a focus ring against both.
 *
 * This exists because ESLint cannot do arithmetic over CSS values. The lint
 * rules already stop a screen reaching for an off-system colour; what they
 * cannot catch is somebody editing the palette itself to a value that no longer
 * clears, which is exactly how both of the defects this feature fixed were
 * introduced. Run by `npm run verify`, so the palette is re-measured on every
 * commit rather than the one afternoon somebody thought to check it.
 *
 * Both surfaces are checked deliberately. The old accent cleared 4.62:1 on bone
 * and only 4.12:1 on ivory, and a `.btn-accent` sits inside the ivory
 * session-ended banner, so a bone-only check would have called it fine.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CSS = fileURLToPath(new URL("../app/app.css", import.meta.url));

/** Which tokens are read as text, and which are the surfaces they sit on. */
const SURFACES = ["bone", "ivory"];
const TEXT = ["ink", "ink-soft", "clay"];

/** WCAG 2.2: 4.5:1 for body text, 3:1 for a non-text boundary such as a ring. */
const TEXT_MINIMUM = 4.5;
const RING_MINIMUM = 3;

/**
 * Reads only the @theme block, so a hex written in a comment or a rule further
 * down the file cannot be mistaken for a live token.
 */
const readTokens = (css) => {
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css);
  if (theme === null) throw new Error(`No @theme block found in ${CSS}`);

  return new Map(
    [
      ...theme[1].matchAll(/--color-([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\s*;/g),
    ].map((match) => [match[1], match[2]]),
  );
};

const channels = (hex) =>
  [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);

/** WCAG relative luminance. */
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const demand = (tokens, name) => {
  const hex = tokens.get(name);
  if (hex === undefined)
    throw new Error(`--color-${name} is not declared in ${CSS}'s @theme block`);
  return hex;
};

/** Every pair to measure, as plain data, so the report and the check agree. */
const pairs = (tokens) =>
  SURFACES.flatMap((surface) => [
    ...TEXT.map((text) => ({
      what: `--color-${text} as text on --color-${surface}`,
      measured: ratio(demand(tokens, text), demand(tokens, surface)),
      minimum: TEXT_MINIMUM,
    })),
    {
      what: `--color-clay as a focus ring on --color-${surface}`,
      measured: ratio(demand(tokens, "clay"), demand(tokens, surface)),
      minimum: RING_MINIMUM,
    },
  ]);

const main = async () => {
  const results = pairs(readTokens(await readFile(CSS, "utf8")));
  const failures = results.filter(
    ({ measured, minimum }) => measured < minimum,
  );

  results.forEach(({ what, measured, minimum }) => {
    const mark = measured < minimum ? "FAIL" : "ok  ";
    console.log(
      `${mark} ${measured.toFixed(2)}:1 (needs ${minimum}:1)  ${what}`,
    );
  });

  if (failures.length > 0) {
    console.error(
      `\nContrast check failed. ${failures.length} of ${results.length} pairs are under the minimum:`,
    );
    failures.forEach(({ what, measured, minimum }) => {
      console.error(
        `  ${what} measures ${measured.toFixed(2)}:1, under ${minimum}:1`,
      );
    });
    console.error(
      "\nFix the palette in app/app.css. Every text token has to clear 4.5:1 against\nboth bone and ivory, so no component has to know which surface it is on.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${results.length} pairs clear their minimum.`);
};

await main();
