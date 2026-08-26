/**
 * The one and only module allowed to import `@heyputer/puter.js`.
 *
 * Spec 0001 (docs/specs/0001-puter-auth-and-platform-access.md), AC-10 and
 * AC-11: `puter.fs`, `puter.kv`, and `puter.workers` are reachable only through
 * `withPuter`, and nothing else in `app/` imports the SDK. Everything here is a
 * thin boundary: narrowing, gating, and non-interactive reads. No feature logic.
 *
 * Two invariants from the spec are load bearing here, both established by
 * reading the installed SDK source rather than its docs:
 *
 *   - `getUser()` and `whoami()` route a 401 through a reauth policy whose
 *     `interactive` flag defaults to true, so both raise Puter's login popup on
 *     an expired token. Neither is ever called on the boot path.
 *   - `isSignedIn()` only probes storage and never asks the server, so it is
 *     never the answer to "is this person signed in". It is used below only as
 *     a cheap negative pre-check in front of a call that would otherwise prompt.
 */
import puter from "@heyputer/puter.js";

/**
 * The auth fact the rest of the app is allowed to see. Puter's own `User`
 * carries roughly fifteen further optional fields; narrowing at the boundary
 * keeps an over-wide vendor type out of the app.
 *
 * `uuid` is the stable account identifier and the thing a later feature stores
 * as a project's owner. `username` is display text and nothing else.
 */
export type RoomifyUser = {
  readonly uuid: string;
  readonly username: string;
};

/** Raised when a gated Puter call is attempted while signed out. Never shown to a person. */
export class PuterGateError extends Error {
  constructor() {
    super("Puter was called while signed out. Gate this behind the auth state from the root loader.");
    this.name = "PuterGateError";
  }
}

/** The two rejection codes `puter.auth.signIn` documents. */
export type SignInFailure = "popup_blocked" | "auth_window_closed" | "unknown";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Narrows whatever the SDK handed back into `RoomifyUser`, or `null`.
 *
 * The cached-user properties this reads are typed `any` in the package's own
 * declarations, so the value crosses into this app as `unknown` and is proven
 * here rather than asserted.
 */
export const toRoomifyUser = (value: unknown): RoomifyUser | null => {
  if (!isRecord(value)) return null;
  const { uuid, username } = value;
  if (!isNonEmptyString(uuid) || !isNonEmptyString(username)) return null;
  return { uuid, username };
};

/**
 * Is there a token in storage at all?
 *
 * A cheap negative pre-check only. A `true` answer proves nothing about whether
 * the server still honours that token, which is the whole reason the boot check
 * below asks the server instead.
 */
const hasStoredToken = (): boolean => isNonEmptyString(puter.authToken);

/**
 * The signed-in user according to the server, resolved without ever raising a
 * sign-in popup. `null` means signed out, and every failure lands there too:
 * no token, a rejected token, an offline browser, a 500, a CORS failure.
 *
 * This awaits `puter.whoamiCache_`, the promise the SDK itself starts at load
 * via `cacheWhoami_()`, which passes `interactiveReauth: false` and returns
 * `null` on a bad token or a network failure. Awaiting a request that is
 * already in flight is what makes the boot check cost no extra round trip.
 *
 * `whoamiCache_` is internal (trailing underscore, typed `any`), so a chained
 * fallback to the `puter.whoami` value keeps a future SDK upgrade that removes
 * it degrading to signed out rather than crashing. See the spec's Rationale and
 * its Follow-up item on pinning the SDK version.
 */
export const readCurrentUser = async (): Promise<RoomifyUser | null> => {
  if (!hasStoredToken()) return null;

  try {
    const cached: unknown = await (puter.whoamiCache_ as unknown);
    const fromCache = toRoomifyUser(cached);
    if (fromCache !== null) return fromCache;

    return toRoomifyUser(puter.whoami as unknown);
  } catch {
    return null;
  }
};

/**
 * Opens Puter's own sign-in popup. Must be called from a real user activation,
 * per AC-2: this is the only path in the app that is allowed to raise it.
 *
 * Resolves to the failure code on a rejection rather than throwing, so callers
 * handle a blocked popup and a closed popup as ordinary outcomes. Milestone 2
 * treats every failure the same way (back to signed out); milestone 3 is where
 * `popup_blocked` grows its own sentence and retry, per AC-5.
 */
export const openSignIn = async (): Promise<{ readonly ok: true } | { readonly ok: false; readonly failure: SignInFailure }> => {
  try {
    await puter.auth.signIn();
    return { ok: true };
  } catch (error: unknown) {
    const code = isRecord(error) ? error["error"] : undefined;
    if (code === "popup_blocked" || code === "auth_window_closed") {
      return { ok: false, failure: code };
    }
    return { ok: false, failure: "unknown" };
  }
};

/** Discards this app's Puter token. Synchronous in the SDK and cannot fail. */
export const clearSignIn = (): void => {
  puter.auth.signOut();
};

/**
 * The single doorway to `puter.fs`, `puter.kv`, and `puter.workers`.
 *
 * Rejects with `PuterGateError` when no token is held, so a gated call can
 * never be the thing that triggers Puter's implicit sign-in flow. One honest
 * limit the spec records: a token that dies *while a call is in flight* is not
 * covered, because neither `puter.fs` nor `puter.kv` exposes a per-call
 * non-interactive option. AC-2 is scoped to boot and navigation for that reason.
 */
export const withPuter = async <T>(fn: (sdk: typeof puter) => Promise<T>): Promise<T> => {
  if (!hasStoredToken()) throw new PuterGateError();
  return fn(puter);
};
