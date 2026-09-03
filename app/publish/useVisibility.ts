/**
 * The visibility control's engine: both directions, the confirmation, and the
 * retry. Spec 0011, build tasks 10 and 11.
 *
 * AC-25 in the shape of the state it needs: going public asks once, going
 * private does not. So `askToPublish` only opens the question and `publish` is
 * what actually does anything, while `unpublish` acts immediately. A control
 * that asked before withdrawing would be asking permission to make something
 * less public, which nobody needs protecting from.
 *
 * Two guards, both of which the render loop already pays for:
 *
 *   1. A latch per project id, read and written synchronously, so a rapid
 *      double click is one publish. A `busy` flag alone is not enough: both
 *      clicks of a double click are dispatched in the same task, before React
 *      has re-rendered anything, so both would pass a state check.
 *   2. An `alive` ref, so work that finishes after somebody has navigated away
 *      never sets state on a component that is gone. The WRITES are never
 *      conditional on the component still being here, same rule as the render
 *      loop: abandoning a publish that has already copied files would leave the
 *      exact half finished state the intent first order exists to make
 *      repairable.
 *
 * Nothing here holds a copy of the project. The record reaches the screen
 * through the store's own write announcement, so this hook owns only what is
 * genuinely about this control: whether it is busy, whether it is asking, and
 * the sentence from the last attempt.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { createKeyedSingleFlight } from "~/auth/singleFlight";
import type { Project } from "~/projects/record";
import { publishProject } from "~/publish/publish";
import { publicState, type PublicState } from "~/publish/rules";
import { unpublishProject } from "~/publish/unpublish";

/**
 * Module scope, not per hook instance, for the same reason the render loop's
 * is: a latch recreated on remount would let a development double effect start
 * the same publish twice.
 */
const changeOne = createKeyedSingleFlight();

export type VisibilityControl = {
  readonly state: PublicState;
  /** True while a publish or a withdrawal is in flight. */
  readonly busy: boolean;
  /** True while the confirmation is being shown. AC-25. */
  readonly asking: boolean;
  /** A plain sentence about the last attempt, or nothing. Never a raw error. */
  readonly message: string | null;
  /** Opens the confirmation. Does nothing else. */
  readonly askToPublish: () => void;
  /** Closes the confirmation without publishing. */
  readonly cancel: () => void;
  /** Publishes, and the same call retries a publish that did not finish. */
  readonly publish: () => void;
  /** Makes the project private. Immediate, with no confirmation. */
  readonly unpublish: () => void;
};

export const useVisibility = (project: Project): VisibilityControl => {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    (work: () => Promise<{ ok: boolean; message?: string }>) => {
      void changeOne(project.id, async () => {
        if (alive.current) {
          setBusy(true);
          setAsking(false);
          setMessage(null);
        }

        const result = await work();

        if (!alive.current) return;
        setBusy(false);
        setMessage(result.ok ? null : (result.message ?? null));
      });
    },
    [project.id],
  );

  const publish = useCallback(() => {
    run(() => publishProject(project));
  }, [project, run]);

  const unpublish = useCallback(() => {
    run(() => unpublishProject(project));
  }, [project, run]);

  const askToPublish = useCallback(() => {
    setMessage(null);
    setAsking(true);
  }, []);

  const cancel = useCallback(() => {
    setAsking(false);
  }, []);

  return {
    state: publicState(project),
    busy,
    asking,
    message,
    askToPublish,
    cancel,
    publish,
    unpublish,
  };
};
