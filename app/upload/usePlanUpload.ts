/**
 * The upload card's state machine. Spec 0005, build task 5.
 *
 * One `pick` entry point serves both the first upload and Replace (AC-10). The
 * only difference between them is whether a plan is already hosted when the
 * file arrives, and modelling that as one path rather than two is what stops
 * the flows drifting apart as either one changes.
 *
 * Three rules here are load bearing, and each exists because the obvious
 * implementation gets it wrong:
 *
 * 1. **Replace never destroys before it succeeds** (AC-10). The previous file
 *    is deleted only after the new one is written. An earlier draft of the spec
 *    had it delete first, which means cancelling the file picker, picking a
 *    `.tiff`, or losing the network leaves someone with no plan at all. Here
 *    every one of those returns to the plan they already had.
 * 2. **The busy states ignore new input** (AC-16). Without that, a second drop
 *    onto the zone mid upload starts a parallel write and the two race to be
 *    the hosted result.
 * 3. **A picked file survives signing in** (AC-11). It is held across Puter's
 *    popup and uploaded once the auth fact resolves, so nobody picks the same
 *    file twice on the app's first screen. That only holds while the card stays
 *    mounted, which is what AC-15 is for.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthState } from "~/auth/useAuthState";
import { useSignIn, type SignInNotice } from "~/auth/useSignIn";
import type { FloorPlan } from "~/projects/record";
import { UPLOAD_MESSAGES, type UploadFailure } from "~/upload/failures";
import { validatePlanFile, type AllowedType } from "~/upload/plan";
import { deletePlan, uploadPlan } from "~/upload/store";

/** A plan that is stored and ready for feature 6. */
export type HostedPlan = {
  readonly plan: FloorPlan;
  /** The name as picked, for the preview's `alt` and the caption. AC-9. */
  readonly filename: string;
};

/** What the card is doing right now. The card renders straight off this. */
export type UploadPhase =
  | { readonly kind: "idle" }
  /** Checking the file. It decodes, so not instant on a large image. */
  | { readonly kind: "validating" }
  /** Valid, waiting for someone to finish signing in. AC-11. */
  | { readonly kind: "held" }
  /** Writing. `fraction` drives the busy hairline. AC-8. */
  | { readonly kind: "uploading"; readonly fraction: number }
  | ({ readonly kind: "hosted" } & HostedPlan);

export type PlanUpload = {
  readonly phase: UploadPhase;
  /** The sentence to show, or null. Never a provider string. AC-13. */
  readonly notice: string | null;
  /** The one entry point, used by the file input and by a drop. */
  readonly pick: (file: File) => void;
  /** True while nothing new may be accepted. AC-16. */
  readonly busy: boolean;
};

/** The sign in sentences, reused so the card does not restate them. */
const SIGN_IN_MESSAGES: Readonly<Record<SignInNotice, string>> = {
  popupBlocked:
    "Your browser blocked the Puter sign-in window. Allow pop-ups for this site, then pick your floor plan again.",
  didNotFinish: "Sign-in didn't finish, so nothing uploaded. Try again.",
};

const isBusy = (phase: UploadPhase): boolean =>
  phase.kind === "validating" || phase.kind === "uploading";

export const usePlanUpload = (): PlanUpload => {
  const auth = useAuthState();
  const { start: startSignIn, notice: signInNotice } = useSignIn();

  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * The plan currently on screen, if any.
   *
   * Held in a ref as well as in `phase` because every failure path has to be
   * able to put it back, and a ref reads the same whether or not the component
   * has re rendered since. `null` means this is a first upload rather than a
   * replace, which is the only thing that distinguishes the two.
   */
  const hosted = useRef<HostedPlan | null>(null);

  /** The file waiting on a sign in. AC-11. */
  const held = useRef<{
    readonly file: File;
    readonly type: AllowedType;
  } | null>(null);

  /** Cancels the write in flight, handed over by the store while one runs. */
  const abortWrite = useRef<(() => void) | null>(null);

  /**
   * False once the card is gone. Every state write after an await checks it, so
   * a resolved upload never sets state on a component that no longer exists.
   */
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // AC-17. A write still running against a card that is gone can only
      // produce a file nothing points at, so cancel it on the way out.
      abortWrite.current?.();
      abortWrite.current = null;
    };
  }, []);

  /** Back to whatever was on screen before this attempt, with a sentence. */
  const settleFailure = useCallback((failure: UploadFailure) => {
    held.current = null;
    const previous = hosted.current;
    setPhase(
      previous === null ? { kind: "idle" } : { kind: "hosted", ...previous },
    );
    setNotice(UPLOAD_MESSAGES[failure]);
  }, []);

  /**
   * Writes the file, then removes what it replaced.
   *
   * The delete runs only after a successful write. A failed delete is silent on
   * purpose: the new plan is stored and usable, and a stray file in someone's
   * own Puter drive is not a problem to interrupt them about. AC-10.
   */
  const runUpload = useCallback(
    async (file: File, type: AllowedType) => {
      setPhase({ kind: "uploading", fraction: 0 });
      setNotice(null);

      const result = await uploadPlan({
        file,
        type,
        onProgress: (fraction) => {
          if (alive.current) setPhase({ kind: "uploading", fraction });
        },
        onAbortReady: (abort) => {
          abortWrite.current = abort;
        },
      });

      abortWrite.current = null;
      if (!alive.current) return;

      if (!result.ok) {
        settleFailure(result.failure);
        return;
      }

      const replaced = hosted.current;
      const next: HostedPlan = { plan: result.value, filename: file.name };
      hosted.current = next;
      held.current = null;
      setPhase({ kind: "hosted", ...next });

      if (replaced !== null && replaced.plan.path !== next.plan.path) {
        await deletePlan(replaced.plan.path);
      }
    },
    [settleFailure],
  );

  const pick = useCallback(
    (file: File) => {
      // AC-16. Anything arriving while the card is working is ignored, so two
      // writes can never be in flight from one card.
      if (isBusy(phase)) return;

      setPhase({ kind: "validating" });
      setNotice(null);

      void (async () => {
        const check = await validatePlanFile(file);
        if (!alive.current) return;

        // A refused file leaves any existing plan exactly where it is. AC-10.
        if (!check.ok) {
          settleFailure(check.reason);
          return;
        }

        held.current = { file, type: check.type };

        if (auth.status !== "signedIn") {
          setPhase({ kind: "held" });
          startSignIn();
          return;
        }

        await runUpload(file, check.type);
      })();
    },
    [auth.status, phase, runUpload, settleFailure, startSignIn],
  );

  /**
   * The other half of AC-11: the moment the auth fact turns to signed in, a
   * file that was waiting goes up on its own.
   *
   * Keyed off the auth state rather than the sign in promise, because the root
   * loader is what produces the user and a revalidation is what delivers it.
   * Watching the promise would fire before the app knows who signed in.
   *
   * Cancelling the popup leaves the phase at `held` with the file still kept,
   * so the card sits idle and picking again, or signing in, still works.
   */
  useEffect(() => {
    if (auth.status !== "signedIn" || phase.kind !== "held") return;

    const waiting = held.current;
    if (waiting === null) return;

    void runUpload(waiting.file, waiting.type);
  }, [auth.status, phase.kind, runUpload]);

  /*
   * A blocked sign in popup has to surface here, not only in the header. The
   * person is looking at this card, they just picked a file, and nothing
   * visible happened. `useSignIn`'s notice wins over ours because it is the
   * more recent thing that went wrong.
   */
  const shown = signInNotice === null ? notice : SIGN_IN_MESSAGES[signInNotice];

  return { phase, notice: shown, pick, busy: isBusy(phase) };
};
