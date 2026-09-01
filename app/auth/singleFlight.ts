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

/**
 * The same latch, one per key. Spec 0006, AC-18, and the first of its three
 * start guards.
 *
 * A render needs a latch per `${projectId}:${model}` rather than one for the
 * whole app: independent renders are meant to run at the same time, so a single
 * app-wide latch would turn them into a queue and make one wait on another that
 * has nothing to do with it. What it does collapse is a double effect in
 * development, and any two starts for the SAME render in the same tab, into one
 * worker call.
 *
 * Keys are never removed. A project id plus a model is bounded by how many
 * projects one page visit touches, and a map that empties itself would need to
 * know when a render can no longer be started again, which is exactly the thing
 * the latch exists to be sure about.
 */
export const createKeyedSingleFlight = () => {
  const running = new Set<string>();

  return async (key: string, fn: () => Promise<void>): Promise<void> => {
    if (running.has(key)) return;
    running.add(key);
    try {
      await fn();
    } finally {
      running.delete(key);
    }
  };
};

/**
 * Runs work one item at a time per key, queueing rather than dropping.
 *
 * A different job from the latches above, and the difference matters: a latch
 * turns a second caller away, a queue makes it wait its turn. Both are wanted
 * here, for different things. Two starts of the same render are a mistake and
 * are dropped; two DIFFERENT models finishing at the same moment are exactly
 * what is supposed to happen, and both writes have to land.
 *
 * This is the answer to the hole spec 0002 left open and handed to feature 6.
 * `updateProject` is a read, modify, write against a store with no
 * compare-and-swap, so two completions interleaving in one tab means the second
 * one to write does so from a copy read before the first one landed, and the
 * first model's render is silently lost. That is precisely the independence
 * AC-2 promises, so every write for one project goes through one of these.
 *
 * It is honest about its limit, same as the store it protects: this serialises
 * one tab, not two. Two tabs are handled by the `startedAt` stamp instead,
 * which discards a stale write rather than preventing it.
 */
export const createSerialQueue = () => {
  const tails = new Map<string, Promise<unknown>>();

  return async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    // The previous item's settling, not its value, and never its rejection:
    // one failed write must not poison every write queued behind it.
    const previous = tails.get(key) ?? Promise.resolve();
    const mine = previous.then(fn, fn);
    tails.set(
      key,
      mine.catch(() => undefined),
    );
    return mine;
  };
};
