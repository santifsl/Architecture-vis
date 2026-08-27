/**
 * The session-ended banner. Spec 0001, AC-6.
 *
 * Renders only on the one loader run that follows Puter invalidating a session
 * mid-use. It sits under the header, above the current page, so the page itself
 * survives: nothing is discarded and nobody is navigated away. Signing in from
 * here uses the same interaction as every other sign-in control.
 */
import { AuthNotice } from "~/auth/AuthNotice";
import type { AuthState } from "~/auth/state";
import { useSignIn } from "~/auth/useSignIn";

export function SessionBanner({ state }: { readonly state: AuthState }) {
  const { busy, notice, start } = useSignIn();

  if (state.status !== "signedOut" || state.reason !== "sessionEnded") return null;

  return (
    <div className="banner" role="status">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-ink">
          Your Puter session ended. Sign in to pick up where you left off.
        </p>
        <button
          type="button"
          className="btn-accent"
          onClick={start}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Waiting for Puter" : "Sign in"}
        </button>
      </div>
      <AuthNotice notice={notice} />
    </div>
  );
}
