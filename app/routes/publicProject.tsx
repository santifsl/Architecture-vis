import { Link } from "react-router";

import type { Route } from "./+types/publicProject";
import { readPublicProject } from "~/feed/store";
import { formatProjectDate } from "~/gallery/rules";
import { isProjectId, type FeedEntry } from "~/projects/record";
import { PlateNote } from "~/render/RenderPlate";

export function meta() {
  return [
    { title: "A shared render · AV" },
    {
      name: "description",
      content: "A floor plan rendered in 3D from straight above, with AV.",
    },
  ];
}

/**
 * One public project, at its own URL, for anyone. Spec 0011, build task 8,
 * AC-5.
 *
 * No `RequireUser` and no auth check anywhere on this route. That is the
 * feature: a link to a shared render has to open for somebody who has never
 * heard of AV, or it is not a shared link at all.
 *
 * A malformed id is refused before the worker is asked, and it lands on exactly
 * the same page as a withdrawn one, which is the point of AC-24 rather than an
 * accident of the code: a page that said "that was never a project" for one and
 * "that is no longer shared" for the other would be telling an anonymous
 * visitor which private projects exist.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!isProjectId(params.projectId))
    return { ok: false as const, failure: "notPublic" as const };

  return await readPublicProject(params.projectId);
}

clientLoader.hydrate = true as const;

/**
 * The render, at the size the page is actually for, with the floor plan under
 * it as the key.
 *
 * Same composition as the owner's own sheet, and the same classes, because it is
 * the same subject: a render, and the drawing it came from. What is missing is
 * everything an owner can operate, which is the whole difference between the two
 * pages.
 *
 * Both images are the hosted public copies whose URLs are already on the entry,
 * so nothing is minted and nothing is waited for.
 */
function PublicSheet({ entry }: { readonly entry: FeedEntry }) {
  const model = entry.models.find(
    (candidate) => entry.renderUrls[candidate] !== undefined,
  );
  const render = model === undefined ? null : entry.renderUrls[model];

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="border-b border-hairline pb-6">
        <h1 className="type-display text-ink">{entry.name}</h1>
        <p className="mt-2 type-meta text-ink-soft">
          {entry.author} · {formatProjectDate(entry.publishedAt)}
        </p>
      </div>

      <div className="mt-16">
        <div className="plate-frame">
          {render === undefined || render === null ? (
            <PlateNote text="No render" />
          ) : (
            <img
              className="plate-image"
              src={render}
              alt={`The 3D render of ${entry.name}`}
            />
          )}
        </div>
      </div>

      <div className="mt-12">
        <h2 className="type-meta text-ink-soft">Floor plan</h2>
        <img
          className="plan-key mt-2"
          src={entry.floorPlanUrl}
          alt={`The floor plan for ${entry.name}`}
        />
      </div>

      <p className="mt-16 max-w-prose type-body text-ink-soft">
        Gemini rendered this directly from the floor plan.
      </p>

      <Link className="btn-quiet mt-1 inline-block" to="/community">
        See more in the community feed
      </Link>
    </main>
  );
}

/**
 * The one page a withdrawn, private or never-real project gets. AC-24.
 *
 * One page and one sentence for all three, with nothing on it that could be
 * read as telling them apart, and a way onward so the visit does not end here.
 */
function NotPublic({ message }: { readonly message: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="type-title text-ink">This project isn&rsquo;t shared</h1>
      <p className="mt-2 max-w-prose type-body text-ink">{message}</p>
      <Link className="btn-quiet mt-1 inline-block" to="/community">
        See what is in the community feed
      </Link>
    </main>
  );
}

export default function PublicProject({ loaderData }: Route.ComponentProps) {
  if (loaderData.ok) return <PublicSheet entry={loaderData.entry} />;

  return (
    <NotPublic
      message={
        loaderData.failure === "notPublic"
          ? "This link doesn't lead to anything in the community feed. It may never have been shared, or its owner may have made it private again."
          : loaderData.message
      }
    />
  );
}
