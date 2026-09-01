/**
 * The frame every screen sits inside. Spec 0008, AC-1.
 *
 * Lifted out of `app/root.tsx` rather than written fresh: the header was already
 * there, with the wordmark and the auth control in the places they belong, and
 * the only new things here are that the wordmark is now a link home and that a
 * `Projects` link appears beside it once somebody is signed in.
 *
 * The auth fact comes from `useAuthState`, not from a prop, so the navbar and
 * the home strip read the same one value from the same root loader data and
 * cannot disagree about who is signed in. That is the whole reason the hook
 * exists, and it is worth the small break from the layout-chrome-takes-a-prop
 * habit here, where two surfaces have to agree.
 */
import { Link } from "react-router";

import { AuthControl } from "~/auth/AuthControl";
import { useAuthState } from "~/auth/useAuthState";

export function Navbar() {
  const auth = useAuthState();

  return (
    <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-3">
      <nav className="flex items-baseline gap-6" aria-label="Roomify">
        <Link to="/" className="nav-link type-heading text-ink">
          Roomify
        </Link>
        {auth.status === "signedIn" && (
          <Link to="/projects" className="nav-link type-meta text-ink-soft">
            Projects
          </Link>
        )}
      </nav>
      <AuthControl state={auth} />
    </header>
  );
}
