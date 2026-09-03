/**
 * Keeping the public copy in step, without anybody asking. Spec 0011, build
 * task 11, AC-22 and AC-10.
 *
 * Subscribed once, above every screen, rather than wired into the places that
 * change a project. That is the whole point: a trigger written at the call sites
 * is correct until somebody adds a third way to change a project, and renaming
 * one and finishing a render for one are already two. The store announces every
 * write from inside its own queued turn, so whatever changed it, this hears it.
 *
 * A failed republish is deliberately silent HERE and loud on the project sheet.
 * It leaves the record's `revision` ahead of its `publishedRevision`, which is
 * the out of date state, which the sheet shows with a retry. A toast on a screen
 * somebody may not even be looking at would be a second way of saying the same
 * thing, and the record's own state is the one that survives a reload.
 */
import { useEffect } from "react";

import { onProjectWritten } from "~/projects/afterWrite";
import { publishProject } from "~/publish/publish";

/**
 * Is there anything to publish? A content write that leaves no finished render
 * is skipped rather than sent.
 *
 * Spec 0011 says any successful content change to a public project republishes.
 * Taken literally that includes the write that moves a regenerating render back
 * to `running`, at which moment the project has nothing complete, so the worker
 * would correctly refuse with `noRender` and the person would get a failure
 * sentence for doing nothing wrong. Skipping costs nothing: the project is
 * already showing as out of date, and the write that finishes the render is
 * itself a content change and republishes then.
 */
const hasSomethingToShow = (project: {
  readonly models: readonly string[];
  readonly renders: Readonly<
    Record<string, { readonly status: string } | undefined>
  >;
}): boolean =>
  project.models.some((model) => project.renders[model]?.status === "complete");

export const useAutoRepublish = (): void => {
  useEffect(
    () =>
      onProjectWritten(({ project, content }) => {
        if (!content) return;
        if (project.visibility !== "public") return;
        if (!hasSomethingToShow(project)) return;

        // Not awaited, and it must not be: this runs inside the store's queued
        // turn, and a republish waits for its own position in that same queue.
        // `publishProject` takes the publish queue, so a republish arriving
        // while one is in flight waits its turn rather than overlapping.
        void publishProject(project);
      }),
    [],
  );
};
