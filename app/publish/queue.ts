/**
 * One publish sequence at a time, per project. Spec 0011's second invariant.
 *
 * The spec asks that a publish and an unpublish of one project can never
 * overlap in a tab, and says both worker calls should go through the same per
 * project serial queue as every record write. **That is not implementable as
 * written**, and the reason is worth keeping next to the code rather than
 * discovering again: `updateProject` enters that queue itself, so a publish
 * sequence held inside one of its turns and calling `updateProject` from within
 * it would wait for a queue position that cannot be reached until it returns.
 * It does not race, it deadlocks, on the first press.
 *
 * So there are two queues, and they compose rather than compete. This one holds
 * a whole publish or unpublish SEQUENCE, intent write, worker call and commit
 * together, which is the thing that must not interleave. The record queue in
 * `app/projects/store.ts` still holds every individual write, and it is still
 * the only door into the store. The single writer rule is untouched: nothing
 * here writes a record, it only decides who gets to run a sequence next.
 *
 * Honest about its limit, same as the queue it sits beside: this serialises one
 * tab, not two. Across tabs the worker's second read of the record narrows the
 * window to one round trip, and spec 0011 records plainly that the race is
 * bounded rather than closed.
 */
import { createSerialQueue } from "~/auth/singleFlight";

/**
 * Module scope, not per caller, for the same reason the record queue is: the
 * point is that two callers who know nothing about each other still take their
 * turn.
 */
export const publishesFor = createSerialQueue();
