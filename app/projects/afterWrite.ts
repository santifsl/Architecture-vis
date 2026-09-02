/**
 * What just changed about a project, announced once, from inside the one door.
 * Spec 0011, build task 11.
 *
 * This exists for a single sentence in the spec: the automatic republish fires
 * "inside `updateProject`'s queued task, after a successful write whose changes
 * included `name` or `renders`, when the stored `visibility` is `public`. Not
 * from a call site, so neither the rename path nor the render path can be wired
 * and the other forgotten." A trigger written at the call sites is a trigger
 * that is correct until somebody adds a third way to change a project.
 *
 * `app/projects/store.ts` cannot simply call the publish feature: publishing
 * writes records, so it imports the store, and the store importing it back is a
 * cycle. So the store announces and whoever cares listens, which also keeps the
 * projects feature knowing nothing about publishing.
 *
 * **A listener is never awaited.** The announcement happens inside the store's
 * queued turn, and a listener that started more work and was waited for would be
 * waiting for a queue position the turn it is running in still holds. That is a
 * deadlock, not a race, and it is the same trap `app/publish/queue.ts` records.
 * Listeners start their work and return; their own writes queue up behind this
 * one in the ordinary way.
 *
 * The registry holds mutable state, which the project's functional rule
 * otherwise avoids. It is the same exception the serial queue already is: a
 * subscription list is state at the edge, nothing outside can read it, and the
 * alternative is passing a callback through every writer in the app.
 */
import type { Project } from "~/projects/record";

export type ProjectWrite = {
  /** The record as it now stands, exactly as it was stored. */
  readonly project: Project;
  /**
   * True when the write changed what the project IS, meaning `name` or
   * `renders`. A `visibility`, `publishedAt` or `publicAssets` write is false,
   * which is the same line `revision` is counted along and for the same reason:
   * a publish that announced itself as content would ask to be republished
   * forever.
   */
  readonly content: boolean;
};

type Listener = (write: ProjectWrite) => void;

const listeners = new Set<Listener>();

/** Subscribes to every successful project write. Returns its own unsubscribe. */
export const onProjectWritten = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Tells every listener about a write that landed. Only `store.ts` calls this.
 *
 * A listener that throws must not take down the write that announced it, nor
 * stop the listeners after it, so each one is called inside its own try. There
 * is nowhere useful to report such a failure to: the write already succeeded and
 * the caller is owed its result.
 */
export const announceProjectWritten = (write: ProjectWrite): void => {
  listeners.forEach((listener) => {
    try {
      listener(write);
    } catch {
      // A broken listener is a bug in the listener, not in the write.
    }
  });
};
