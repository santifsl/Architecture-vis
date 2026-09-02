/**
 * The one place in the app that calls `POST /publish`. Spec 0011, build task 5's
 * client side.
 *
 * Puter is reached only through `withPuter` from `app/platform/puter.ts`, same
 * as `app/render/store.ts` and every other store here, and for the same reason:
 * `workers.exec` is what attaches the caller's own session to the request, and
 * that session is the whole security model. The worker acts as the caller, so it
 * can only ever read that person's own record and their own files, and it holds
 * no credential of its own.
 *
 * Nothing here throws at its caller and nothing raw escapes it. Every outcome is
 * either the public assets the worker wrote, or one of the codes in
 * `app/publish/failures.ts`.
 *
 * The worker's answer is PARSED rather than cast, the same rule
 * `parseRenderResponse` follows: the worker is the one thing in this system with
 * no types, no lint and no local run, so a body of the wrong shape has to be a
 * failure with a sentence rather than a `PublicAssets` shaped hole that surfaces
 * two screens later. Here that matters more than usual, because what comes back
 * is written straight onto the record.
 */
import { workerEndpoint } from "~/platform/env";
import { PuterGateError, withPuter } from "~/platform/puter";
import { isPublishFailure, type PublishFailure } from "~/publish/failures";
import { isModelId, type ModelId, type PublicAssets } from "~/projects/record";

/** How long a publish may take before it is hung up on. */
export const PUBLISH_TIMEOUT_MS = 120_000;

export type PublishOutcome =
  | { readonly ok: true; readonly value: PublicAssets }
  | { readonly ok: false; readonly failure: PublishFailure };

const failed = (failure: PublishFailure): PublishOutcome => ({
  ok: false,
  failure,
});

/**
 * The URL shape a public asset is allowed to have, checked on the way in.
 *
 * The exact subdomain is a worker side constant the browser deliberately does
 * not hold, per spec 0002: public URLs are read off the record, never composed
 * here. So what can be checked on this side is the scheme and the host suffix,
 * which is the same rule `checkPublicAssets` in `app/projects/invariants.ts`
 * applies before the write. Checking it here as well means a bad URL is a
 * sentence about sharing rather than an invariant violation three calls later,
 * which would be true but would say the wrong thing.
 */
const PUBLIC_HOST_SUFFIX = ".puter.site";

const isPublicAssetUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.hostname.endsWith(PUBLIC_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Only the models this build knows, and only entries that are real URLs. */
const parseRenderUrls = (
  value: unknown,
): Readonly<Partial<Record<ModelId, string>>> | null => {
  if (!isRecord(value)) return null;

  const entries = Object.entries(value);
  if (
    entries.some(([model, url]) => !isModelId(model) || !isPublicAssetUrl(url))
  )
    return null;

  return Object.fromEntries(entries);
};

/**
 * Narrows the worker's answer instead of trusting it.
 *
 * `publishedRevision` is checked as a whole number of zero or more because the
 * freshness rule is arithmetic on it: a `publishedRevision` that arrived as a
 * string would compare unequal to every revision forever and leave the project
 * permanently reading as out of date, which is a far quieter failure than
 * refusing the response here.
 */
export const parsePublishResponse = (body: unknown): PublicAssets | null => {
  if (!isRecord(body)) return null;

  const assets = body["publicAssets"];
  if (!isRecord(assets)) return null;

  const floorPlanUrl = assets["floorPlanUrl"];
  if (!isPublicAssetUrl(floorPlanUrl)) return null;

  const renderUrls = parseRenderUrls(assets["renderUrls"]);
  if (renderUrls === null) return null;

  const publishedRevision = assets["publishedRevision"];
  if (
    typeof publishedRevision !== "number" ||
    !Number.isInteger(publishedRevision) ||
    publishedRevision < 0
  )
    return null;

  return { floorPlanUrl, renderUrls, publishedRevision };
};

/** The code inside a failure body, if it is one this app knows. */
const failureCode = (body: unknown): PublishFailure | null => {
  if (!isRecord(body)) return null;
  const code = body["errorCode"];
  return isPublishFailure(code) ? code : null;
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Asks the worker to publish one project, and waits at most two minutes for it.
 *
 * The body carries a project id and nothing else, which is AC-7 on this side of
 * the wire: every field of the feed entry is read back out of the owner's own
 * store by the worker, so there is nothing here that could put a name or an
 * author on a card by asking for one.
 */
export const requestPublish = async (
  projectId: string,
): Promise<PublishOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PUBLISH_TIMEOUT_MS);

  try {
    const response = await withPuter((sdk) =>
      sdk.workers.exec(workerEndpoint("/publish"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      }),
    );

    const body = await readJson(response);

    if (!response.ok) {
      // A 401 is the session having gone while the copy ran, which is a
      // different thing to tell someone than a worker that fell over.
      if (response.status === 401) return failed("signedOut");
      return failed(failureCode(body) ?? "badResponse");
    }

    const assets = parsePublishResponse(body);
    return assets === null
      ? failed("badResponse")
      : { ok: true, value: assets };
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return failed("signedOut");
    if (controller.signal.aborted) return failed("timeout");
    return failed("unreachable");
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Asks the worker to withdraw one project. Spec 0011, build task 9.
 *
 * The route is idempotent and answers `{ ok: true }` whether or not there was
 * anything to delete, so there is nothing to parse out of a success beyond the
 * fact that it was one. Anything that is not a 200 is a failure, and a 401 is
 * told apart for the same reason it is on the publish path: the session going
 * mid-withdrawal is a different thing to tell someone than a worker that fell
 * over.
 */
export const requestUnpublish = async (
  projectId: string,
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: PublishFailure }
> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PUBLISH_TIMEOUT_MS);

  try {
    const response = await withPuter((sdk) =>
      sdk.workers.exec(workerEndpoint("/unpublish"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      }),
    );

    if (response.ok) return { ok: true };

    if (response.status === 401) return { ok: false, failure: "signedOut" };
    const body = await readJson(response);
    return { ok: false, failure: failureCode(body) ?? "badResponse" };
  } catch (error: unknown) {
    if (error instanceof PuterGateError)
      return { ok: false, failure: "signedOut" };
    if (controller.signal.aborted) return { ok: false, failure: "timeout" };
    return { ok: false, failure: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
};
