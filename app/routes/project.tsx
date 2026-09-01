import type { Route } from "./+types/project";
import { RequireUser } from "~/auth/RequireUser";
import { isProjectId } from "~/projects/record";
import { readProject } from "~/projects/store";
import { ProjectSheet } from "~/render/ProjectSheet";

export function meta() {
  return [
    { title: "Your render · Roomify" },
    {
      name: "description",
      content: "A floor plan, rendered in 3D from straight above.",
    },
  ];
}

/**
 * One project and its renders. Spec 0006, build task 7.
 *
 * A `clientLoader` rather than a `loader`, same as the root: this app is a
 * static SPA, so a server loader would run in Node at build time where there is
 * no session and no store to ask.
 *
 * It returns the failure as DATA rather than throwing (AC-14). A thrown
 * response would be caught by an error boundary, which replaces the whole route
 * subtree and takes the header and the sign-in control down with it, and the
 * person would be looking at an error page instead of a sentence and a way
 * back. Every failure the store knows about already carries a plain sentence,
 * so there is nothing here to invent.
 *
 * A malformed id is refused before the store is asked. `readProject` would
 * simply not find it, which is true but says "deleted" about a URL that was
 * never a project in the first place.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!isProjectId(params.id)) {
    return {
      ok: false as const,
      message: "That isn't a project link. Check the address and try again.",
    };
  }

  const result = await readProject(params.id);
  return result.ok
    ? { ok: true as const, project: result.value }
    : { ok: false as const, message: result.message };
}

export default function ProjectRoute({ loaderData }: Route.ComponentProps) {
  return (
    <RequireUser what="this project">
      {() =>
        loaderData.ok ? (
          // Keyed by id so navigating between two projects starts the next one
          // from its own loaded record rather than from the previous project's
          // in-progress render state.
          <ProjectSheet
            key={loaderData.project.id}
            loaded={loaderData.project}
          />
        ) : (
          <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="type-title text-ink">This project</h1>
            <p className="mt-2 type-body text-ink">{loaderData.message}</p>
          </main>
        )
      }
    </RequireUser>
  );
}
