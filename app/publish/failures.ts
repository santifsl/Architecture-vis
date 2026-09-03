/**
 * Every way a publish can fail, and the one sentence each one shows.
 * Spec 0011, build task 6. AC-14.
 *
 * Same shape as `app/render/failures.ts` and `app/upload/failures.ts`, on
 * purpose: four modules that turn a rejection into something a person can read
 * should read alike, or the next one invents a fifth convention.
 *
 * The standing rule, from CLAUDE.md: nobody ever sees a raw exception, a
 * provider message or an HTTP status. The worker answers with a code and no
 * message at all, so there is no path from a provider string to a screen even by
 * accident, and every sentence below says what happened and what to do next.
 */

/** Codes the worker returns from `POST /publish`. */
const WORKER_CODES = [
  /** The record was read and is not a shape a public copy can be built from. */
  "malformed",
  /** The record does not say `public` yet, so the intent write never landed. */
  "notPublic",
  /** Nothing is finished, so there would be nothing to show (AC-6). */
  "noRender",
  /** The visibility changed while the files were being copied. */
  "withdrawn",
  /** A file could not be read as its owner, or written as the app. */
  "copyFailed",
  /** The app's own identity, hosting, or store was not reachable. */
  "publishUnavailable",
  "notFound",
  "badRequest",
] as const;

/** Codes the client decides for itself, without the worker's help. */
const CLIENT_CODES = [
  "signedOut",
  "unreachable",
  "timeout",
  "badResponse",
  /** The record could not be written, so the publish was never started. */
  "notSaved",
  /** A newer publish of the same project already landed, so this answer was dropped. */
  "superseded",
] as const;

export const PUBLISH_FAILURES = [...WORKER_CODES, ...CLIENT_CODES] as const;
export type PublishFailure = (typeof PUBLISH_FAILURES)[number];

export const isPublishFailure = (value: unknown): value is PublishFailure =>
  PUBLISH_FAILURES.some((code) => code === value);

/**
 * One sentence per code.
 *
 * Two of them deliberately do not offer a retry, because retrying is not what
 * would help. `noRender` needs a finished render first, and `notPublic` means
 * the record never got the write that says the project is meant to be shared,
 * which the same button pressed again is what fixes.
 *
 * `withdrawn` is not a failure of anything: somebody made the project private
 * while it was being copied, and the honest thing to say is that it worked.
 */
export const PUBLISH_MESSAGES: Readonly<Record<PublishFailure, string>> = {
  malformed:
    "This project can't be shared as it stands. Open it, check the name and the render, and try again.",
  notPublic:
    "This project isn't marked as shared yet. Press Make public again to share it.",
  noRender:
    "There's nothing to show yet. Wait for a render to finish, then share the project.",
  withdrawn: "This project was made private while it was being shared.",
  copyFailed:
    "The public copies of your images couldn't be made. Try sharing it again.",
  publishUnavailable:
    "Sharing isn't available just now. Try again in a few moments.",
  notFound: "That project is no longer here. It may have been deleted.",
  badRequest:
    "Something was wrong with that request, so nothing was shared. Try it again.",
  signedOut: "You're signed out. Sign in and share this project again.",
  unreachable:
    "Couldn't reach the sharing service just now. Check your connection and try again.",
  timeout: "Sharing took too long, so it was stopped. Try it again.",
  badResponse:
    "The sharing service sent back something this app couldn't read. Try it again.",
  notSaved:
    "This project couldn't be saved, so it wasn't shared. Check your connection and try again.",
  superseded:
    "A newer version of this project was shared while this one was in flight, so this copy was left alone.",
};

/** The sentence for a code, and a safe one for a code from somewhere unexpected. */
export const publishMessage = (code: string | null): string =>
  isPublishFailure(code)
    ? PUBLISH_MESSAGES[code]
    : PUBLISH_MESSAGES.badResponse;
