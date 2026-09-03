/**
 * Every way a download can fail, and the one sentence each one shows.
 * Spec 0012, build task 3, AC-7, AC-8, AC-9.
 *
 * Same shape as `app/upload/failures.ts`, `app/render/failures.ts` and
 * `app/projects/store.ts`, on purpose: four modules that all turn a rejection
 * into something a person can read should read alike, or the next one invents a
 * fifth convention.
 *
 * The rule these sentences follow, from CLAUDE.md: a person never sees a raw
 * exception, a provider message, an HTTP status, or an SDK error code. None of
 * them needs the reader to know that Puter, or a blob, or an object URL exists.
 */

/** Why a download did not happen. Internal; the sentence is what a person sees. */
export type DownloadFailure = "signedOut" | "unreadable" | "unreachable";

export const DOWNLOAD_MESSAGES: Readonly<Record<DownloadFailure, string>> = {
  signedOut:
    "Your Puter session ended, so this render can't be read. Sign in again to download it.",
  unreadable: "This render can't be found in your storage right now.",
  unreachable: "The download didn't finish. That's usually the connection.",
};

/** The words on the retry, written once so two surfaces cannot word it differently. */
export const RETRY_LABEL = "Try the download again";

/**
 * May this failure be retried? Spec 0012, AC-8.
 *
 * `signedOut` offers no action, because pressing the same button again cannot
 * fix a session that has ended, and telling someone to retry something that
 * cannot work is how a person ends up pressing a button five times. Signing in
 * remounts the route, which is what actually clears it.
 */
export const isRetryable = (failure: DownloadFailure): boolean =>
  failure !== "signedOut";

/** What every call in this feature returns. Nothing here ever throws at a caller. */
export type DownloadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: DownloadFailure };

export const succeed = <T>(value: T): DownloadResult<T> => ({
  ok: true,
  value,
});

export const fail = <T>(failure: DownloadFailure): DownloadResult<T> => ({
  ok: false,
  failure,
});
