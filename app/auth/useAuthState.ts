/**
 * Reads the auth fact from root loader data. Spec 0001, AC-3, AC-4, AC-7.
 *
 * Every screen reads the fact from here, so no component holds a copy and no
 * second store can drift from the router's. A component that is handed the state
 * as a prop (the layout's own chrome) should keep taking the prop; this hook is
 * for a route deeper in the tree that would otherwise have to thread it down.
 */
import { useRouteLoaderData } from "react-router";

import type { AuthState } from "~/auth/state";
import type { clientLoader } from "~/root";

const signedOut: AuthState = { status: "signedOut" };

export const useAuthState = (): AuthState => {
  const data = useRouteLoaderData<typeof clientLoader>("root");
  // Root data is always present by the time a child route renders, and it only
  // carries the auth fact once configuration checked out (AC-8): a missing
  // worker URL replaces the whole app, so no child route renders at all.
  // Falling back to signed out rather than throwing keeps the failure closed
  // either way.
  if (data === undefined || data.config !== "ok") return signedOut;
  return data.auth;
};
