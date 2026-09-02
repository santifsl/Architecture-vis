/**
 * The comparison's own constants. Spec 0009.
 *
 * Pure, no I/O, and no React, same reason as `app/render/rules.ts`: the two
 * values a screen would otherwise state inline are the two that would drift if
 * they were ever written twice, so they are named once and read from here.
 *
 * `keyboardIncrement` is deliberately NOT here. The library's own default is 5%,
 * and asserting the same number a second time would create two places that have
 * to agree about one behaviour.
 */

/**
 * Where the divider sits when the comparison arrives. Spec 0009, AC-2.
 *
 * Halfway, so both pictures are equally present and neither is the one you have
 * to go looking for. Passed as `defaultPosition`, which is v4's name for it;
 * The v2 and v3 name for the same prop means nothing to the installed version,
 * which would silently fall back to its own 50 and look identical while ignoring
 * us. Spec 0009, AC-12, names the old spelling; nothing in `app/` may (AC-12).
 */
export const COMPARE_START_POSITION = 50;

/**
 * What each side is called, in the order the frame shows them. Spec 0009, AC-6.
 *
 * The words live beside the position rather than inline in the markup because
 * they are a pair: the left label and `itemOne` are one fact, and swapping the
 * images without swapping the labels is the defect this makes visible.
 */
export const COMPARE_LABELS = {
  left: "Floor plan",
  right: "Render",
} as const;
