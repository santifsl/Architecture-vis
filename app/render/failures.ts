/**
 * Every way a render can fail, and the one sentence each one shows.
 * Spec 0006, build task 5, AC-9.
 *
 * Same shape as `app/upload/failures.ts` and `app/projects/store.ts`, on
 * purpose: three modules that all turn a rejection into something a person can
 * read should read alike, or the next one invents a fourth convention.
 *
 * The rule these sentences follow, from CLAUDE.md: a person never sees a raw
 * exception, a provider message, an HTTP status, or a model name from an error.
 * The worker answers with a code and no message at all, so there is no path
 * from a provider string to a screen even by accident. Every sentence says what
 * happened and what to do next, and none of them needs the reader to know that
 * Puter, or any particular model, exists.
 */

/**
 * Codes the worker returns.
 *
 * `visionFailed` and `visionRefused` were deleted here in spec 0007, and the
 * timing was the whole point: they came out AFTER the one-call worker was
 * deployed and proven, not alongside the client changes. While the two-stage
 * worker was still live it could still answer `visionRefused`, and a client that
 * had already forgotten the code would have dropped it on `renderMessage`'s
 * fallback and said "the render service sent back something this app couldn't
 * read", which is both wrong and less useful than the sentence it replaced.
 *
 * There is no reading stage left for them to describe now, and a code with no
 * stage behind it is a sentence nobody can ever reach.
 */
const WORKER_CODES = [
  "planUnreadable",
  "paintFailed",
  "paintRefused",
  "outOfAllowance",
  "badRequest",
] as const;

/** Codes the client decides for itself, without the worker's help. */
const CLIENT_CODES = [
  "timeout",
  "unreachable",
  "signedOut",
  "stalled",
  "badResponse",
] as const;

export const RENDER_FAILURES = [...WORKER_CODES, ...CLIENT_CODES] as const;
export type RenderFailure = (typeof RENDER_FAILURES)[number];

export const isRenderFailure = (value: unknown): value is RenderFailure =>
  RENDER_FAILURES.some((code) => code === value);

/**
 * One sentence per code.
 *
 * `paintRefused` is worth keeping apart from `paintFailed` even though both end
 * in a retry: a model declining this particular floor plan will decline it
 * again, so the useful next step is a different image, while a failure is worth
 * simply retrying. Telling someone to retry something that cannot work is how a
 * person ends up pressing a button five times.
 */
export const RENDER_MESSAGES: Readonly<Record<RenderFailure, string>> = {
  planUnreadable:
    "Your floor plan couldn't be opened, so there was nothing to work from. Try uploading it again.",
  paintFailed: "The render didn't finish. Try it again.",
  paintRefused:
    "The render was turned down before it was drawn. Try a different floor plan.",
  outOfAllowance:
    "You've used up your Puter allowance for now. Top it up, then try this render again.",
  badRequest:
    "Something was wrong with that request, so nothing was generated. Try it again.",
  timeout:
    "This render took longer than two minutes, so it was stopped. Try it again.",
  unreachable:
    "Couldn't reach the render service just now. Check your connection and try again.",
  signedOut: "You're signed out. Sign in and start this render again.",
  stalled:
    "This render stopped partway through, probably because the tab was closed. Try it again.",
  badResponse:
    "The render service sent back something this app couldn't read. Try it again.",
};

/** The sentence for a code, and a safe one for a code from somewhere unexpected. */
export const renderMessage = (code: string | null): string =>
  isRenderFailure(code) ? RENDER_MESSAGES[code] : RENDER_MESSAGES.badResponse;
