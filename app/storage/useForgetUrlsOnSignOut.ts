/**
 * Empties the minted-URL cache the moment the session ends. Spec 0006.
 *
 * A minted URL reads a private file with NO authentication and stays live for
 * the rest of its hour, and the cache in `app/storage/urls.ts` is module scope,
 * so it outlives every component and every navigation. Neither sign-out path
 * reloads the page, they only revalidate the auth fact, so without this the
 * next person to use a shared browser inherits the previous account's plan and
 * render URLs straight out of memory.
 *
 * It is mounted by the root layout rather than by whichever screen happens to
 * mint URLs, because that is the only component guaranteed to be mounted
 * wherever the person was standing when the session ended. This first lived in
 * `usePlanUpload`, which is on the home screen only: signing out from
 * `/project/:id` left the cache full.
 *
 * Both endings land here as the same change in the auth fact, the deliberate
 * sign out and Puter ending the session itself, so both are covered.
 */
import { useEffect, useRef } from "react";

import type { AuthState } from "~/auth/state";
import { forgetAllStoredUrls } from "~/storage/urls";

export const useForgetUrlsOnSignOut = (auth: AuthState): void => {
  // The transition is what matters, not the state: a page opened signed out has
  // nothing to forget, and clearing on every render would throw away URLs the
  // current person is still using.
  const wasSignedIn = useRef(auth.status === "signedIn");

  useEffect(() => {
    const signedIn = auth.status === "signedIn";
    const justSignedOut = wasSignedIn.current && !signedIn;
    wasSignedIn.current = signedIn;
    if (justSignedOut) forgetAllStoredUrls();
  }, [auth.status]);
};
