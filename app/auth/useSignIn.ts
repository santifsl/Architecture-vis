/**
 * Subscribes a control to the one shared sign-in interaction.
 *
 * Spec 0001, AC-2, AC-3, AC-5. The behaviour itself, one attempt at a time, a
 * busy state while the popup is open, a revalidation once it succeeds, and a
 * plain sentence when the browser blocked the window, lives in `signInStore`,
 * shared by every control so concurrent surfaces coordinate one flow. This hook
 * only reads that value and binds the router's revalidator to it.
 *
 * A popup the person closed themselves is a cancel, not a failure, so it
 * produces no notice at all.
 *
 * Spec 0004, AC-11. Every sign-in button is now busy by `aria-busy` plus
 * `aria-disabled` rather than by the real `disabled` attribute, so that a
 * running sign in does not throw focus away mid action. `aria-disabled` does not
 * block a click, so this handler is what has to refuse the second one: `start`
 * is a call into `startSignIn`, whose single-flight latch is read and written
 * synchronously and drops an overlapping call whatever React has rendered. That
 * latch is now the only thing standing between a busy button and a second
 * `signIn()`, by mouse, by Enter, or by Space, so it is load bearing rather than
 * belt and braces. Do not remove it while any control is busy by ARIA alone.
 */
import { useSyncExternalStore } from "react";
import { useRevalidator } from "react-router";

import { getSnapshot, startSignIn, subscribe } from "~/auth/signInStore";
import type { SignInState } from "~/auth/signInStore";

export type { SignInNotice } from "~/auth/signInStore";

export type SignInInteraction = SignInState & {
  readonly start: () => void;
};

export const useSignIn = (): SignInInteraction => {
  const revalidator = useRevalidator();
  const { busy, notice } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  const start = (): void => {
    startSignIn(() => revalidator.revalidate());
  };

  return { busy, notice, start };
};
