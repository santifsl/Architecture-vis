/**
 * View URLs for privately stored files, minted on demand and cached for the
 * life of the page. Spec 0006, build task 4.
 *
 * This started life inside `app/upload/store.ts`, where feature 5 needed it for
 * the one plan on the upload card. Feature 6 needs the same thing for every
 * render, feature 7 will need it for a whole gallery, and CLAUDE.md's rule is
 * that the second use is when something becomes shared rather than copied. So it
 * lives here now, one directory that means "a file in Puter storage", and both
 * features call it.
 *
 * The rule it exists to keep, from spec 0005: a path is the durable identifier
 * and a URL is not. `getReadURL` expires, so a URL stored beside a path would go
 * stale on a timer and the symptom would be a gallery of broken images a day
 * later, a long way from its cause. Nothing here is ever persisted.
 */
import { PuterGateError, withPuter } from "~/platform/puter";

/**
 * How long a minted URL is asked to live, and when we stop trusting it.
 *
 * The 10 minute gap between the two is the point. If the cache handed back an
 * entry right up to its expiry, a URL could reach an `<img>` a second before it
 * died, and the failure would look like a broken image rather than an expired
 * link. Treating an entry as spent early means anything handed out has real
 * time left on it.
 */
const URL_LIFETIME = "1h";
const CACHE_LIFETIME_MS = 50 * 60 * 1000;

/** Why a URL could not be minted. Each caller maps this onto its own sentence. */
export type StoredUrlFailure = "signedOut" | "unreachable";

export type StoredUrlResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly failure: StoredUrlFailure };

/**
 * Minted URLs, keyed by path, for the life of the page.
 *
 * The value is the in-flight PROMISE, not the resolved string, which is the
 * whole reason this is not a plain string map. A project page asks for two
 * renders at once and a gallery asks for many, so several callers want the same
 * uncached path in the same tick; caching the resolved value only helps the
 * second caller if the first has already finished, so they would all miss and
 * all mint. Caching the promise means the first caller starts the work and the
 * rest await it.
 *
 * Module scope, so it is shared across components, and never persisted: it must
 * not outlive the page, because it holds URLs that read a private file without
 * authentication.
 */
type CacheEntry = {
  readonly mintedAt: number;
  readonly url: Promise<StoredUrlResult>;
};

const urlCache = new Map<string, CacheEntry>();

/** Drops a path's cached URL. Called whenever the file behind it stops existing. */
export const forgetStoredUrl = (path: string): void => {
  urlCache.delete(path);
};

/** Empties the cache. For sign out: the next person must not inherit these URLs. */
export const forgetAllStoredUrls = (): void => {
  urlCache.clear();
};

/**
 * A URL that displays a stored file.
 *
 * Short lived on purpose: it reads a private file with no authentication, so an
 * hour is long enough for a browsing session and short enough that a URL copied
 * out of devtools stops working quickly.
 *
 * A failed mint is not cached. Caching it would mean one flaky network moment
 * left an image permanently broken for the rest of the session.
 */
export const readStoredUrl = async (path: string): Promise<StoredUrlResult> => {
  const held = urlCache.get(path);
  if (held !== undefined && Date.now() - held.mintedAt < CACHE_LIFETIME_MS) {
    return held.url;
  }

  const minting = (async (): Promise<StoredUrlResult> => {
    try {
      const url = await withPuter((sdk) =>
        sdk.fs.getReadURL(path, URL_LIFETIME),
      );
      return { ok: true, value: url };
    } catch (error: unknown) {
      return {
        ok: false,
        failure: error instanceof PuterGateError ? "signedOut" : "unreachable",
      };
    }
  })();

  urlCache.set(path, { mintedAt: Date.now(), url: minting });

  const result = await minting;
  // Only evict our own entry. A file deleted mid-mint purges the cache, and a
  // later caller can have minted a fresh URL into the same key by the time this
  // one fails; deleting unconditionally would throw that good entry away and
  // send everyone after it back to the network.
  if (!result.ok && urlCache.get(path)?.url === minting) {
    urlCache.delete(path);
  }
  return result;
};
