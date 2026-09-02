import { Link, useRevalidator } from "react-router";

import type { Route } from "./+types/projects";
import { RequireUser } from "~/auth/RequireUser";
import { ProjectGrid } from "~/gallery/ProjectGrid";
import { GALLERY_PAGE_SIZE, projectCountLine } from "~/gallery/rules";
import { UnreadableNote } from "~/gallery/UnreadableNote";
import { listProjects } from "~/projects/store";

export function meta() {
  return [
    { title: "Your projects · AV" },
    { name: "description", content: "Your floor plans and their renders." },
  ];
}

/**
 * The personal gallery. Spec 0008, build task 4.
 *
 * One prefix list against the person's own Puter store and nothing else: no
 * worker call, no second store, no new key. This screen adds no persisted state
 * at all (AC-14), which is what makes it cheap to get wrong.
 *
 * A `clientLoader` rather than a `loader`, same as the root and the project
 * page: this is a static SPA, so a server loader would run in Node at build time
 * where there is no session and no store to ask.
 *
 * It returns the store's result as DATA rather than throwing. A thrown response
 * is caught by the error boundary, which replaces the route subtree and takes
 * the navbar and the sign-in control down with it, leaving somebody on an error
 * page instead of on a sentence with a way back.
 *
 * The read runs while signed out too, and comes back with the store's own
 * `signedOut` failure: `withPuter` refuses synchronously with no network call
 * and no sign-in popup. Whether anything is rendered is `RequireUser`'s
 * question, asked from root loader data, and it is asked in exactly one place.
 */
export async function clientLoader() {
  return await listProjects();
}

clientLoader.hydrate = true as const;

/**
 * The masthead. Spec 0010, AC-13.
 *
 * The heading is on every branch; the count line and the rule that closes the
 * block are on the grid branch alone. That is deliberate: a `0 PROJECTS` line
 * over the empty state would be a second, colder way of saying what the empty
 * state's own sentence already says, and a count over a failed read would be a
 * number nobody could stand behind.
 */
function Masthead({ count }: { readonly count: number | null }) {
  const heading = <h1 className="type-display text-ink">Your projects</h1>;

  if (count === null) return heading;

  return (
    <div className="border-b border-hairline pb-6">
      {heading}
      <p className="mt-2 type-meta text-ink-soft">{projectCountLine(count)}</p>
    </div>
  );
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const retrying = revalidator.state === "loading";

  return (
    <RequireUser what="your projects">
      {() => (
        <main className="mx-auto max-w-6xl px-6 py-16">
          <Masthead
            count={
              loaderData.ok && loaderData.value.projects.length > 0
                ? loaderData.value.projects.length
                : null
            }
          />

          {!loaderData.ok ? (
            <>
              <p className="mt-4 max-w-prose type-body text-ink">
                {loaderData.message}
              </p>
              <button
                type="button"
                className="btn-quiet mt-1"
                aria-busy={retrying}
                onClick={() => {
                  // aria-busy keeps the control focusable while the read runs,
                  // so the handler is what has to refuse a second press.
                  if (retrying) return;
                  void revalidator.revalidate();
                }}
              >
                {/*
                  The label swaps as well as the styling. aria-busy already
                  drops the label to clay at 55% and sweeps a hairline under the
                  control, per spec 0004's busy state, but both of those are
                  quiet enough to miss on a press that answers in a moment, and
                  a second click then looks like nothing happened. The word
                  itself changing is the part you cannot miss. No spinner and no
                  disabled attribute: the design system rules the first out, and
                  the second would take focus off the control mid-action.
                */}
                {retrying ? "Trying again…" : "Try again"}
              </button>
            </>
          ) : loaderData.value.projects.length === 0 ? (
            <>
              <p className="mt-4 max-w-prose type-body text-ink-soft">
                Nothing here yet. Upload a floor plan and AV will render it in
                3D.
              </p>
              <Link className="btn-quiet mt-1 inline-block" to="/">
                Upload a floor plan
              </Link>
              <UnreadableNote count={loaderData.value.unreadable} />
            </>
          ) : (
            <div className="mt-12">
              <ProjectGrid
                projects={loaderData.value.projects}
                initialCount={GALLERY_PAGE_SIZE}
              />
              <UnreadableNote count={loaderData.value.unreadable} />
            </div>
          )}
        </main>
      )}
    </RequireUser>
  );
}
