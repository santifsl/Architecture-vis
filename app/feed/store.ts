/**
 * The one place in the app that reads the community feed. Spec 0011, build
 * task 7.
 *
 * **This is the one Puter call in the app that does not go through
 * `withPuter`, and the reason is the feature itself.** `withPuter` rejects with
 * `PuterGateError` when no token is held, which is exactly right for every
 * other call in this app and exactly wrong for this one: AC-3 says a signed out
 * visitor loads the feed, and a signed out visitor holds no token by
 * definition. Spec 0011 wrote this route as `workers.exec` behind `withPuter`
 * carrying `x-puter-no-auth` when the reader is signed out, which cannot work,
 * because the gate refuses before the header is ever sent. So the anonymous
 * routes are a plain `fetch` instead.
 *
 * Nothing is lost by that. `workers.exec` exists to attach a session, and this
 * route deliberately has none: the worker reads it out of the app's own store
 * and never looks at `user`. Sending a session would buy nothing and would mean
 * a signed in reader and a signed out one taking two different code paths to
 * the same public data. The header goes on every call, signed in or out, for the
 * same reason.
 *
 * No SDK import is involved, so the rule `app/platform/AGENTS.md` actually owns,
 * that only `puter.ts` imports `@heyputer/puter.js`, is untouched.
 *
 * Nothing here throws at its caller and nothing raw escapes. Every entry is
 * PARSED rather than cast, and one unreadable entry costs its own card rather
 * than the page it arrived on.
 */
import { workerEndpoint } from "~/platform/env";
import { feedMessage, isFeedFailure, type FeedFailure } from "~/feed/failures";
import {
  isModelId,
  SCHEMA_VERSION,
  type FeedEntry,
  type ModelId,
} from "~/projects/record";

/** How many cards one page of the feed holds. AC-12: every read is bounded. */
export const FEED_PAGE_SIZE = 24;

/** How long a feed read may take before it is hung up on. */
export const FEED_TIMEOUT_MS = 20_000;

/**
 * Puter's own header for a worker call with no session attached. Without it an
 * unauthenticated request never reaches the route.
 */
const ANONYMOUS_HEADER = "x-puter-no-auth";

export type FeedPage = {
  readonly entries: readonly FeedEntry[];
  /** The cursor for the next page, or `null` when this is the last one. */
  readonly cursor: string | null;
  /** How many entries on this page this build could not read. Usually zero. */
  readonly unreadable: number;
};

export type FeedOutcome =
  | { readonly ok: true; readonly value: FeedPage }
  | {
      readonly ok: false;
      readonly failure: FeedFailure;
      /** A plain sentence, safe to render as-is. */
      readonly message: string;
    };

const failed = (failure: FeedFailure): FeedOutcome => ({
  ok: false,
  failure,
  message: feedMessage(failure),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCounter = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Narrows one entry, or gives up on it.
 *
 * The worker writes this store and nothing else does, so an entry that fails
 * here is from a build that is not this one. That is a card worth skipping and
 * not a page worth failing, the same rule `listProjects` applies to a record it
 * cannot read.
 *
 * `models` is filtered rather than refused when it names something unknown: a
 * second model coming back through the seam spec 0007 left open would otherwise
 * make every card written by the newer build vanish from an older one. The
 * models kept are the ones that have a URL to show.
 */
export const parseFeedEntry = (value: unknown): FeedEntry | null => {
  if (!isRecord(value)) return null;
  if (value["schemaVersion"] !== SCHEMA_VERSION) return null;

  const projectId = value["projectId"];
  const name = value["name"];
  const author = value["author"];
  const floorPlanUrl = value["floorPlanUrl"];
  const publishedAt = value["publishedAt"];
  const publishedRevision = value["publishedRevision"];
  const rawModels = value["models"];
  const rawUrls = value["renderUrls"];

  if (
    !isNonEmptyString(projectId) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(author) ||
    !isNonEmptyString(floorPlanUrl) ||
    !isCounter(publishedAt) ||
    !isCounter(publishedRevision) ||
    !Array.isArray(rawModels) ||
    !isRecord(rawUrls)
  )
    return null;

  const renderUrls = Object.fromEntries(
    Object.entries(rawUrls).filter(
      (pair): pair is [ModelId, string] =>
        isModelId(pair[0]) && isNonEmptyString(pair[1]),
    ),
  ) as Partial<Record<ModelId, string>>;

  const models = rawModels.filter(
    (model): model is ModelId =>
      isModelId(model) && renderUrls[model] !== undefined,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    name,
    author,
    models,
    renderUrls,
    floorPlanUrl,
    publishedAt,
    publishedRevision,
  };
};

/** The code inside a failure body, if it is one this app knows. */
const failureCode = (body: unknown): FeedFailure | null => {
  if (!isRecord(body)) return null;
  const code = body["errorCode"];
  return isFeedFailure(code) ? code : null;
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * One page of the feed, newest first.
 *
 * `cursor` is opaque and is the whole of "is there more": spec 0011's task 1
 * probe established that the store's cursor remembers the last key it handed
 * out rather than an offset, so an entry unpublished between two pages cannot
 * make an unrelated card disappear. It is passed back exactly as it arrived and
 * nothing here reads anything into it.
 */
export const readFeedPage = async (
  cursor: string | null = null,
): Promise<FeedOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FEED_TIMEOUT_MS);

  const query = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) });
  if (cursor !== null) query.set("cursor", cursor);

  try {
    const response = await fetch(
      `${workerEndpoint("/feed")}?${query.toString()}`,
      {
        method: "GET",
        headers: { [ANONYMOUS_HEADER]: "true" },
        signal: controller.signal,
      },
    );

    const body = await readJson(response);
    if (!response.ok) return failed(failureCode(body) ?? "badResponse");
    if (!isRecord(body) || !Array.isArray(body["entries"]))
      return failed("badResponse");

    const parsed = body["entries"].map(parseFeedEntry);
    const entries = parsed.filter(
      (entry): entry is FeedEntry => entry !== null,
    );
    const next = body["cursor"];

    return {
      ok: true,
      value: {
        entries,
        cursor: isNonEmptyString(next) ? next : null,
        unreadable: parsed.length - entries.length,
      },
    };
  } catch {
    if (controller.signal.aborted) return failed("timeout");
    return failed("unreachable");
  } finally {
    clearTimeout(timer);
  }
};

/**
 * One public project, by id, for anyone. Spec 0011, build task 8.
 *
 * Anonymous, like the feed itself and for the same reason: the whole point of a
 * public project link is that it opens for somebody with no account.
 *
 * **A missing project and a private one are the same answer here, and that is
 * the design.** The worker sends one bare 404 for a withdrawn project, a private
 * one, an id that never existed and an entry it cannot read, with nothing that
 * tells them apart (AC-24), because distinguishing them would tell an anonymous
 * caller whether somebody's private project exists. So this reports `notPublic`
 * for all of them and the page above says one thing.
 */
export type PublicProjectOutcome =
  | { readonly ok: true; readonly entry: FeedEntry }
  | { readonly ok: false; readonly failure: "notPublic" }
  | {
      readonly ok: false;
      readonly failure: FeedFailure;
      readonly message: string;
    };

export const readPublicProject = async (
  projectId: string,
): Promise<PublicProjectOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FEED_TIMEOUT_MS);

  try {
    const response = await fetch(
      workerEndpoint(`/feed/project/${encodeURIComponent(projectId)}`),
      {
        method: "GET",
        headers: { [ANONYMOUS_HEADER]: "true" },
        signal: controller.signal,
      },
    );

    if (response.status === 404) return { ok: false, failure: "notPublic" };

    const body = await readJson(response);
    if (!response.ok) {
      const code = failureCode(body) ?? "badResponse";
      return { ok: false, failure: code, message: feedMessage(code) };
    }

    const entry = isRecord(body) ? parseFeedEntry(body["entry"]) : null;
    return entry === null
      ? {
          ok: false,
          failure: "badResponse",
          message: feedMessage("badResponse"),
        }
      : { ok: true, entry };
  } catch {
    const code: FeedFailure = controller.signal.aborted
      ? "timeout"
      : "unreachable";
    return { ok: false, failure: code, message: feedMessage(code) };
  } finally {
    clearTimeout(timer);
  }
};
