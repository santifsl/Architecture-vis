/**
 * Publishing's pure half: what state a project's public copy is in, and the
 * words for it. Spec 0011, build task 11.
 *
 * Same rule as `app/render/rules.ts` and `app/gallery/rules.ts`: on a project
 * with no test runner, the parts worth getting exactly right are the ones you
 * can read and check by hand. Whether a public copy is out of date is the
 * clearest example in the whole feature, so it touches no React and no store.
 *
 * **AC-19 lives here, and it is one line.** Out of date is `revision !==
 * publishedRevision`, two integers written by the same code from the same
 * place. No timestamp is compared against another timestamp anywhere in this
 * file, which is why a browser whose clock is an hour wrong in either direction
 * shows exactly the same answer as a correct one.
 */
import type { Project } from "~/projects/record";

/**
 * The four states a project's sharing can be in. Three of them are `public`,
 * and telling them apart is the whole job.
 *
 * `uncommitted` is the state a crashed publish leaves: the record says public,
 * the intent write landed, and no public copy was ever committed. It is shown
 * as out of date with a retry, and it is the reason the intent write comes
 * first, because the other order leaves a live card for a project whose record
 * says private, which nobody can repair.
 */
export type PublicState =
  "private" | "withdrawing" | "uncommitted" | "live" | "stale";

export const publicState = (project: Project): PublicState => {
  if (project.visibility !== "public")
    // A record that reads private while still carrying the stamp or the copies
    // is a withdrawal that did not finish. It is the mirror of `uncommitted`
    // and it needs the mirror repair, so it is its own state rather than being
    // folded into `private`: shown as private with the only control being
    // `Make public`, somebody would be offered exactly the wrong direction.
    return project.publishedAt !== null || project.publicAssets !== null
      ? "withdrawing"
      : "private";

  if (project.publicAssets === null) return "uncommitted";
  return project.revision === project.publicAssets.publishedRevision
    ? "live"
    : "stale";
};

/** Is this project shared as far as its own record is concerned? */
export const isShared = (state: PublicState): boolean =>
  state === "uncommitted" || state === "live" || state === "stale";

/**
 * The word beside the project's name.
 *
 * Every public state says `Public`, including the two that are out of date.
 * That is deliberate: the project IS public in all three, the entry either
 * exists or is about to, and a word that changed to something like `Publishing`
 * would be describing this tab's progress rather than the project's state.
 * Whether the public copy has caught up is the sentence underneath, not this.
 */
export const VISIBILITY_WORDS: Readonly<Record<PublicState, string>> = {
  private: "Private",
  withdrawing: "Private",
  uncommitted: "Public",
  live: "Public",
  stale: "Public",
};

/**
 * What is wrong, and which way fixes it, when the public copy and the record
 * disagree. Spec 0011, AC-22.
 *
 * Three states can disagree and they disagree differently, so each gets its own
 * sentence and its own direction. Saying "try again" without saying which way is
 * how somebody presses a button that republishes a project they were trying to
 * take down.
 *
 * `uncommitted` means nothing is up there yet, so nobody can see this project at
 * all. `stale` means something is up there and it is behind. `withdrawing` means
 * something is STILL up there after the record already said private, which is
 * the only one of the three where the repair is to withdraw rather than to
 * publish.
 */
export type Repair = {
  readonly message: string;
  /** Which action fixes it. */
  readonly direction: "publish" | "unpublish";
  readonly label: string;
  /** The label while it is running. */
  readonly busyLabel: string;
};

export const repairFor = (state: PublicState): Repair | null => {
  switch (state) {
    case "uncommitted":
      return {
        message:
          "This project is shared, but its public copy hasn't been made yet, so nobody can see it in the community feed.",
        direction: "publish",
        label: "Finish sharing it",
        busyLabel: "Sharing…",
      };
    case "stale":
      return {
        message:
          "This project has changed since it was shared, so the community feed is still showing the earlier version.",
        direction: "publish",
        label: "Update the public copy",
        busyLabel: "Updating…",
      };
    case "withdrawing":
      return {
        message:
          "This project is private, but its public copies haven't come down yet, so it may still be visible to other people.",
        direction: "unpublish",
        label: "Finish making it private",
        busyLabel: "Working…",
      };
    case "private":
    case "live":
      return null;
  }
};

/**
 * What the confirmation says before a project goes public. AC-25.
 *
 * It names what actually happens, in the terms the person is about to cause:
 * copies get made, anyone can see them, and no account is needed to look. The
 * one thing worth promising is that it is reversible, because that is the fact
 * that makes the decision an easy one to take.
 */
export const PUBLISH_CONFIRMATION =
  "This puts your render and your floor plan in the community feed, where anyone can see them without signing in. You can make it private again at any time.";
