/**
 * The sign in and sign out control. Spec 0001, AC-2, AC-3, AC-4, AC-5.
 *
 * Reads the auth fact from root loader data and holds no copy of its own. Both
 * actions revalidate, so the whole app updates from that one source with no page
 * reload, and no data belonging to the previous person survives a sign out. The
 * sign-in interaction itself, including a blocked popup, lives in `useSignIn`
 * and is shared with the session banner and a guarded route's prompt.
 *
 * Spec 0010 made signing out a real button rather than a piece of text, and gave
 * it the same busy pattern signing in already had: `aria-busy` and
 * `aria-disabled` rather than the real `disabled` attribute, so the control keeps
 * focus while the revalidation runs, plus the handler guard that pattern
 * requires. `aria-disabled` does not stop a click, so refusing the second press
 * is the handler's job and never the attribute's.
 */
import { useState } from "react";
import { useRevalidator } from "react-router";

import { signOut } from "~/auth/actions";
import { AuthNotice } from "~/auth/AuthNotice";
import type { AuthState } from "~/auth/state";
import { useSignIn } from "~/auth/useSignIn";

export function AuthControl({ state }: { readonly state: AuthState }) {
  const revalidator = useRevalidator();
  const { busy, notice, start } = useSignIn();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    signOut();
    await revalidator.revalidate();
    // Reached only if this control somehow outlives the revalidation, which a
    // successful sign out does not: the state changes and the other branch
    // renders. Reset anyway, so a failed revalidation leaves a usable button
    // rather than one stuck reading as busy forever.
    setSigningOut(false);
  };

  if (state.status === "signedIn") {
    return (
      <div className="flex items-center gap-3">
        <span className="type-body text-ink">{state.user.username}</span>
        <button
          type="button"
          className="btn-outline"
          aria-busy={signingOut}
          aria-disabled={signingOut}
          onClick={() => {
            if (signingOut) return;
            void handleSignOut();
          }}
        >
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
        aria-busy={busy}
        aria-disabled={busy}
      >
        {busy ? "Waiting for Puter" : "Sign in with Puter"}
      </button>
      <AuthNotice notice={notice} />
    </div>
  );
}
