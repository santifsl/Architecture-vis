/**
 * Whether a project is shared, and everything an owner can do about it.
 * Spec 0011, build tasks 10, 11 and 12's owner-facing half, as amended twice.
 *
 * This used to be one component. Spec 0011 said so in as many words, and gave
 * the reason: the state word, the control that changes it, and the sentence
 * saying the public copy is behind are one decision, and split into three
 * components each working the state out again, three answers to one question is
 * how two of them end up disagreeing.
 *
 * Amendment 2 puts the word above the sheet's divider and the control below it,
 * which no single element can straddle. The invariant survives anyway, because
 * it was never really about the component boundary: `useVisibility` is called
 * ONCE, by `ProjectSheet`, and both pieces below are handed the same `control`
 * object. There is still exactly one answer to the question; it is now rendered
 * in two places instead of one. Calling the hook twice, once per piece, is the
 * thing spec 0011 was warning about, and it is what these two must never do.
 *
 * **Going public asks once; going private does not** (AC-25). The question is
 * asked in place rather than in a dialog: the design system has no overlay, no
 * scrim colour and no focus trap in it, and adding all three for one question
 * would be a lot of new machinery for something a sentence and two buttons
 * answers. Focus moves to the confirming button when the question opens, and the
 * sentence is what describes that button, so it is announced along with it.
 *
 * Amendment 1 made the two toggles filled buttons. `Make public` is a
 * `.btn-primary` and `Make private` a `.btn-neutral`, which is spec 0004's
 * amendment 3 applied here: the affirmative direction carries the accent, the
 * undo direction is the same weight without it. The confirmation's own two
 * actions and the repair action stay `.btn-quiet`. Two filled buttons under a
 * question build the visual weight of a dialog while having none of a dialog's
 * behaviour, and the repair sits under a sentence of prose, which is what
 * `.btn-quiet` is for.
 */
import { useEffect, useId, useRef } from "react";

import {
  isShared,
  PUBLISH_CONFIRMATION,
  repairFor,
  VISIBILITY_WORDS,
} from "~/publish/rules";
import type { VisibilityControl } from "~/publish/useVisibility";

/**
 * The state word alone, which sits under the project's name and above the rule.
 *
 * It reads the word off the same `control` the actions do, never off the record,
 * so while a publish is in flight the word and the button describe the same
 * moment rather than the word describing the last thing that was written.
 */
export function VisibilityWord({
  control,
}: {
  readonly control: VisibilityControl;
}) {
  return (
    <p className="mt-2 type-meta text-ink-soft">
      {VISIBILITY_WORDS[control.state]}
    </p>
  );
}

/** Everything you can do about it, which sits below the rule beside the download. */
export function VisibilityActions({
  control,
}: {
  readonly control: VisibilityControl;
}) {
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
    <div className="flex flex-col items-start gap-1">
      {!control.asking &&
        (!shared ? (
          <button
            type="button"
            className="btn-neutral"
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
            className="btn-neutral"
            aria-busy={control.busy}
            onClick={() => {
              if (control.busy) return;
              control.unpublish();
            }}
          >
            {control.busy ? "Working…" : "Make private"}
          </button>
        ))}

      {control.asking && (
        <div role="group" aria-label="Make this project public">
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
