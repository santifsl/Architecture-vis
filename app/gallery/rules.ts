/**
 * The gallery's pure half. Spec 0008, build task 2.
 *
 * Same rule as `app/render/rules.ts` and `app/upload/plan.ts`: on a project with
 * no test runner, the parts worth getting exactly right are the ones you can
 * read and check by hand. Which render a card shows, and how a date is written,
 * are both of those, so neither touches React or the store.
 */
import type { ModelId, Project, RenderState } from "~/projects/record";

/**
 * How many cards `/projects` renders before `Show more`. Spec 0008, AC-6.
 *
 * The scarce resource is not rows, it is the expiring view URLs each mounted
 * card mints for a private file, so this is a mount cap rather than a display
 * nicety. `Show more` adds another page of the same size.
 */
export const GALLERY_PAGE_SIZE = 12;

/** How many cards the home strip shows. Spec 0008, AC-11. */
export const HOME_STRIP_COUNT = 3;

/**
 * The gallery masthead's count line. Spec 0010, AC-13.
 *
 * Counts the READABLE records only, which is the whole sourcing decision here.
 * `UnreadableNote` already states how many records could not be read, in its own
 * sentence under the grid, and a count line that included them would give the
 * same screen two numbers that disagree about how many projects there are.
 *
 * Written in sentence case. `type-meta` carries the uppercase, per spec 0004, so
 * the text stays readable to anything announcing it aloud while the screen shows
 * `3 PROJECTS`.
 */
export const projectCountLine = (count: number): string =>
  `${String(count)} ${count === 1 ? "project" : "projects"}`;

/** One model's render, with the model it belongs to, as a card needs both. */
export type CardRender = {
  readonly model: ModelId;
  readonly render: RenderState;
};

/**
 * Which render a card shows: the first requested model with a finished render,
 * and otherwise the first that has one at all.
 *
 * Finished wins over first because a card is a picture of the project, and a
 * project with something to show should show it rather than a state word from a
 * model that happens to be listed earlier.
 *
 * Total by construction, since `createProject` writes a render entry for every
 * model it was asked for, so the `null` is defensive rather than expected. It
 * exists because a record that somehow carries no render at all should cost one
 * quiet card, not the whole grid.
 */
export const cardRender = (project: Project): CardRender | null => {
  const entries = project.models
    .map((model) => ({ model, render: project.renders[model] }))
    .filter((entry): entry is CardRender => entry.render !== undefined);

  return (
    entries.find((entry) => entry.render.status === "complete") ??
    entries[0] ??
    null
  );
};

/**
 * The date on a card, in the viewer's own locale and timezone.
 *
 * `undefined` as the locale is deliberate and is the whole sourcing decision:
 * the browser answers, so the date reads the way the person's other software
 * writes dates. Nothing about a locale or a timezone is stored on a project, and
 * nothing here guesses one.
 *
 * A short month name rather than a numeric month, because `03/04` means two
 * different days on two sides of an ocean and a name never does.
 */
export const formatProjectDate = (createdAt: number): string =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(createdAt);
