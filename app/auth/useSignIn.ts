/**
 * The one sign-in interaction, shared by every control that offers it.
 *
 * Spec 0001, AC-2, AC-3, AC-5. Three surfaces open Puter's popup (the navbar
 * control, the session-ended banner, and a guarded route's prompt) and all three
 * need the same behaviour: one attempt at a time, a busy state while the popup
 * is open, a revalidation once it succeeds, and a plain sentence when the
 * browser blocked the window. That belongs in one place, not copied three times.
 *
 * A popup the person closed themselves is a cancel, not a failure, so it
 * produces no notice at all.
 */
import { useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { signIn } from "~/auth/actions";
import { createSingleFlight } from "~/auth/singleFlight";

/** What went wrong, in terms the interface can speak. Never a raw error. */
export type SignInNotice = "popupBlocked" | "didNotFinish";

export type SignInInteraction = {
  readonly busy: boolean;
  readonly notice: SignInNotice | null;
  readonly start: () => void;
};

export const useSignIn = (): SignInInteraction => {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SignInNotice | null>(null);

  // One latch for the life of the component, held across the whole sequence
  // (the popup, and then the revalidation that catches the root loader up), so
  // a second click cannot start an overlapping flow. A `useState` guard alone
  // is not enough: two clicks dispatched in the same task both pass the check
  // before the button ever re-renders as disabled.
  const runExclusive = useRef(createSingleFlight()).current;

  const start = (): void => {
    void runExclusive(async () => {
      setBusy(true);
      setNotice(null);
      try {
        const outcome = await signIn();

        if (outcome.ok) {
          // The root loader re-running is the one code path that produces the
          // user, in the boot case and the just-signed-in case alike.
          await revalidator.revalidate();
          return;
        }

        if (outcome.failure === "popup_blocked") setNotice("popupBlocked");
        else if (outcome.failure === "unknown") setNotice("didNotFinish");
        // `auth_window_closed` is a deliberate cancel: nothing changed, and
        // nothing is said about it.
      } finally {
        // Only now, with the root loader caught up, is the control live again.
        setBusy(false);
      }
    });
  };

  return { busy, notice, start };
};
