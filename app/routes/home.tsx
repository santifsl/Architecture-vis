import { Link } from "react-router";

import type { Route } from "./+types/home";
import { useAuthState } from "~/auth/useAuthState";
import { ProjectGrid } from "~/gallery/ProjectGrid";
import { HOME_STRIP_COUNT } from "~/gallery/rules";
import { UnreadableNote } from "~/gallery/UnreadableNote";
import { listProjects } from "~/projects/store";
import { PlanUploadCard } from "~/upload/PlanUploadCard";

export function meta() {
  return [
    { title: "AV" },
    {
      // The subhead's first sentence, not a third piece of copy. The tab, the
      // search result and the page itself then say the same thing. Spec 0010,
      // AC-11: change the hero and this follows it.
      name: "description",
      content:
        "AV is an AI-first design environment that turns any 2D floor plan into a photorealistic 3D render, seen straight from above, with your walls exactly where you drew them.",
    },
  ];
}

/**
 * The same read the gallery does, called unconditionally. Spec 0008, AC-11.
 *
 * Unconditional including while signed out, and that is the point rather than an
 * oversight: `withPuter` refuses synchronously with no network call and no
 * sign-in popup, and the store maps that to its `signedOut` failure. Asking the
 * auth question a second time here would be a second copy of a decision that
 * belongs to the root loader, and two copies are what let a navbar and a strip
 * disagree about who is signed in.
 */
export async function clientLoader() {
  return await listProjects();
}

clientLoader.hydrate = true as const;

/**
 * The recent strip. Present only when somebody is signed in and has something to
 * show, plus the one case where it is empty only because every record was
 * unreadable, which is worth a line rather than silence.
 *
 * Whether anyone is signed in comes from `useAuthState`, never from the loader
 * result, so the navbar's `Projects` link and this strip can never disagree. The
 * loader only decides whether there is anything to put in it, and a failed read
 * is nothing to put in it: `/projects` is where that failure gets its sentence
 * and its retry.
 */
function RecentProjects({
  list,
}: {
  readonly list: Route.ComponentProps["loaderData"];
}) {
  const auth = useAuthState();

  if (auth.status !== "signedIn" || !list.ok) return null;

  const { projects, unreadable } = list.value;
  if (projects.length === 0) return <UnreadableNote count={unreadable} />;

  return (
    <section className="mt-24 border-t border-hairline pt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-heading text-ink">Recent projects</h2>
        <Link className="nav-link text-ink-soft" to="/projects">
          See all
        </Link>
      </div>

      <div className="mt-8">
        <ProjectGrid
          projects={projects.slice(0, HOME_STRIP_COUNT)}
          initialCount={HOME_STRIP_COUNT}
        />
      </div>

      <UnreadableNote count={unreadable} />
    </section>
  );
}

/**
 * The home screen. Spec 0005 for the hero and the card, spec 0008 for the strip
 * underneath it.
 *
 * Structure follows scope.md feature 4's reference: a headline, a subtitle, one
 * call to action, and the upload card sitting directly under the hero. No pill
 * badge, no second "watch demo" button, no decorative background. The card
 * itself is the demo, which is why it is here rather than behind a sign in.
 *
 * The card is deliberately NOT wrapped in `RequireUser` (spec 0005, AC-15). It
 * renders in this one position whether or not anyone is signed in, because a
 * picked file is held in its state across Puter's sign in popup, and a guard
 * that swapped it for a prompt would unmount it and silently throw that file
 * away.
 *
 * The hero is CENTRED, and it is the only thing in the app that is. Spec 0010
 * set every screen against one left edge and this screen is the deliberate
 * exception to that, taken after looking at it on a wide display: the hero is a
 * short headline and two sentences over a card, and left anchored inside a
 * centred column it leaves the right half of a 2560px screen visibly empty while
 * the eye still starts at the left. Centring the block and the text itself
 * settles it. Nothing else moves: the recent strip below keeps the left edge,
 * and so do the gallery and the project sheet, because a grid and a drawing
 * sheet have a real left edge to line up against and a landing hero does not.
 */
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mx-auto max-w-2xl text-center type-display text-ink">
        From blueprint to built space, instantly, with AI.
      </h1>

      <p className="mx-auto mt-6 max-w-prose text-center type-body text-ink-soft">
        AV is an AI-first design environment that turns any 2D floor plan into a
        photorealistic 3D render, seen straight from above, with your walls
        exactly where you drew them. Upload a plan, and let AV do the rest.
      </p>

      <div className="mx-auto mt-16 max-w-2xl">
        <PlanUploadCard />
      </div>

      <RecentProjects list={loaderData} />
    </main>
  );
}
