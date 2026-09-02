/**
 * The frame every screen sits inside. Spec 0008, AC-1.
 *
 * Lifted out of `app/root.tsx` rather than written fresh: the header was already
 * there, with the wordmark and the auth control in the places they belong, and
 * the only new things here are that the wordmark is now a link home and that a
 * `Projects` link appears beside it once somebody is signed in.
 *
 * Spec 0010 replaced that wordmark with `Logo` and relabelled the landmark. The
 * label is `Main` rather than the product name: a landmark names the region it
 * wraps, and once the mark is a named link the old label was announcing the
 * product twice in a row. The two clusters align on the centre line, because
 * the left one is now a fixed box rather than a line of text and a baseline has
 * nothing to align to.
 *
 * It sticks to the top of the viewport. `bg-bone` is not decoration: a sticky
 * header with a transparent background lets the page scroll through it, and the
 * hairline underneath stops reading as an edge. The `z-10` puts it over the
 * page content, including the plate overlays, which position themselves inside
 * their own frames and have no stacking claim of their own.
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
import { Logo } from "~/shell/Logo";

export function Navbar() {
  const auth = useAuthState();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-hairline bg-bone px-6 py-4">
      <nav className="flex items-center gap-6" aria-label="Main">
        <Logo />
        {auth.status === "signedIn" && (
          <Link to="/projects" className="nav-link text-ink-soft">
            Projects
          </Link>
        )}
        {/*
          Not behind the auth check, and that is the feature rather than an
          oversight: the community feed is open to anyone (spec 0011, AC-3), so
          the way to it has to be too. A signed out visitor who cannot see the
          link cannot discover the thing the link exists for.
        */}
        <Link to="/community" className="nav-link text-ink-soft">
          Community
        </Link>
      </nav>
      <AuthControl state={auth} />
    </header>
  );
}
