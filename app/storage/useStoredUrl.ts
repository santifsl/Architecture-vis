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
 *
 * A failure here is never terminal. `urls.ts` refuses to cache a failed mint on
 * the grounds that one flaky network moment must not leave an image broken for
 * the rest of the session, and this hook has to hold the same line or that
 * decision stops at the module boundary: the cache would happily mint again
 * while the component that asked sat on a permanent `failed`. So `retry` is
 * part of the shape rather than something each caller reinvents, and CLAUDE.md
 * asks every failure to carry an action anyway.
 *
 * `retry` is per PATH, not per hook instance, and that is the whole point of the
 * small store below. Two components can show one file at once: since spec 0009
 * the project sheet has the render in the plate and again in the comparison, and
 * the same mint feeds both. A retry that reset only the component it was clicked
 * in would fix the plate and leave the comparison holding a `failed` nothing
 * could ever clear, so the sheet would come back one picture short until a
 * reload. Every view of a path retries together, which is also what lets exactly
 * one of them own the button.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { readStoredUrl } from "~/storage/urls";

export type StoredUrl = {
  /** The URL once it is minted, or null while it is being minted or after a failure. */
  readonly url: string | null;
  /** True once minting failed. The caller decides what that looks like on its own screen. */
  readonly failed: boolean;
  /**
   * Mints again from scratch, for every component showing this path at once.
   * For the retry action beside a caller's failure sentence.
   */
  readonly retry: () => void;
};

/**
 * How many times each path has been retried, and who is watching it.
 *
 * Module scope and mutable, for the same reason `urlCache` is: it is one fact
 * about a path that several components have to agree on, and React's own
 * external-store hook is how a component subscribes to one. Nothing here is
 * persisted and nothing outlives the page.
 */
const attempts = new Map<string, number>();
const watchers = new Map<string, Set<() => void>>();

const attemptOf = (path: string | null): number =>
  path === null ? 0 : (attempts.get(path) ?? 0);

const watch = (path: string | null, notify: () => void): (() => void) => {
  if (path === null) return () => undefined;

  const forPath = watchers.get(path) ?? new Set<() => void>();
  forPath.add(notify);
  watchers.set(path, forPath);

  return () => {
    forPath.delete(notify);
    if (forPath.size === 0) watchers.delete(path);
  };
};

const retryPath = (path: string): void => {
  attempts.set(path, attemptOf(path) + 1);
  for (const notify of watchers.get(path) ?? []) notify();
};

/**
 * What one attempt at one path came back with.
 *
 * The attempt and the path are stored alongside the result rather than in
 * separate state, so a retry, or a path changing under a caller that did not
 * pass a `key`, is spotted by comparing during render. Resetting in the effect
 * instead would be a synchronous `setState` in an effect body, which costs a
 * second render pass before paint and which the lint rules reject on exactly
 * those grounds.
 */
type Attempt = {
  readonly path: string | null;
  readonly attempt: number;
  readonly url: string | null;
  readonly failed: boolean;
};

const PENDING = { url: null, failed: false } as const;

export const useStoredUrl = (path: string | null): StoredUrl => {
  const [result, setResult] = useState<Attempt>({
    path,
    attempt: attemptOf(path),
    ...PENDING,
  });

  const subscribe = useCallback(
    (notify: () => void) => watch(path, notify),
    [path],
  );
  // Server and client read the same counter. On the server it is always 0,
  // which is the pending state every caller already renders before a mint lands.
  const snapshot = useCallback(() => attemptOf(path), [path]);
  const attempt = useSyncExternalStore(subscribe, snapshot, snapshot);

  // Anything the previous attempt found is stale the moment either changes.
  const current =
    result.path === path && result.attempt === attempt ? result : PENDING;

  const retry = useCallback(() => {
    if (path !== null) retryPath(path);
  }, [path]);

  useEffect(() => {
    if (path === null) return;
    let live = true;

    void readStoredUrl(path).then((outcome) => {
      if (!live) return;
      setResult({
        path,
        attempt,
        url: outcome.ok ? outcome.value : null,
        failed: !outcome.ok,
      });
    });

    return () => {
      live = false;
    };
  }, [path, attempt]);

  return { url: current.url, failed: current.failed, retry };
};
