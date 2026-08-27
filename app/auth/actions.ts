/**
 * The two deliberate auth actions. Spec 0001, AC-2, AC-3, AC-4.
 *
 * Both are only ever called from a real user activation. Neither returns the
 * resulting user: the root `clientLoader` re-running after
 * `revalidator.revalidate()` is the one code path that produces the auth fact,
 * in both the boot case and the just-signed-in case.
 */
import { clearSignIn, openSignIn, type SignInFailure } from "~/platform/puter";

export type SignInOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: SignInFailure };

/**
 * Opens Puter's sign-in popup and reports how it went.
 *
 * A blocked popup and a popup the person closed themselves are both ordinary
 * outcomes here, not exceptions, so nothing raw ever reaches a screen. Telling
 * them apart is what AC-5 needs: `useSignIn` gives a blocked popup its own plain
 * sentence and a retry, and treats a closed one as the cancel it is.
 */
export const signIn = (): Promise<SignInOutcome> => openSignIn();

/** Discards the token. The interface follows on the next revalidation. */
export const signOut = (): void => clearSignIn();
