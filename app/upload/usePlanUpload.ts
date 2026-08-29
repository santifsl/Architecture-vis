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
import { deletePlan, forgetAllPlanUrls, uploadPlan } from "~/upload/store";

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
   * Which attempt owns the card, and the real guard behind AC-16.
   *
   * `phase` cannot carry this, because it is state. A second event arriving
   * before React commits the `validating` phase reads the phase from before
   * `setPhase`, sees `idle`, and starts a second attempt: two writes race to be
   * the hosted result, the loser leaves an orphaned file, and the second one's
   * abort handle overwrites the first, so unmounting cancels only one of them
   * (AC-17). A ref is written synchronously, so the second event sees it.
   *
   * An id rather than a boolean, because every await here has to answer "is
   * THIS attempt still the current one", and a boolean can only answer "is
   * there a current one". Pick a file, sign out while it is still decoding, then
   * pick another: the flag would be back to true, and the first attempt's
   * continuation would read that as its own and upload alongside the second.
   * Comparing ids makes an abandoned attempt permanently unable to come back.
   */
  const lastAttempt = useRef(0);
  const currentAttempt = useRef<number | null>(null);

  /** Takes ownership of the card, or `null` if another attempt already has it. */
  const claim = useCallback((): number | null => {
    if (currentAttempt.current !== null) return null;
    lastAttempt.current += 1;
    currentAttempt.current = lastAttempt.current;
    return currentAttempt.current;
  }, []);

  /** Is this attempt still the one the card belongs to? */
  const owns = useCallback(
    (attempt: number): boolean => currentAttempt.current === attempt,
    [],
  );

  /** Gives the card back, if this attempt still holds it. */
  const release = useCallback((attempt: number): void => {
    if (currentAttempt.current === attempt) currentAttempt.current = null;
  }, []);

  /** Takes the card off whoever holds it. Signing out, and nothing else. */
  const abandon = useCallback((): void => {
    currentAttempt.current = null;
  }, []);

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
  const settleFailure = useCallback(
    (failure: UploadFailure, attempt: number) => {
      release(attempt);
      held.current = null;
      const previous = hosted.current;
      setPhase(
        previous === null ? { kind: "idle" } : { kind: "hosted", ...previous },
      );
      setNotice(UPLOAD_MESSAGES[failure]);
    },
    [release],
  );

  /**
   * Writes the file, then removes what it replaced.
   *
   * The delete runs only after a successful write. A failed delete is silent on
   * purpose: the new plan is stored and usable, and a stray file in someone's
   * own Puter drive is not a problem to interrupt them about. AC-10.
   */
  const runUpload = useCallback(
    async (file: File, type: AllowedType, attempt: number) => {
      setPhase({ kind: "uploading", fraction: 0 });
      setNotice(null);

      const result = await uploadPlan({
        file,
        type,
        onProgress: (fraction) => {
          if (alive.current && owns(attempt)) {
            setPhase({ kind: "uploading", fraction });
          }
        },
        onAbortReady: (abort) => {
          // Same ownership rule as everything else after an await. An attempt
          // that has been abandoned must not install its handle over the one
          // belonging to the attempt that replaced it, or unmounting would
          // cancel a write nobody asked it to cancel and leave the real one
          // running.
          if (owns(attempt)) abortWrite.current = abort;
        },
      });

      if (owns(attempt)) abortWrite.current = null;
      // Gone, or abandoned by a sign out while the write was in flight, possibly
      // with a newer attempt already running. Either way this one no longer owns
      // the card and must not touch it, or its result, or its abort handle.
      if (!alive.current || !owns(attempt)) return;

      if (!result.ok) {
        settleFailure(result.failure, attempt);
        return;
      }

      const replaced = hosted.current;
      const next: HostedPlan = { plan: result.value, filename: file.name };
      hosted.current = next;
      held.current = null;
      release(attempt);
      setPhase({ kind: "hosted", ...next });

      // Released before the delete rather than after it. The delete is cleanup
      // of the superseded file, the new plan is already stored and on screen,
      // and holding the latch through it would leave Replace silently dead for
      // as long as the delete took, with nothing on the card to explain why.
      if (replaced !== null && replaced.plan.path !== next.plan.path) {
        await deletePlan(replaced.plan.path);
      }
    },
    [owns, release, settleFailure],
  );

  const pick = useCallback(
    (file: File) => {
      // AC-16. Anything arriving while the card is working is ignored, so two
      // writes can never be in flight from one card. Checked and claimed against
      // the ref, not against `phase`, because two events in one tick both read
      // the phase from before the first `setPhase` and both get through.
      const attempt = claim();
      if (attempt === null) return;

      setPhase({ kind: "validating" });
      setNotice(null);

      void (async () => {
        const check = await validatePlanFile(file);
        // Gone, or abandoned by a sign out while the file was decoding. The
        // closure's `auth.status` is the one from before that sign out, so
        // without this the attempt would carry on into a write it cannot make.
        if (!alive.current || !owns(attempt)) return;

        // A refused file leaves any existing plan exactly where it is. AC-10.
        if (!check.ok) {
          settleFailure(check.reason, attempt);
          return;
        }

        held.current = { file, type: check.type };

        if (auth.status !== "signedIn") {
          // Waiting on a popup is not working. The card is idle and another
          // pick is allowed, so ownership comes off until the upload starts.
          release(attempt);
          setPhase({ kind: "held" });
          startSignIn();
          return;
        }

        await runUpload(file, check.type, attempt);
      })();
    },
    [auth.status, claim, owns, release, runUpload, settleFailure, startSignIn],
  );

  /**
   * Whoever was signed in as of the last render.
   *
   * Sign out is a transition, not a state. Signed out is also the ordinary
   * first state of this card, so reacting to the state rather than the change
   * would wipe a file picked before signing in, which is exactly what AC-11
   * exists to keep.
   */
  const wasSignedIn = useRef(auth.status === "signedIn");

  /**
   * Signing out takes the previous person's plan off the screen and their
   * minted URLs out of memory.
   *
   * Without this the card keeps rendering a preview whose `src` is an anonymous
   * read URL, one that needs no session and stays live for the rest of its hour,
   * and the module cache keeps handing that URL to anything that asks. On a
   * shared browser the next person to use it inherits both. Neither sign-out
   * path reloads the page, they only revalidate the auth fact, so nothing else
   * would clear either one.
   *
   * This covers the deliberate sign out and Puter ending the session itself,
   * because both land here as the same change in the auth fact.
   */
  useEffect(() => {
    const signedIn = auth.status === "signedIn";
    const justSignedOut = wasSignedIn.current && !signedIn;
    wasSignedIn.current = signedIn;
    if (!justSignedOut) return;

    abortWrite.current?.();
    abortWrite.current = null;
    // Taking the card off the current attempt is also what tells an upload still
    // in flight that it has been abandoned, so it settles without writing to the
    // card. Its id is spent, so a later attempt claiming the card cannot hand
    // ownership back to it.
    abandon();
    hosted.current = null;
    held.current = null;
    forgetAllPlanUrls();
    setPhase({ kind: "idle" });
    setNotice(null);
  }, [abandon, auth.status]);

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

    const attempt = claim();
    if (attempt === null) return;

    void runUpload(waiting.file, waiting.type, attempt);
  }, [auth.status, claim, phase.kind, runUpload]);

  /*
   * A blocked sign in popup has to surface here, not only in the header. The
   * person is looking at this card, they just picked a file, and nothing
   * visible happened. `useSignIn`'s notice wins over ours because it is the
   * more recent thing that went wrong.
   */
  const shown = signInNotice === null ? notice : SIGN_IN_MESSAGES[signInNotice];

  return { phase, notice: shown, pick, busy: isBusy(phase) };
};
