/**
 * The cross-tab lock on one model's render. Spec 0006, AC-18, guard 4.
 *
 * The other three guards all live inside a single tab. Guard 2, the check that
 * a render is not already `running`, is a read of the record followed by a
 * write of it, and two tabs that both read `pending` before either write lands
 * both pass it. Both then call the worker, both pay for an image, and the
 * `startedAt` stamp throws one of the two results away. That is the honest
 * limit spec 0006 recorded, and this closes it.
 *
 * `puter.kv.incr` is what makes it possible: it increments on the server and
 * returns the new value, so exactly one caller can ever be handed `1` for a key
 * that does not exist yet. The caller that gets `1` owns the render. Everyone
 * else got a higher number and stands down. There is no read-then-write here,
 * which is the whole point.
 *
 * The lock is a LEASE, not a lock: a tab that dies mid-render must not wedge a
 * model forever, so the key is given a time to live and the render becomes
 * claimable again when it runs out. The lease is `STALE_AFTER_MS`, the same
 * window after which the record itself stops believing a `running` render, so
 * the two agree rather than one of them blocking what the other allows.
 *
 * This never reports a failure to anyone. A claim that cannot be reached
 * degrades to the old behaviour rather than stopping a render: the lock is an
 * improvement on a guard that already worked imperfectly, and a KV hiccup that
 * left someone unable to render at all would be worse than the duplicate it
 * prevents. A real outage still surfaces, one step later and in one place, when
 * `commitRenderStart` cannot write the record.
 */
import type { ModelId } from "~/projects/record";
import { withPuter } from "~/platform/puter";
import { STALE_AFTER_MS } from "~/render/rules";

/**
 * Its own key rather than a field on the project record, because a field would
 * have to be read and written like everything else on that record, which is the
 * exact race being closed here.
 */
const claimKey = (projectId: string, model: ModelId): string =>
  `render-claim:${projectId}:${model}`;

/** The lease, in the seconds `kv.expire` takes. */
const LEASE_SECONDS = Math.round(STALE_AFTER_MS / 1000);

/** `won`: this attempt owns the render. `held`: someone else does. */
export type ClaimOutcome = "won" | "held";

/**
 * Puts a lease on the key, so it can never outlive the render it stands for.
 *
 * Called by the winner, and also by a loser, which looks redundant and is not.
 * `incr` and `expire` are two calls, and a tab that dies between them would
 * leave a key with no expiry at all: that model could then never be started
 * again by anyone, which is a far worse failure than the duplicate render this
 * prevents. A loser refreshing the lease costs one call and makes a permanently
 * stuck key impossible. It cannot be abused into holding the lock open, because
 * losers only ever arrive on a mount or a retry, never on a timer.
 *
 * Best effort throughout. A lease that could not be set is not worth failing a
 * render over, and the loser path is already handling a key it does not own.
 */
const lease = async (key: string): Promise<void> => {
  try {
    await withPuter((sdk) => sdk.kv.expire(key, LEASE_SECONDS));
  } catch {
    // Deliberately swallowed. See above.
  }
};

/**
 * Asks for the right to render one model, once.
 *
 * `takeOver` is for a `running` render the record already considers stale.
 * Nothing is waiting on that work any more, so its lease is broken rather than
 * waited out. Without it a retry of a stalled render would be refused by a lock
 * belonging to a tab that closed, which is the one case the person is actively
 * asking to get past.
 */
export const claimRender = async (
  projectId: string,
  model: ModelId,
  takeOver: boolean,
): Promise<ClaimOutcome> => {
  const key = claimKey(projectId, model);

  try {
    if (takeOver) await withPuter((sdk) => sdk.kv.del(key));

    const holders = await withPuter((sdk) => sdk.kv.incr(key));
    if (holders === 1) {
      await lease(key);
      return "won";
    }

    await lease(key);
    return "held";
  } catch {
    // Signed out, offline, or KV refusing: fall back to the three in-tab
    // guards, which is exactly where this feature stood before the lock.
    return "won";
  }
};

/**
 * Gives the render back, the moment this attempt stops being responsible for
 * it: it finished, it failed, or it never really started.
 *
 * Deleting rather than waiting for the lease is what makes Retry immediate. A
 * failed render that had to sit out the rest of a ten minute lease before it
 * could be tried again would read as a broken button.
 */
export const releaseRender = async (
  projectId: string,
  model: ModelId,
): Promise<void> => {
  try {
    await withPuter((sdk) => sdk.kv.del(claimKey(projectId, model)));
  } catch {
    // The lease is the backstop. Nothing here is worth surfacing.
  }
};
