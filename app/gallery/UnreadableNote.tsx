/**
 * The quiet line about records this build could not read. Spec 0008, AC-7.
 *
 * `listProjects` has always skipped a record it cannot parse and always reported
 * how many it skipped, and until now nothing showed that number to anyone. A
 * version 1 project simply vanished. It is still not an error and not something
 * to act on, so it is one annotation line under the grid rather than a notice
 * box: no mark, no accent, no alarm.
 *
 * Renders nothing at all when the count is zero, which is the usual case, so a
 * caller can drop it in without asking first.
 */
export function UnreadableNote({ count }: { readonly count: number }) {
  if (count <= 0) return null;

  return (
    <p className="mt-8 max-w-prose type-meta text-ink-soft">
      {count === 1
        ? "1 project isn't shown here. It was saved by a newer version of Roomify."
        : `${String(count)} projects aren't shown here. They were saved by a newer version of Roomify.`}
    </p>
  );
}
