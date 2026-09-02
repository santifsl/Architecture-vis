/**
 * One published project, as a card in the community feed. Spec 0011, build
 * task 7.
 *
 * The same square frame, the same caption rhythm and the same type roles as
 * `app/gallery/ProjectCard.tsx`, on purpose: a gallery of renders and a feed of
 * renders are the same subject in two places, and inventing a second look for
 * the second one is how two surfaces start disagreeing about what a render is
 * supposed to look like.
 *
 * What is different is the one thing that actually differs. A gallery card
 * shows a PRIVATE file, so it mints a short lived view URL and holds a busy
 * state while that is in flight. A feed card shows the hosted public copy,
 * whose URL is already on the entry and does not expire, so there is nothing to
 * mint, nothing to wait for and no state at all: the image is either there or
 * the browser could not fetch it.
 *
 * The whole card is one link and contains nothing else you can operate, the
 * same rule `ProjectCard` follows: a button inside a link is both a nested
 * control and a second thing to aim at in a grid of them.
 */
import { Link } from "react-router";

import { formatProjectDate } from "~/gallery/rules";
import type { FeedEntry } from "~/projects/record";
import { PlateNote } from "~/render/RenderPlate";

/**
 * The render this card shows: the first model on the entry with a URL behind
 * it.
 *
 * The entry's `models` is already filtered to the ones that have one, so this
 * is total in practice and the `null` is defensive. It exists because an entry
 * that somehow carries no image should cost one quiet card rather than the page
 * it sits on.
 */
const cardImage = (entry: FeedEntry): string | null => {
  const model = entry.models.find(
    (candidate) => entry.renderUrls[candidate] !== undefined,
  );
  return model === undefined ? null : (entry.renderUrls[model] ?? null);
};

export function FeedCard({ entry }: { readonly entry: FeedEntry }) {
  const image = cardImage(entry);

  return (
    <Link to={`/community/${entry.projectId}`} className="gallery-card">
      <div className="plate-frame">
        {image === null ? (
          <PlateNote text="No render" />
        ) : (
          <img
            className="plate-image"
            src={image}
            alt={`The 3D render of ${entry.name}`}
          />
        )}
      </div>

      <h3 className="gallery-card-name mt-2 type-heading text-ink">
        {entry.name}
      </h3>

      <div className="mt-3 flex items-center gap-2">
        <span className="type-meta text-ink-soft">{entry.author}</span>
        <span className="type-meta text-ink-soft" aria-hidden="true">
          ·
        </span>
        <span className="type-meta text-ink-soft">
          {formatProjectDate(entry.publishedAt)}
        </span>
      </div>
    </Link>
  );
}
