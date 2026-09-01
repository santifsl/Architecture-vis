/**
 * The one way this app says something went wrong. Spec 0004's error treatment,
 * lifted out of the upload card by spec 0006 once a third screen needed it.
 *
 * The treatment is fixed by scope.md's design feature: body ink plus a thin
 * accent-outlined mark with no fill, and no status colour anywhere, ever. There
 * is no red in this palette and none is coming, so the sentence is the loud
 * part and the mark is not.
 *
 * It lives here rather than in a feature folder because it belongs to no
 * feature: uploads, model picking, and renders all say things through it. That
 * is CLAUDE.md's rule in practice, the same handful of classes appearing in
 * three places is a component, not a coincidence.
 *
 * `role="status"` rather than `role="alert"`: every sentence this shows follows
 * something the person just did, so it is announced politely at the next pause
 * rather than interrupting whatever a screen reader is in the middle of.
 */
import type { ReactNode } from "react";

export function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <p className="notice" role="status">
      <svg
        className="notice-mark"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.75v4" />
        <path d="M8 11.1v.4" />
      </svg>
      {children}
    </p>
  );
}
