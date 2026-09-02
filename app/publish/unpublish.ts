/**
 * Making a project private again. Spec 0011, build task 9's client half.
 *
 * The mirror image of `publishProject`, and the order is mirrored for the same
 * reason. `visibility` goes to `private` on the owner's own record first, so a
 * browser that closes halfway leaves a project that reads private, which is the
 * safe direction. `publishedAt` and `publicAssets` are cleared only AFTER the
 * worker confirms, because the worker derives the key it is deleting from
 * `publishedAt`, and clearing it first would strand the entry with nothing left
 * anywhere that knows where it is.
 *
 * It works from the uncommitted state, where the intent write landed and no
 * entry was ever written, and that is not an edge case: it is how an owner
 * abandons a publish that will not complete. `POST /unpublish` is idempotent and
 * has no "not published" error precisely so that this path exists.
 */
import type { Project } from "~/projects/record";
import { updateProject } from "~/projects/store";
import { publishMessage, type PublishFailure } from "~/publish/failures";
import { publishesFor } from "~/publish/queue";
import { requestUnpublish } from "~/publish/store";
import { writeFailure } from "~/publish/writeFailure";

export type UnpublishResult =
  | { readonly ok: true; readonly project: Project }
  | {
      readonly ok: false;
      readonly failure: PublishFailure;
      /** A plain sentence, safe to render as-is. */
      readonly message: string;
      readonly project: Project | null;
    };

const refuse = (
  failure: PublishFailure,
  project: Project | null,
): UnpublishResult => ({
  ok: false,
  failure,
  message: publishMessage(failure),
  project,
});

/**
 * Withdraws one project: intent, worker, clear.
 *
 * Safe to call on a project that is already private, which is what makes it the
 * repair path as well as the ordinary one: a record left holding
 * `publicAssets` by a half finished withdrawal is cleaned up by pressing the
 * same control again.
 */
export const unpublishProject = async (
  project: Project,
): Promise<UnpublishResult> =>
  publishesFor(project.id, async () => {
    const intent =
      project.visibility === "private"
        ? { ok: true as const, value: project }
        : await updateProject(project.id, (current) =>
            current.visibility === "private" ? {} : { visibility: "private" },
          );

    if (!intent.ok) return refuse(writeFailure(intent.failure), null);

    const answer = await requestUnpublish(project.id);
    // The record already reads private, which is the honest state and the safe
    // one, so a failure here leaves something a second press can finish.
    if (!answer.ok) return refuse(answer.failure, intent.value);

    const cleared = await updateProject(project.id, (current) =>
      // Someone made it public again while the withdrawal was in flight. That
      // record is the newer intent and clearing it would contradict it.
      current.visibility === "public"
        ? null
        : { publishedAt: null, publicAssets: null },
    );

    return cleared.ok
      ? { ok: true, project: cleared.value }
      : refuse(writeFailure(cleared.failure), intent.value);
  });
