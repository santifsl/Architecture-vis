/**
 * The one way this app tells someone an auth action did not work.
 *
 * Per scope.md's design feature, an error here is the same ink as body text plus
 * a thin accent-outlined mark with no fill. No red, no alert box, no raised
 * panel: a problem reads as understated, not urgent. `role="status"` rather than
 * `role="alert"` matches that, and it announces the sentence to a screen reader
 * without interrupting whatever the person was doing.
 */
import type { SignInNotice } from "~/auth/useSignIn";

const sentences: Readonly<Record<SignInNotice, string>> = {
  popupBlocked:
    "Your browser blocked the Puter sign-in window. Allow pop-ups for this site, then sign in again.",
  didNotFinish: "Sign-in didn't finish, so nothing changed. Try again.",
};

export function AuthNotice({ notice }: { readonly notice: SignInNotice | null }) {
  if (notice === null) return null;

  return (
    <p className="notice" role="status">
      <svg
        className="notice-mark"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.75v4" />
        <path d="M8 11.1v.4" />
      </svg>
      {sentences[notice]}
    </p>
  );
}
