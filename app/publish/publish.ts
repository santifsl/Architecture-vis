/**
 * Making a project public, in the order that makes a crash repairable.
 * Spec 0011, build task 6.
 *
 * Three steps, and the order is the whole design:
 *
 *   1. **The intent write.** `visibility` goes to `public` on the owner's own
 *      record, with `publishedAt` stamped, BEFORE the worker is called. A
 *      browser that closes at any point after this leaves a project that says
 *      it is public and visibly out of date, which its owner can fix with one
 *      press. The other order leaves a project live in the feed while its own
 *      record says private, which nobody can then repair, because the worker
 *      cannot enumerate anyone's store (AC-17).
 *   2. **The worker call.** It refuses a record that does not already say
 *      `public`, which is the intent first rule enforced where it can be.
 *   3. **The commit.** The public URLs the worker wrote are stored, along with
 *      the revision they were built from, which is what later makes "out of
 *      date" a comparison of two integers and no clocks.
 *
 * Every write goes through `updateProject`, the one door, and the whole sequence
 * takes its turn in `publishesFor` so a publish and an unpublish of one project
 * cannot interleave in this tab.
 *
 * Nothing here throws at its caller. Every outcome carries a plain sentence and,
 * where there is one, the record as it now stands, so a screen can show the
 * repairable state rather than the state it hoped for (AC-14).
 */
import type { Project } from "~/projects/record";
import { updateProject } from "~/projects/store";
import { publishMessage, type PublishFailure } from "~/publish/failures";
import { publishesFor } from "~/publish/queue";
import { requestPublish } from "~/publish/store";
import { writeFailure } from "~/publish/writeFailure";

export type PublishResult =
  | { readonly ok: true; readonly project: Project }
  | {
      readonly ok: false;
      readonly failure: PublishFailure;
      /** A plain sentence, safe to render as-is. */
      readonly message: string;
      /**
       * The record as it stands after the failure, when it could be read.
       *
       * Usually non-null and usually already `public`: that is the uncommitted
       * state, and handing it back is what lets the screen say "shared, but the
       * public copy is not up to date" with a retry, rather than showing the
       * project exactly as it was before the press.
       */
      readonly project: Project | null;
    };

const refuse = (
  failure: PublishFailure,
  project: Project | null,
): PublishResult => ({
  ok: false,
  failure,
  message: publishMessage(failure),
  project,
});

/**
 * Step 1. Says, durably, that this project is meant to be public.
 *
 * `publishedAt` is stamped ONCE and never rewritten, which is what keeps a
 * republished project in its original feed position and what keeps a renamed
 * one from jumping to the top. A project that is already public and already
 * stamped therefore asks for no change at all here, and the write is skipped
 * rather than made empty: this path runs on every republish, and a write per
 * republish that changes nothing is a write that can still fail.
 *
 * The clock is this browser's own, which is safe precisely because
 * `publishedAt` is only ever a sort position and a displayed date. It is never
 * one side of a comparison; that job belongs to `revision`.
 */
const declareIntent = async (project: Project): Promise<PublishResult> => {
  if (project.visibility === "public" && project.publishedAt !== null)
    return { ok: true, project };

  const written = await updateProject(project.id, (current) =>
    current.visibility === "public" && current.publishedAt !== null
      ? {}
      : { visibility: "public", publishedAt: Date.now() },
  );

  return written.ok
    ? { ok: true, project: written.value }
    : refuse(writeFailure(written.failure), null);
};

/**
 * Step 3. Stores what the worker wrote, unless something newer is already
 * stored.
 *
 * The compare before write is the same shape as the render loop's guard 3, and
 * it is here for the same reason: two republishes can finish out of order, and
 * the older answer landing last would leave the record reading fresh while the
 * public copy shows the earlier content. The decision happens inside
 * `updateProject`'s queued turn, so the read it checks and the write it makes
 * cannot have anything land between them.
 *
 * A project that went private while the copy ran is left alone. Its record is
 * already the truth and writing public assets onto it would contradict that.
 */
const commit = async (
  project: Project,
  assets: Project["publicAssets"],
): Promise<PublishResult> => {
  if (assets === null) return refuse("badResponse", project);

  const written = await updateProject(project.id, (current) => {
    if (current.visibility !== "public") return null;

    const stored = current.publicAssets;
    if (stored !== null && stored.publishedRevision > assets.publishedRevision)
      return null;

    return { publicAssets: assets };
  });

  return written.ok
    ? { ok: true, project: written.value }
    : refuse(writeFailure(written.failure), project);
};

/**
 * Makes one project public: intent, worker, commit.
 *
 * Safe to call on a project that is already public, which is what makes it the
 * republish path as well as the publish path. Nothing about the sequence
 * changes; the record simply already carries the intent.
 */
export const publishProject = async (
  project: Project,
): Promise<PublishResult> =>
  publishesFor(project.id, async () => {
    const intent = await declareIntent(project);
    if (!intent.ok) return intent;

    const answer = await requestPublish(project.id);
    // The intent write stands whatever happened next. That is the uncommitted
    // state, it is repairable, and it is handed back so the screen can say so.
    if (!answer.ok) return refuse(answer.failure, intent.project);

    return await commit(intent.project, answer.value);
  });
