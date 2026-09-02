/**
 * Every way reading the community feed can fail, and the one sentence each one
 * shows. Spec 0011, build task 7. AC-14.
 *
 * Short, because there is very little a reader can do about any of it and
 * pretending otherwise would be worse than saying so. The feed is a read of a
 * store the app owns: either it answered or it did not.
 */
const FEED_FAILURES = [
  /** The worker could not reach the app's own store. */
  "feedUnavailable",
  /** The limit or the cursor was refused. Not something a reader can cause. */
  "badRequest",
  "unreachable",
  "timeout",
  "badResponse",
] as const;

export type FeedFailure = (typeof FEED_FAILURES)[number];

export const isFeedFailure = (value: unknown): value is FeedFailure =>
  FEED_FAILURES.some((code) => code === value);

export const FEED_MESSAGES: Readonly<Record<FeedFailure, string>> = {
  feedUnavailable:
    "The community feed isn't available just now. Try again in a few moments.",
  badRequest:
    "That page of the feed couldn't be read. Go back to the start of the feed and try again.",
  unreachable:
    "Couldn't reach the community feed just now. Check your connection and try again.",
  timeout: "The community feed took too long to answer. Try again.",
  badResponse:
    "The community feed sent back something this app couldn't read. Try again.",
};

/** The sentence for a code, and a safe one for a code from somewhere unexpected. */
export const feedMessage = (code: string | null): string =>
  isFeedFailure(code) ? FEED_MESSAGES[code] : FEED_MESSAGES.badResponse;
