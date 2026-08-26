/**
 * The sign in and sign out control. Spec 0001, AC-2, AC-3, AC-4.
 *
 * Reads the auth fact from root loader data and holds no copy of its own. Both
 * actions revalidate, so the whole app updates from that one source with no
 * page reload, and no data belonging to the previous person survives a sign out.
 */
import { useState } from "react";
import { useRevalidator } from "react-router";

import { signIn, signOut } from "~/auth/actions";
import type { AuthState } from "~/auth/state";

export function AuthControl({ state }: { readonly state: AuthState }) {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    // Every outcome revalidates: a completed sign in produces the user, and a
    // blocked or closed popup settles back to signed out. Milestone 3 is where
    // a blocked popup grows its own sentence and retry, per AC-5.
    await signIn();
    setBusy(false);
    await revalidator.revalidate();
  };

  const handleSignOut = async () => {
    signOut();
    await revalidator.revalidate();
  };

  if (state.status === "signedIn") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink">{state.user.username}</span>
        <button type="button" className="btn-quiet" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="btn-accent" onClick={handleSignIn} disabled={busy}>
      {busy ? "Waiting for Puter" : "Sign in"}
    </button>
  );
}
