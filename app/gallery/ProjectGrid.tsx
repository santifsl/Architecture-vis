/**
 * A grid of cards, showing a page of them at a time. Spec 0008, AC-6.
 *
 * The cap is a mount cap, not a display cap. Every mounted card mints a view URL
 * for the floor plan, and a second one once the render is finished, and those
 * URLs expire and are the only scarce thing on this screen. A card that is not
 * rendered mints nothing, so how many are alive at once is bounded by this
 * number rather than by how many projects somebody has.
 *
 * `Show more` is component state on purpose and it resets on navigation: someone
 * who expands to 36 cards, opens a project and comes back is at 12 again. Spec
 * 0008 accepts that rather than putting the count in the URL, and says so.
 */
import { useState } from "react";

import { GALLERY_PAGE_SIZE } from "~/gallery/rules";
import { ProjectCard } from "~/gallery/ProjectCard";
import type { Project } from "~/projects/record";

export function ProjectGrid({
  projects,
  initialCount,
  step = GALLERY_PAGE_SIZE,
}: {
  readonly projects: readonly Project[];
  /** How many cards to mount on arrival. */
  readonly initialCount: number;
  /** How many more each `Show more` adds. */
  readonly step?: number;
}) {
  const [shown, setShown] = useState(initialCount);
  const visible = projects.slice(0, shown);
  const remaining = projects.length - visible.length;

  return (
    <>
      <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <button
          type="button"
          className="btn-quiet mt-8"
          onClick={() => {
            setShown((count) => count + step);
          }}
        >
          Show more
        </button>
      )}
    </>
  );
}
