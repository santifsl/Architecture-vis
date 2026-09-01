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

/**
 * How long before the lease runs out, in the seconds `kv.expire` takes.
 *
 * Deliberately SHORTER than `STALE_AFTER_MS`, and that gap is the load bearing
 * part. The claim is taken just before the record's `startedAt` is written, so
 * an equal lease would expire fractionally AFTER the record gave up on the
 * render, leaving a window where a person presses Retry on a card that says it
 * has stalled and a lock nobody owns any more silently refuses it. A minute of
 * margin dwarfs the round trip that causes the skew, and turns the ordering
 * into a guarantee: by the time the record calls a render stale, its claim is
 * already gone.
 *
 * The gap costs nothing. Between the lease running out and the record going
 * stale, guard 2 is what refuses a second start, exactly as it does for the
 * whole of a live render.
 */
const LEASE_MARGIN_MS = 60 * 1000;
const LEASE_SECONDS = Math.round((STALE_AFTER_MS - LEASE_MARGIN_MS) / 1000);

/**
 * What an attempt is standing on. Three states, not two, and the third is the
 * one that is easy to leave out.
 *
 * `held`: someone else owns the render, so this attempt stands down.
 *
 * `won`: this attempt owns it. Carries the moment the claim was taken, because
 * releasing it later needs to know how old it is. See `releaseRender`.
 *
 * `unguarded`: the claim could not be taken at all, because KV could not be
 * reached. The render still goes ahead, on the three in-tab guards alone, which
 * is where this feature stood before the lock existed. What it must never do is
 * RELEASE: it holds no key, so a delete from here would be removing whatever
 * another tab legitimately owns. Reporting this as `won` was a real bug, and
 * the same "a delete that cannot name its owner" shape fixed twice already.
 */
export type Claim =
  | { readonly kind: "held" }
  | { readonly kind: "won"; readonly at: number }
  | { readonly kind: "unguarded" };

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
 * One `incr` and nothing else, which is what makes this safe. An earlier
 * version deleted the key first when the record considered a render stale, to
 * break a lease left behind by a tab that closed. That was wrong twice over:
 * two tabs retrying the same stalled render could interleave their delete and
 * their increment and both be handed `1`, and worse, one tab's delete could
 * throw away a live claim the other had just taken, so instead of one duplicate
 * render they stomped each other.
 *
 * Nothing is needed in its place, because a stale render's claim is ALREADY
 * gone: `LEASE_SECONDS` is set so the lease always runs out before the record
 * stops believing the render. Taking over a stalled render is therefore an
 * ordinary claim on a key that does not exist, which is precisely the case
 * `incr` decides atomically. The one case a delete was really covering, a key
 * with no expiry at all, is covered by the loser refreshing the lease below.
 */
export const claimRender = async (
  projectId: string,
  model: ModelId,
): Promise<Claim> => {
  const key = claimKey(projectId, model);

  try {
    const holders = await withPuter((sdk) => sdk.kv.incr(key));
    // The lease is set either way. The winner needs one so its own claim can
    // expire; a loser sets one so a key that somehow has no expiry cannot stay
    // that way, which is the only route to a permanently stuck model.
    await lease(key);
    return holders === 1 ? { kind: "won", at: Date.now() } : { kind: "held" };
  } catch {
    // Signed out, offline, or KV refusing: fall back to the three in-tab
    // guards, which is exactly where this feature stood before the lock. Note
    // that a failed LEASE does not land here; `lease` swallows its own errors,
    // and rightly so, because the `incr` above did succeed and this attempt
    // does own the key. Owning a key with no expiry is the one case where
    // releasing it matters most.
    return { kind: "unguarded" };
  }
};

/**
 * How long a claim stays safe to delete.
 *
 * A minute short of the lease, so the answer is never close. Deleting is a
 * round trip of its own, and a claim judged safe a moment before it expired
 * could otherwise land its delete a moment after.
 */
const SAFE_TO_RELEASE_MS = LEASE_SECONDS * 1000 - LEASE_MARGIN_MS;

/**
 * Gives the render back, the moment this attempt stops being responsible for
 * it: it finished, it failed, or it never really started.
 *
 * Deleting rather than waiting for the lease is what makes Retry immediate. A
 * failed render that had to sit out the rest of a nine minute lease before it
 * could be tried again would read as a broken button.
 *
 * The `claimedAt` check is what stops the delete from being the same mistake
 * the takeover path already made once. The key holds a count, not an owner, so
 * a delete cannot ask whether it is deleting its OWN claim. An attempt that
 * outlives its lease is no longer the owner: the key it took has expired, a
 * second tab may have claimed the render since, and deleting then would throw
 * away that live claim and let a third tab start yet another paid render.
 *
 * Elapsed time answers it without a round trip, and answers it exactly. A
 * successor cannot exist until this claim's lease has run out, so a claim that
 * is comfortably younger than its lease cannot have one, and its delete can
 * only be removing itself.
 *
 * Both halves of that ownership question are decided here rather than at the
 * call site, so there is one place to read and one place to get it wrong: an
 * attempt that never held a claim releases nothing, and neither does one whose
 * claim has aged out.
 *
 * An attempt too old to release safely simply lets the key expire. That costs
 * nothing real: the client gives up on a render after `RENDER_TIMEOUT_MS`, two
 * minutes, so every attempt that finishes at all finishes far inside the
 * window. The ones that do not are precisely the ones that must not delete.
 */
export const releaseRender = async (
  projectId: string,
  model: ModelId,
  claim: Claim,
): Promise<void> => {
  if (claim.kind !== "won") return;
  if (Date.now() - claim.at >= SAFE_TO_RELEASE_MS) return;

  try {
    await withPuter((sdk) => sdk.kv.del(claimKey(projectId, model)));
  } catch {
    // The lease is the backstop. Nothing here is worth surfacing.
  }
};
