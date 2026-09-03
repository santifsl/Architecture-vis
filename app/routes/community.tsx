import { useState } from "react";
import { Link, useRevalidator } from "react-router";

import type { Route } from "./+types/community";
import { useAuthState } from "~/auth/useAuthState";
import { FeedCard } from "~/feed/FeedCard";
import { readFeedPage, type FeedPage } from "~/feed/store";
import { UnreadableNote } from "~/gallery/UnreadableNote";
import type { FeedEntry } from "~/projects/record";

export function meta() {
  return [
    { title: "Community · AV" },
    {
      name: "description",
      content: "Floor plans other people have rendered in 3D with AV.",
    },
  ];
}

/**
 * The community feed. Spec 0011, build task 7.
 *
 * Open to everyone, and that is the whole feature (AC-3): there is no
 * `RequireUser` here, no auth check, and nothing on this screen asks Puter who
 * anyone is. `readFeedPage` is a plain anonymous request against a store the app
 * itself owns, which is the only way an anonymous visitor could ever be served
 * at all, since they hold no credential to read anything with.
 *
 * A `clientLoader` rather than a `loader`, same as every other route here: this
 * is a static SPA, so a server loader would run in Node at build time.
 *
 * It returns the failure as DATA rather than throwing (AC-14). A thrown response
 * is caught by the error boundary, which replaces the route subtree and takes
 * the navbar down with it, leaving somebody on an error page instead of on a
 * sentence with a way back.
 */
export async function clientLoader() {
  return await readFeedPage();
}

clientLoader.hydrate = true as const;

/**
 * The pages read so far, flattened.
 *
 * Component state seeded from the loader, deliberately, and it resets on
 * navigation: somebody who loads three pages, leaves and comes back is on page
 * one again. That is the same trade `ProjectGrid` already makes for `Show more`,
 * and it is what keeps the cursor out of the URL, where a stale one pasted to
 * somebody else would be a link to a page of the feed that no longer exists.
 */
type Loaded = {
  readonly entries: readonly FeedEntry[];
  readonly cursor: string | null;
  readonly unreadable: number;
};

const seed = (page: FeedPage): Loaded => ({
  entries: page.entries,
  cursor: page.cursor,
  unreadable: page.unreadable,
});

/**
 * An empty feed, and which invitation it carries. Spec 0011, build task 12,
 * AC-23.
 *
 * The two are genuinely different asks, not one sentence with a button swapped.
 * Somebody signed in already has projects, or can make one, so the invitation is
 * to share; somebody signed out has to sign in before any of that is available,
 * and telling them to share a project they cannot yet have would be an
 * invitation to a dead end.
 *
 * Which one comes from `useAuthState`, the same root loader fact the navbar and
 * the home strip read, so this screen can never disagree with the sign-in
 * control at the top of it about who is here.
 *
 * Neither branch raises the sign-in popup. Spec 0001's rule stands: signing in
 * happens from a deliberate click on the control that exists for it, and this
 * points at it rather than becoming a second one.
 */
function EmptyFeed() {
  const auth = useAuthState();

  if (auth.status === "signedIn") {
    return (
      <>
        <p className="mt-4 max-w-prose type-body text-ink-soft">
          Nothing has been shared yet. Open one of your projects and make it
          public, and it will be the first thing here.
        </p>
        <Link className="btn-quiet mt-1 inline-block" to="/projects">
          Your projects
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="mt-4 max-w-prose type-body text-ink-soft">
        Nothing has been shared yet. Upload a floor plan, render it, and you can
        put it here for anyone to see.
      </p>
      <Link className="btn-quiet mt-1 inline-block" to="/">
        Upload a floor plan
      </Link>
    </>
  );
}

function Feed({ page }: { readonly page: FeedPage }) {
  const [loaded, setLoaded] = useState<Loaded>(() => seed(page));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const more = () => {
    // aria-busy keeps the control focusable while the read runs, so the handler
    // is what has to refuse a second press.
    if (busy || loaded.cursor === null) return;
    setBusy(true);
    setMessage(null);

    void (async () => {
      const next = await readFeedPage(loaded.cursor);
      setBusy(false);
      if (!next.ok) {
        setMessage(next.message);
        return;
      }
      setLoaded((current) => ({
        entries: [...current.entries, ...next.value.entries],
        cursor: next.value.cursor,
        unreadable: current.unreadable + next.value.unreadable,
      }));
    })();
  };

  if (loaded.entries.length === 0) {
    return (
      <>
        <EmptyFeed />
        <UnreadableNote count={loaded.unreadable} />
      </>
    );
  }

  return (
    <div className="mt-12">
      <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {loaded.entries.map((entry) => (
          <li key={entry.projectId}>
            <FeedCard entry={entry} />
          </li>
        ))}
      </ul>

      {message !== null && (
        <p className="mt-8 max-w-prose type-body text-ink">{message}</p>
      )}

      {loaded.cursor !== null && (
        <button
          type="button"
          className="btn-quiet mt-8"
          aria-busy={busy}
          onClick={more}
        >
          {busy ? "Loading…" : "Show more"}
        </button>
      )}

      <UnreadableNote count={loaded.unreadable} />
    </div>
  );
}

export default function Community({ loaderData }: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const retrying = revalidator.state === "loading";

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="border-b border-hairline pb-6">
        <h1 className="type-display text-ink">Community</h1>
        <p className="mt-2 type-meta text-ink-soft">
          Shared by people using AV
        </p>
      </div>

      {loaderData.ok ? (
        // Keyed on the first entry so a revalidation that brings back a
        // different first page starts the paged list again from it, rather than
        // appending new pages onto a list seeded from the old one.
        <Feed
          key={loaderData.value.entries[0]?.projectId ?? "empty"}
          page={loaderData.value}
        />
      ) : (
        <>
          <p className="mt-4 max-w-prose type-body text-ink">
            {loaderData.message}
          </p>
          <button
            type="button"
            className="btn-quiet mt-1"
            aria-busy={retrying}
            onClick={() => {
              if (retrying) return;
              void revalidator.revalidate();
            }}
          >
            {retrying ? "Trying again…" : "Try again"}
          </button>
        </>
      )}
    </main>
  );
}
