/**
 * The auth fact, resolved once at boot and held in root loader data.
 *
 * Spec 0001, AC-1. This module owns the shape of the fact and the transition
 * into it. It reaches Puter only through `app/platform/puter.ts`, which is the
 * only module allowed to import the SDK.
 */
import { readCurrentUser, type RoomifyUser } from "~/platform/puter";

export type { RoomifyUser };

/**
 * There is deliberately no `loading` variant. `HydrateFallback` covers the boot
 * window, so root loader data is only ever one of the two real states.
 *
 * `reason` exists only to drive the session-ended banner (AC-6). Nothing sets it
 * yet: the `puter.auth.reauth_required` handler and the one-shot flag it writes
 * arrive with milestone 3.
 */
export type AuthState =
  | { readonly status: "signedOut"; readonly reason?: "sessionEnded" }
  | { readonly status: "signedIn"; readonly user: RoomifyUser };

const signedOut: AuthState = { status: "signedOut" };

/**
 * Resolves who is really signed in, without ever prompting.
 *
 * Never rejects and never raises Puter's popup. Every failure path, a rejected
 * token or an offline browser alike, resolves to `signedOut`, so the app can
 * never render a signed-in interface it cannot back up.
 */
export const resolveAuthState = async (): Promise<AuthState> => {
  const user = await readCurrentUser();
  return user === null ? signedOut : { status: "signedIn", user };
};
