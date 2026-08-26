/**
 * Runs one async sequence at a time. Overlapping calls are dropped, not queued.
 *
 * This exists because a React `useState` guard is not enough on its own. Setting
 * `busy` to true and rendering a disabled button both happen after the current
 * task finishes, so two clicks dispatched in the same task, which is exactly how
 * a rapid double click arrives, both pass the check before the button ever
 * re-renders as disabled. The latch below is read and written synchronously, so
 * the second call is turned away whatever React has or has not rendered yet.
 *
 * The latch clears only after the whole sequence settles, so a caller can hold
 * it across several awaits (signing in, and then the revalidation that catches
 * the root loader up) rather than releasing it halfway.
 *
 * The closure holds mutable state deliberately. It is a guard on a user
 * interaction, which is the edge, and nothing outside can observe or change it.
 */
export const createSingleFlight = () => {
  let running = false;

  return async (fn: () => Promise<void>): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  };
};
