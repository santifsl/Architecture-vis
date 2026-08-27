/**
 * The sign in and sign out control. Spec 0001, AC-2, AC-3, AC-4, AC-5.
 *
 * Reads the auth fact from root loader data and holds no copy of its own. Both
 * actions revalidate, so the whole app updates from that one source with no page
 * reload, and no data belonging to the previous person survives a sign out. The
 * sign-in interaction itself, including a blocked popup, lives in `useSignIn`
 * and is shared with the session banner and a guarded route's prompt.
 */
import { useRevalidator } from "react-router";

import { signOut } from "~/auth/actions";
import { AuthNotice } from "~/auth/AuthNotice";
import type { AuthState } from "~/auth/state";
import { useSignIn } from "~/auth/useSignIn";

export function AuthControl({ state }: { readonly state: AuthState }) {
  const revalidator = useRevalidator();
  const { busy, notice, start } = useSignIn();

  const handleSignOut = async () => {
    signOut();
    await revalidator.revalidate();
  };

  if (state.status === "signedIn") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink">{state.user.username}</span>
        <button type="button" className="btn-quiet" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        className="btn-accent"
        onClick={start}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Waiting for Puter" : "Sign in"}
      </button>
      <AuthNotice notice={notice} />
    </div>
  );
}
