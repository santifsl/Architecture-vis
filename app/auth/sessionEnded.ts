/**
 * The one-shot signal behind the session-ended banner. Spec 0001, AC-6.
 *
 * This is not a second copy of the auth state, and nothing may read it as one.
 * It answers a single narrower question that a fresh boot check cannot answer:
 * *why* this person is signed out. A check run against a dead token returns a
 * plain signed-out answer with nothing in it distinguishing "Puter ended your
 * session" from "you clicked sign out", so the reason has to be carried from the
 * event that knew it to the very next loader run, and then forgotten.
 *
 * Set by the `puter.auth.reauth_required` handler, read and cleared in the same
 * pass by `resolveAuthState`. The module-level mutable flag is deliberate: it is
 * a signal at the edge, written by an SDK event and consumed once.
 */
let sessionEnded = false;

/** Records that Puter, not the person, ended the session. */
export const markSessionEnded = (): void => {
  sessionEnded = true;
};

/** Reads the flag and clears it. Never returns true twice for one event. */
export const consumeSessionEnded = (): boolean => {
  const ended = sessionEnded;
  sessionEnded = false;
  return ended;
};
