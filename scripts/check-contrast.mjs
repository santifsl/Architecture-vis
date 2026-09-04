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

/**
 * Every palette token has to be classified, and the classification is a closed
 * set the same way the palette is.
 *
 * Only two lists are written by hand: the surfaces other things sit on, and the
 * tokens that are decorative and so carry no text contrast duty. EVERY other
 * `--color-*` token in `@theme` is measured as text. That direction is
 * deliberate and it is the whole point of this file: adding a token opts it INTO
 * the check by default, so a new colour cannot be introduced, used as text, and
 * quietly skipped. The earlier version listed the text tokens by hand, which
 * meant a new `--color-warning` sailed through both lint and this script while
 * measuring about 1.8:1 against bone.
 *
 * Both lists are also checked to still exist, so renaming a token fails loudly
 * here rather than silently dropping it out of coverage.
 */
/*
 * `sketch-ground` joined these in spec 0004's amendment 5, and the promotion is
 * the point rather than a detail. Amendment 4 put the drawings behind the hero
 * only, where everything focusable sits on the opaque upload card, so the token
 * lived in TEXT_ONLY_SURFACES on the argument that no control could ever be
 * painted on it. Amendment 5 runs them the whole length of the page, so the
 * gallery's card links and its `See all` link are now on the drawing, a focus
 * ring can land there, and that argument is dead. A full surface is measured
 * against every text token AND the ring minimum, which is what it now needs.
 */
const SURFACES = ["bone", "ivory", "sketch-ground"];

/**
 * Decorative only. `hairline` draws borders and dividers, never text and never a
 * boundary a control depends on, so WCAG's text and non-text minimums do not
 * apply to it. Anything added here needs that same argument in writing.
 */
const DECORATIVE = ["hairline"];

/**
 * A surface that carries text and can never carry a control, mapped to the
 * closed set of inks that actually appear on it. Spec 0007, AC-6.
 *
 * `scrim-ground` is the only member: the precomputed worst case ground behind
 * the render plate's busy message, bone at 72% over a solid black floor plan.
 * The overlay it describes holds one paragraph and nothing else, so it differs
 * from a real surface in two ways and both are load bearing.
 *
 * No focus ring can appear on it, because there is nothing focusable there.
 * Measuring clay as a ring against it would fail at 2.64:1 on a pairing that
 * cannot occur, and a check that fails for an impossible reason teaches people
 * to loosen the minimum.
 *
 * The same argument applies to text, which is the part spec 0007 did not carry
 * far enough and the arithmetic settled during the build: `ink-soft` measures
 * 2.61:1 on this ground and clay 2.64:1, and neither is ever painted on it.
 * Measuring EVERY text token here would fail the build on two more pairings
 * that cannot occur. So this bucket names its inks rather than taking all of
 * them, and it names them by hand precisely so the naming is the claim: `ink`
 * is listed because `.plate-message` sets `--color-ink`, and if the overlay ever
 * says anything in a second colour, that colour has to be added here before it
 * is measured, or it is not covered.
 *
 * The guarantee spec 0007 wanted is intact: change `--color-ink`, or change
 * `.plate-veil`'s 72% and with it this token, and `npm run verify` fails rather
 * than a person quietly failing to read the message. If the overlay ever gains a
 * focusable control, move the token into SURFACES and recompute; do not keep the
 * exemption.
 */
const TEXT_ONLY_SURFACES = {
  "scrim-ground": ["ink"],

  /*
   * The two filled buttons while they work, and the home screen's line drawing.
   * Spec 0004, amendments 3 and 4. All three are precomputed grounds in the same
   * sense `scrim-ground` is: what a transparent layer composites to, written
   * into `@theme` so it can be measured rather than asserted.
   *
   * They sit here rather than in SURFACES for the reason that bucket exists, but
   * the argument differs slightly from `scrim-ground`'s and is worth writing
   * down. `scrim-ground` carries no control at all. A busy button plainly IS a
   * control, and stays focusable on purpose. What makes the ring minimum
   * inapplicable is `--ring-offset`: the focus ring is drawn two pixels clear of
   * the control, so it lands on the page behind, never on the fill. `clay as a
   * focus ring on bone` is therefore the pairing that can actually occur, and
   * SURFACES already measures it.
   *
   * That exemption is exactly the one `sketch-ground` used to hold and no longer
   * does. It was written on the same reasoning, that the drawings reached only
   * the hero and everything focusable there sat on an opaque card, and spec
   * 0004's amendment 5 invalidated it by running them the whole length of the
   * page. It is in SURFACES now. Take that as the worked example for these two:
   * the argument is about where the thing is on screen, so it has to be re-made
   * every time the thing moves.
   */
  "clay-busy-ground": ["ink"],
  "neutral-busy-ground": ["ink"],
};

/**
 * A colour used as a filled control's background, mapped to the ink painted on
 * it. Spec 0004, amendment 3.
 *
 * This bucket exists because the palette gained a direction it did not have
 * before. Until the filled buttons, `bone` was only ever a surface and never a
 * text colour, so the script's "everything that is not a surface is text" rule
 * covered the whole app. `.btn-primary` and `.btn-neutral` paint a bone label on
 * a colour that was itself classified as text, which is the exact pairing the
 * old model could not express and would have skipped in silence.
 *
 * Only the REST fills are listed, and that is deliberate rather than a gap. Both
 * hover mixes move their fill toward `ink`, so a bone label on either can only
 * measure better than it does at rest; if rest clears, hover clears. Both busy
 * mixes move the other way, toward bone, which is why those two get precomputed
 * tokens above instead of an argument.
 */
const CONTROL_FILLS = {
  clay: ["bone"],
  "ink-soft": ["bone"],
};

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

/**
 * Everything not named a surface and not named decorative is text, derived from
 * the tokens actually declared rather than from a second hand-kept list.
 */
const textTokens = (tokens) =>
  [...tokens.keys()].filter(
    (name) =>
      !SURFACES.includes(name) &&
      !DECORATIVE.includes(name) &&
      !(name in TEXT_ONLY_SURFACES),
  );

/**
 * Fails if a hand-written name no longer exists, so a rename cannot silently
 * shrink what gets measured.
 */
const checkClassification = (tokens) => {
  const named = [
    ...SURFACES,
    ...DECORATIVE,
    ...Object.keys(TEXT_ONLY_SURFACES),
    ...Object.values(TEXT_ONLY_SURFACES).flat(),
    ...Object.keys(CONTROL_FILLS),
    ...Object.values(CONTROL_FILLS).flat(),
  ];
  const missing = named.filter((name) => !tokens.has(name));
  if (missing.length > 0)
    throw new Error(
      `${CSS} no longer declares ${missing
        .map((name) => `--color-${name}`)
        .join(", ")}. ` +
        `Update SURFACES, DECORATIVE or TEXT_ONLY_SURFACES in this file to match the palette.`,
    );
};

/** Every pair to measure, as plain data, so the report and the check agree. */
const pairs = (tokens) => {
  checkClassification(tokens);
  const text = textTokens(tokens);

  return [
    ...SURFACES.flatMap((surface) => [
      ...text.map((name) => ({
        what: `--color-${name} as text on --color-${surface}`,
        measured: ratio(demand(tokens, name), demand(tokens, surface)),
        minimum: TEXT_MINIMUM,
      })),
      {
        what: `--color-clay as a focus ring on --color-${surface}`,
        measured: ratio(demand(tokens, "clay"), demand(tokens, surface)),
        minimum: RING_MINIMUM,
      },
    ]),
    // Only the inks each of these surfaces actually carries, and no ring: see
    // TEXT_ONLY_SURFACES above for why both narrowings are deliberate.
    ...Object.entries(TEXT_ONLY_SURFACES).flatMap(([surface, inks]) =>
      inks.map((name) => ({
        what: `--color-${name} as text on --color-${surface}`,
        measured: ratio(demand(tokens, name), demand(tokens, surface)),
        minimum: TEXT_MINIMUM,
      })),
    ),
    // A filled control's label on its own fill. No ring pairing here either:
    // --ring-offset keeps the ring off the fill. See CONTROL_FILLS above.
    ...Object.entries(CONTROL_FILLS).flatMap(([fill, inks]) =>
      inks.map((name) => ({
        what: `--color-${name} as a label on the --color-${fill} fill`,
        measured: ratio(demand(tokens, name), demand(tokens, fill)),
        minimum: TEXT_MINIMUM,
      })),
    ),
  ];
};

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
      "\nFix the palette in app/app.css. Every text token has to clear 4.5:1 against\nboth bone and ivory, so no component has to know which surface it is on.\n" +
        "If the token above is decorative and never carries text, add it to\nDECORATIVE in this file, with the reason, rather than loosening the minimum.\n" +
        "If it is a surface that carries text but can never carry a control, add it\nto TEXT_ONLY_SURFACES with the inks it actually carries.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${results.length} pairs clear their minimum.`);
};

await main();
