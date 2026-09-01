/**
 * Loads a view URL for a privately stored file, for a component that wants to
 * show it. Spec 0006, build task 4.
 *
 * The mint itself lives in `app/storage/urls.ts`; this is the small amount of
 * React around it, and it is shared for the same reason the cache is. The
 * upload card's preview and every render plate do exactly this, so the second
 * one is where a copy would have started.
 *
 * A caller gives the component a `key` of the path when the path can change
 * underneath it, so a new file remounts and the previous URL goes with it.
 * Resetting inside the effect instead would be a synchronous `setState` in an
 * effect body, which costs a second render pass before paint and which the lint
 * rules reject on exactly those grounds.
 *
 * A failure here is never terminal. `urls.ts` refuses to cache a failed mint on
 * the grounds that one flaky network moment must not leave an image broken for
 * the rest of the session, and this hook has to hold the same line or that
 * decision stops at the module boundary: the cache would happily mint again
 * while the component that asked sat on a permanent `failed`. So `retry` is
 * part of the shape rather than something each caller reinvents, and CLAUDE.md
 * asks every failure to carry an action anyway.
 */
import { useCallback, useEffect, useState } from "react";

import { readStoredUrl } from "~/storage/urls";

export type StoredUrl = {
  /** The URL once it is minted, or null while it is being minted or after a failure. */
  readonly url: string | null;
  /** True once minting failed. The caller decides what that looks like on its own screen. */
  readonly failed: boolean;
  /** Mints again from scratch. For the retry action beside a caller's failure sentence. */
  readonly retry: () => void;
};

export const useStoredUrl = (path: string | null): StoredUrl => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumping this re-runs the effect, which is what carries the reset. Doing the
  // reset in the effect body instead would be the synchronous `setState` the
  // note above rules out, so the state moves here, in the event handler, and
  // the effect only reacts.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setUrl(null);
    setFailed(false);
    setAttempt((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (path === null) return;
    let current = true;

    void readStoredUrl(path).then((result) => {
      if (!current) return;
      if (result.ok) setUrl(result.value);
      else setFailed(true);
    });

    return () => {
      current = false;
    };
  }, [path, attempt]);

  return { url, failed, retry };
};
