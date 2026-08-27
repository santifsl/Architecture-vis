/**
 * The auth fact, resolved once at boot and held in root loader data.
 *
 * Spec 0001, AC-1, AC-6, AC-7. This module owns the shape of the fact, the
 * transition into it, and the one question routes are allowed to ask of it. It
 * reaches Puter only through `app/platform/puter.ts`, which is the only module
 * allowed to import the SDK.
 */
import { consumeSessionEnded } from "~/auth/sessionEnded";
import { readCurrentUser, type RoomifyUser } from "~/platform/puter";

export type { RoomifyUser };

/**
 * There is deliberately no `loading` variant. `HydrateFallback` covers the boot
 * window, so root loader data is only ever one of the two real states.
 *
 * `reason` exists only to drive the session-ended banner (AC-6). It is set on
 * the one loader run that follows Puter ending the session, and never again.
 */
export type AuthState =
  | { readonly status: "signedOut"; readonly reason?: "sessionEnded" }
  | { readonly status: "signedIn"; readonly user: RoomifyUser };

const signedOut: AuthState = { status: "signedOut" };
const sessionEnded: AuthState = { status: "signedOut", reason: "sessionEnded" };

/**
 * Resolves who is really signed in, without ever prompting.
 *
 * Never rejects and never raises Puter's popup. Every failure path, a rejected
 * token or an offline browser alike, resolves to `signedOut`, so the app can
 * never render a signed-in interface it cannot back up.
 *
 * The session-ended flag is consumed on every run, including the signed-in one,
 * so a stale signal can never surface a banner one navigation late.
 */
export const resolveAuthState = async (): Promise<AuthState> => {
  const user = await readCurrentUser();
  const ended = consumeSessionEnded();

  if (user !== null) return { status: "signedIn", user };
  return ended ? sessionEnded : signedOut;
};

export type RequireUserResult =
  | { readonly ok: true; readonly user: RoomifyUser }
  | { readonly ok: false };

/**
 * The only question a guarded route asks. Spec 0001, AC-7.
 *
 * Returns a result rather than throwing on purpose. A thrown sentinel would have
 * to be caught by a route `ErrorBoundary`, which replaces the whole route
 * subtree and would take the layout and the sign-in control down with it, losing
 * most of what an in-place prompt is for. It also reads the state it is handed
 * and never makes a fresh Puter call, so a guarded route cannot become a second
 * place that decides who is signed in.
 */
export const requireUser = (state: AuthState): RequireUserResult =>
  state.status === "signedIn" ? { ok: true, user: state.user } : { ok: false };
