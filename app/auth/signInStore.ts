/**
 * The one sign-in interaction, as a single value the whole app shares.
 *
 * Spec 0001, AC-2, AC-3, AC-5. Three surfaces offer sign in (the navbar control,
 * the session-ended banner, and a guarded route's prompt) and more than one of
 * them is on screen at a time: signed out at `/projects`, the navbar button and
 * the route's prompt both render, and the banner can join them. Per-component
 * state would give each its own latch, so starting from one would leave the
 * others live and a second click would open a second Puter popup.
 *
 * So the latch and what it drives live here, at module scope, once for the
 * document. Every control reads the same `busy` and the same notice, and the
 * first click disables all of them.
 *
 * The mutable state is deliberate and matches `sessionEnded`: this is a guard on
 * a user interaction, which is the edge. Nothing reads it as application data,
 * and the only way to change it is to start a sign in.
 */
import { signIn } from "~/auth/actions";
import { createSingleFlight } from "~/auth/singleFlight";

/** What went wrong, in terms the interface can speak. Never a raw error. */
export type SignInNotice = "popupBlocked" | "didNotFinish";

export type SignInState = {
  readonly busy: boolean;
  readonly notice: SignInNotice | null;
};

const idle: SignInState = { busy: false, notice: null };

let state: SignInState = idle;
let listeners: readonly (() => void)[] = [];

/** One latch for the document, held across the popup and the revalidation. */
const runExclusive = createSingleFlight();

const publish = (next: SignInState): void => {
  state = next;
  listeners.forEach((listen) => listen());
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((held) => held !== listener);
  };
};

/**
 * The snapshot is a cached object rather than a fresh one, because
 * `useSyncExternalStore` compares snapshots by identity and would loop forever
 * on a new object every read.
 */
export const getSnapshot = (): SignInState => state;

/**
 * Opens Puter's popup, then hands off to `revalidate` so the root loader is what
 * produces the user, in the just-signed-in case exactly as at boot. Overlapping
 * calls are dropped by the latch, whatever control they came from.
 */
export const startSignIn = (revalidate: () => Promise<void>): void => {
  void runExclusive(async () => {
    publish({ busy: true, notice: null });
    try {
      const outcome = await signIn();

      if (outcome.ok) {
        await revalidate();
        return;
      }

      if (outcome.failure === "popup_blocked") publish({ busy: true, notice: "popupBlocked" });
      else if (outcome.failure === "unknown") publish({ busy: true, notice: "didNotFinish" });
      // `auth_window_closed` is a deliberate cancel: nothing changed, and
      // nothing is said about it.
    } finally {
      // Only now, with the root loader caught up, are the controls live again.
      publish({ busy: false, notice: state.notice });
    }
  });
};
