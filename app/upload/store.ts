/**
 * The one place in the app that puts a floor plan into Puter storage and gets a
 * URL back out. Spec 0005, build task 4.
 *
 * Puter is reached only through `withPuter` from `app/platform/puter.ts`, the
 * one module allowed to import the SDK, same as `app/projects/store.ts`.
 *
 * Two things here are load bearing rather than incidental:
 *
 * `fs.space()` is read before every write (AC-6). Not for tidiness: a storage
 * refusal makes the SDK show Puter's OWN usage dialog and then reject as well.
 * `promptIfStorageLimitError` says so in as many words, "prompt AND reject,
 * never prompt instead of rejecting", so an app cannot swallow it. Checking
 * first means the ordinary out of space case is refused in our own words and
 * that dialog never opens. It does not remove the dialog, it makes it rare: two
 * tabs uploading at once can still land in the genuine race, which is why the
 * rejection is handled too (AC-7).
 *
 * Nothing here stores a URL (AC-3). `getReadURL` expires, so the only durable
 * identifier is the path, and a view URL is minted on demand below.
 */
import { PuterGateError, withPuter } from "~/platform/puter";
import type { FloorPlan } from "~/projects/record";
import { fail, succeed, type UploadResult } from "~/upload/failures";
import { planPath, type AllowedType } from "~/upload/plan";

/**
 * How long a minted view URL is asked to live, and when we stop trusting it.
 *
 * The 10 minute gap between the two is the point. If the cache handed back an
 * entry right up to its expiry, a URL could be given to an `<img>` a second
 * before it died, and the failure would look like a broken image rather than an
 * expired link. Treating an entry as spent early means anything handed out has
 * real time left on it.
 */
const URL_LIFETIME = "1h";
const CACHE_LIFETIME_MS = 50 * 60 * 1000;

/**
 * Minted URLs, keyed by path, for the life of the page. Spec 0005, AC-4.
 *
 * The value is the in flight PROMISE, not the resolved string, which is the
 * whole reason this is not a plain string map. Feature 7's gallery renders many
 * plans at once, so several callers ask for the same uncached path in the same
 * tick; caching the resolved value only helps the second caller if the first
 * has already finished, so they would all miss and all mint. Caching the
 * promise means the first caller starts the work and the rest await it.
 *
 * Module scope, so it is shared across components, and never persisted: it must
 * not outlive the page, because it holds URLs that read a private file without
 * authentication.
 */
type CacheEntry = {
  readonly mintedAt: number;
  readonly url: Promise<UploadResult<string>>;
};

const urlCache = new Map<string, CacheEntry>();

/** Drops a path's cached URL. Called whenever the file behind it stops existing. */
export const forgetPlanUrl = (path: string): void => {
  urlCache.delete(path);
};

/** Empties the cache. For sign out: the next person must not inherit these URLs. */
export const forgetAllPlanUrls = (): void => {
  urlCache.clear();
};

/**
 * Turns anything thrown below into a failure, so no exception reaches a caller.
 *
 * `PuterGateError` is told apart because it means the call was made while
 * signed out, which is a different sentence and a different fix from a network
 * that would not answer.
 */
const toFailure = <T>(error: unknown): UploadResult<T> =>
  error instanceof PuterGateError ? fail("signedOut") : fail("unreachable");

/**
 * Is there room for this many bytes? Spec 0005, AC-6.
 *
 * Exported so the hook can refuse before it starts a write, and so the check is
 * visible in the network panel as its own call during verification.
 */
export const hasRoomFor = async (
  bytes: number,
): Promise<UploadResult<boolean>> => {
  try {
    const space = await withPuter((sdk) => sdk.fs.space());
    return succeed(space.capacity - space.used >= bytes);
  } catch (error: unknown) {
    return toFailure(error);
  }
};

/** What the caller passes to start an upload. */
export type UploadPlanInput = {
  readonly file: File;
  /** The type `validatePlanFile` already proved, so this module does not re check it. */
  readonly type: AllowedType;
  /** Called with 0 to 1 as the write progresses. Drives the busy hairline. */
  readonly onProgress: (fraction: number) => void;
  /**
   * Handed a function that cancels this write, so a caller that goes away can
   * stop it. Spec 0005, AC-17.
   *
   * The spec originally said to use `write`'s `abort` option for this. That was
   * wrong about the SDK and the build corrected it: `abort` is a NOTIFICATION
   * fired after a cancellation finishes, typed `(operationId: string) => void`,
   * so it can tell you an upload stopped but cannot stop one. The handle is
   * `init(operationId, xhr)`, whose `xhr.abort` the SDK overrides to cancel the
   * signed upload for real. Passing `abort` and expecting it to cancel would
   * have compiled if the types were looser, and silently never cancelled
   * anything.
   */
  readonly onAbortReady?: (abort: () => void) => void;
};

/**
 * Writes a plan and returns where it landed. Spec 0005, AC-1, AC-6, AC-7.
 *
 * `createMissingParents` is not optional here even though it looks like a
 * detail: it defaults to `false`, so without it the very first upload from a
 * fresh account fails because `plans/` does not exist yet. That is the least
 * convenient moment for this to break and the easiest one to miss in testing,
 * since any account that has uploaded once already has the directory.
 *
 * `dedupeName` stays off (AC-2). The id prefix already makes collisions
 * impossible, and with dedupe on the stored path would be whatever the server
 * renamed it to rather than the path asked for.
 */
export const uploadPlan = async ({
  file,
  type,
  onProgress,
  onAbortReady,
}: UploadPlanInput): Promise<UploadResult<FloorPlan>> => {
  const room = await hasRoomFor(file.size);
  if (!room.ok) return fail(room.failure);
  if (!room.value) return fail("noSpace");

  const path = planPath(file.name, type);

  try {
    await withPuter((sdk) =>
      sdk.fs.write(path, file, {
        overwrite: true,
        dedupeName: false,
        createMissingParents: true,
        progress: (_operationId: string, fraction: number) => {
          onProgress(fraction);
        },
        init: (_operationId: string, xhr: XMLHttpRequest) => {
          onAbortReady?.(() => {
            xhr.abort();
          });
        },
      }),
    );

    return succeed({ path });
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return fail("signedOut");
    // The race AC-7 names: space ran out between the check above and this
    // write. Puter has already shown its own dialog by now and we cannot stop
    // it, so the most we can do is say something sensible ourselves.
    if (isStorageRefusal(error)) return fail("noSpace");
    return fail("writeFailed");
  }
};

/**
 * The shapes a storage refusal arrives in, mirroring the SDK's own check.
 *
 * Restated here rather than imported because the SDK's version is internal to a
 * module this app is not allowed to import. If Puter adds a fourth shape this
 * goes stale, and the cost is one refusal reported as `writeFailed` instead of
 * `noSpace`, which is wrong but not harmful.
 */
const isStorageRefusal = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return (
    code === "storage_limit_reached" ||
    code === "NOT_ENOUGH_SPACE" ||
    status === 413
  );
};

/**
 * A URL that displays a stored plan. Spec 0005, AC-4.
 *
 * Short lived on purpose: it reads a private file with no authentication, so an
 * hour is long enough for a browsing session and short enough that a URL copied
 * out of devtools stops working quickly.
 *
 * A failed mint is not cached. Caching it would mean one flaky network moment
 * left an image permanently broken for the rest of the session.
 */
export const readPlanUrl = async (
  path: string,
): Promise<UploadResult<string>> => {
  const held = urlCache.get(path);
  if (held !== undefined && Date.now() - held.mintedAt < CACHE_LIFETIME_MS) {
    return held.url;
  }

  const minting = (async (): Promise<UploadResult<string>> => {
    try {
      const url = await withPuter((sdk) =>
        sdk.fs.getReadURL(path, URL_LIFETIME),
      );
      return succeed(url);
    } catch (error: unknown) {
      return toFailure(error);
    }
  })();

  urlCache.set(path, { mintedAt: Date.now(), url: minting });

  const result = await minting;
  // Only evict our own entry. A plan deleted mid mint purges the cache, and a
  // later caller can have minted a fresh URL into the same key by the time this
  // one fails; deleting unconditionally would throw that good entry away and
  // send everyone after it back to the network.
  if (!result.ok && urlCache.get(path)?.url === minting) {
    urlCache.delete(path);
  }
  return result;
};

/**
 * Removes a stored plan. Spec 0005, AC-10.
 *
 * A path that is already gone counts as success, because the caller's goal is
 * that the file is not there and it is not there. The one caller is Replace,
 * which deletes the plan it is superseding, and a missing file is exactly what
 * it wants. Reporting that as a failure would make Replace look broken in the
 * one case where nothing is wrong.
 */
export const deletePlan = async (path: string): Promise<UploadResult<void>> => {
  forgetPlanUrl(path);

  try {
    await withPuter((sdk) => sdk.fs.delete(path));
    return succeed(undefined);
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return fail("signedOut");
    if (isMissing(error)) return succeed(undefined);
    return fail("unreachable");
  }
};

/** A delete of something that was not there. Puter reports this as a 404 or a subject error. */
const isMissing = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return code === "subject_does_not_exist" || status === 404;
};
