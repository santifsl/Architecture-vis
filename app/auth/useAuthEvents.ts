/**
 * Keeps the router's copy of the auth fact honest. Spec 0001, AC-6.
 *
 * Two subscriptions, mounted once by the root layout:
 *
 *   - `puter.auth.reauth_required`, which Puter emits when it invalidates a
 *     session mid-use. This records *why* the session ended and revalidates, so
 *     the banner can say so. The current page is never discarded and nobody is
 *     navigated away: only the root loader runs again.
 *   - the token-changed signal, which just revalidates. It is a safety net for
 *     any path that changes the token without going through this app's own
 *     actions, and it decides nothing on its own.
 *
 * Subscribing in an effect rather than at module scope is what keeps the
 * build-time root render free of Puter.
 */
import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

import { markSessionEnded } from "~/auth/sessionEnded";
import { onAuthTokenChanged, onSessionEnded } from "~/platform/puter";

export const useAuthEvents = (): void => {
  const revalidator = useRevalidator();

  // The revalidator is a fresh object on each render, so it is held in a ref and
  // the subscriptions below are made exactly once instead of being torn down and
  // rebuilt every time the router changes state.
  const revalidate = useRef(revalidator.revalidate);
  useEffect(() => {
    revalidate.current = revalidator.revalidate;
  }, [revalidator]);

  useEffect(() => {
    const stopListeningForSessionEnd = onSessionEnded(() => {
      markSessionEnded();
      void revalidate.current();
    });

    const stopListeningForTokenChange = onAuthTokenChanged(() => {
      void revalidate.current();
    });

    return () => {
      stopListeningForSessionEnd();
      stopListeningForTokenChange();
    };
  }, []);
};
