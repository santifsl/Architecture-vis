/**
 * Whether a project is shared, and everything an owner can do about it.
 * Spec 0011, build tasks 10, 11 and 12's owner-facing half.
 *
 * One component rather than three, because the three things it shows are one
 * decision: the state word, the control that changes it, and, when the public
 * copy is behind, the sentence saying so with a retry. Split up they would each
 * have to work out the state again, and three answers to one question is how two
 * of them end up disagreeing.
 *
 * **Going public asks once; going private does not** (AC-25). The question is
 * asked in place rather than in a dialog: the design system has no overlay, no
 * scrim colour and no focus trap in it, and adding all three for one question
 * would be a lot of new machinery for something a sentence and two buttons
 * answers. Focus moves to the confirming button when the question opens, and the
 * sentence is what describes that button, so it is announced along with it.
 */
import { useEffect, useId, useRef } from "react";

import type { Project } from "~/projects/record";
import {
  isShared,
  PUBLISH_CONFIRMATION,
  repairFor,
  VISIBILITY_WORDS,
} from "~/publish/rules";
import { useVisibility } from "~/publish/useVisibility";

export function VisibilityControl({ project }: { readonly project: Project }) {
  const control = useVisibility(project);
  const describedBy = useId();
  const confirm = useRef<HTMLButtonElement>(null);

  /*
   * The question is a new thing on the page, so the keyboard goes to it. Without
   * this, pressing `Make public` leaves focus on a button that has just
   * disappeared, and the next Tab starts again from the top of the document.
   */
  useEffect(() => {
    if (control.asking) confirm.current?.focus();
  }, [control.asking]);

  const shared = isShared(control.state);
  const repair = repairFor(control.state);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-4">
        <p className="type-meta text-ink-soft">
          {VISIBILITY_WORDS[control.state]}
        </p>

        {!control.asking &&
          (!shared ? (
            <button
              type="button"
              className="btn-quiet"
              aria-busy={control.busy}
              onClick={() => {
                // aria-busy keeps the control focusable while the work runs, so
                // the handler is what has to refuse a second press. The latch
                // inside the hook refuses it again, synchronously.
                if (control.busy) return;
                control.askToPublish();
              }}
            >
              {control.busy ? "Working…" : "Make public"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-quiet"
              aria-busy={control.busy}
              onClick={() => {
                if (control.busy) return;
                control.unpublish();
              }}
            >
              {control.busy ? "Working…" : "Make private"}
            </button>
          ))}
      </div>

      {control.asking && (
        <div
          className="mt-3"
          role="group"
          aria-label="Make this project public"
        >
          <p className="max-w-prose type-body text-ink" id={describedBy}>
            {PUBLISH_CONFIRMATION}
          </p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              ref={confirm}
              className="btn-quiet"
              aria-describedby={describedBy}
              onClick={control.publish}
            >
              Share it
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={control.cancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/*
        The repair, and which way it goes (AC-22). It is read from the RECORD,
        not from anything this tab did, so it is still there after a reload, in
        another tab, and on a browser whose clock is wrong. That is what makes it
        a repair and not a notification.
      */}
      {!control.asking && repair !== null && (
        <>
          <p className="mt-3 max-w-prose type-body text-ink">
            {repair.message}
          </p>
          <button
            type="button"
            className="btn-quiet mt-1"
            aria-busy={control.busy}
            onClick={() => {
              if (control.busy) return;
              if (repair.direction === "publish") control.publish();
              else control.unpublish();
            }}
          >
            {control.busy ? repair.busyLabel : repair.label}
          </button>
        </>
      )}

      {control.message !== null && (
        <p className="mt-3 max-w-prose type-body text-ink">{control.message}</p>
      )}
    </div>
  );
}
