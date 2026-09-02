/**
 * The guard a route wraps its content in. Spec 0001, AC-7.
 *
 * Reads the auth fact from root loader data (never a fresh Puter call), and
 * either hands the signed-in user to the content or renders the in-place prompt
 * at the same URL. Features 5, 6, and 7 inherit this rather than each deciding
 * how a guarded route behaves.
 */
import type { ReactNode } from "react";

import { SignInPrompt } from "~/auth/SignInPrompt";
import { requireUser, type AvUser } from "~/auth/state";
import { useAuthState } from "~/auth/useAuthState";

export function RequireUser({
  what,
  children,
}: {
  /** What the person is signing in to see, finishing "Sign in to see …". */
  readonly what: string;
  readonly children: (user: AvUser) => ReactNode;
}) {
  const state = useAuthState();
  const result = requireUser(state);

  if (!result.ok) return <SignInPrompt what={what} />;
  return <>{children(result.user)}</>;
}
