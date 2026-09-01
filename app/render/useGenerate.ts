/**
 * Starting a project. Spec 0006, build task 9, and spec 0007, AC-11.
 *
 * There is nothing to pick any more. Gemini is the only model, so the card ends
 * at one button and `createProject` is handed `MODEL_IDS` rather than a chosen
 * subset of it: a control offering one option is a question with one answer,
 * which is a form rather than a decision.
 *
 * The upload card ends at a hosted plan and stops, which is where spec 0005
 * deliberately left it: feature 5 hands back a `HostedPlan` and writes nothing.
 * This is the other half, and it is the only place a project record is ever
 * created.
 *
 * Creating the record and starting the renders are two separate things on
 * purpose. The record is written here, the renders start on the project page,
 * and every render is created `pending`. So an interruption between the write
 * and the navigation, a closed tab, a lost connection, leaves a project whose
 * work has not started rather than one whose work is lost: the next visit to
 * that project starts it (AC-17).
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { createSingleFlight } from "~/auth/singleFlight";
import { useAuthState } from "~/auth/useAuthState";
import { MODEL_IDS } from "~/projects/record";
import { createProject } from "~/projects/store";
import { projectNameFrom } from "~/render/rules";
import type { HostedPlan } from "~/upload/usePlanUpload";

const SIGNED_OUT_NOTICE =
  "You're signed out. Sign in, and your floor plan is still here.";

export type Generate = {
  readonly start: () => void;
  readonly busy: boolean;
  /** A plain sentence, or null. Never a store failure's internals. */
  readonly notice: string | null;
};

export const useGenerate = (plan: HostedPlan | null): Generate => {
  const auth = useAuthState();
  const navigate = useNavigate();

  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * One per card, held in a ref so it survives re-renders.
   *
   * The Generate button is busy rather than disabled while it works, so it
   * keeps focus, and `aria-disabled` does not stop a click. Spec 0004 says as
   * much: a busy control's handler has to return early, and this is what makes
   * that true even for two clicks dispatched in the same task, before React has
   * rendered anything as busy.
   */
  const onlyOnce = useRef(createSingleFlight());

  const start = useCallback(() => {
    if (plan === null || busy) return;

    void onlyOnce.current(async () => {
      if (auth.status !== "signedIn") {
        setNotice(SIGNED_OUT_NOTICE);
        return;
      }

      setBusy(true);
      setNotice(null);

      const created = await createProject({
        name: projectNameFrom(plan.filename),
        owner: auth.user.username,
        floorPlan: plan.plan,
        models: MODEL_IDS,
      });

      if (!created.ok) {
        setBusy(false);
        setNotice(created.message);
        return;
      }

      // Busy stays on through the navigation. Clearing it first would put a
      // live Generate button back on screen for the moment before the route
      // changes, which is exactly long enough to press twice.
      await navigate(`/project/${created.value.id}`);
    });
  }, [auth, busy, navigate, plan]);

  return { start, busy, notice };
};
