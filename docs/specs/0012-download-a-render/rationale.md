# 0012. Download a render, the reasoning

The build spec is [index.md](index.md). This file is the decision record: why
this shape rather than the others. `/develop` does not need it.

## Context

> ⚠️ Premise note: `scope.md`'s feature 10 row says this is "straightforward once
> the render already has a permanent public URL from feature 5's storage
> approach". That is not what feature 5 built. Spec 0005 deliberately decided the
> opposite, that a path is stored and a URL is minted on demand and allowed to
> expire, and the permanent public URL exists only for a project that feature 9
> has published. Believing the row as written leads straight to the one option
> that cannot work, an anchor pointed at a cross origin URL, and to a feature
> that silently covers only published projects. The right framing is that export
> starts from the private path, which is why the row's word "straightforward" is
> still true but for a different reason: the SDK read is simple, the URL is not
> involved. Fix the row when linking this spec.

Ten features in, AV can produce a render and it can show one. It cannot hand one
over. A render lives at a private path in the owner's own Puter storage, and the
only way it ever reaches a screen is through `app/storage/urls.ts`, which mints a
view URL on demand and lets it expire after an hour. That is exactly right for
displaying an image and exactly wrong for keeping one: a URL that dies on a timer
is not a file somebody can put in a client deck.

Three forces shaped this decision.

The first is that the durable identifier here is a path, not a URL. Spec 0005
made that call for the floor plan and spec 0006 repeated it for the render, and
both were corrections of spec 0002, which had tried to store a URL. Anything
this feature does has to start from a path, because that is the only thing the
record is willing to hold.

The second is the split between private and published. A published project has a
permanent public URL on its `FeedEntry`, written by the worker at publish time
in feature 9. A private project has nothing of the kind. Any mechanism that
reaches for the hosted copy therefore works for some projects and not others,
and "download works, unless you have not published" is not a feature anyone
would want to explain.

The third is that browsers are opinionated about downloads in a way that
determines the mechanism rather than merely constraining it. The `download`
attribute on an anchor is honoured only for same origin URLs. Every URL this app
can produce for a stored file, minted or hosted, is on a Puter origin rather
than the app's own, so an anchor pointed at one of them ignores both the
attribute and the filename and opens the image in a tab. That single fact rules
out the cheapest looking option entirely, and it is the reason the filename
decision and the mechanism decision are really one decision wearing two hats.

Not deciding costs the product its output. Everything else AV does is in service
of producing one image, and that image currently cannot leave.

## Options considered

### Option 1: point an anchor at the minted view URL

Reuse `useStoredUrl`, which already has the URL on screen for the image, and
render `<a href={url} download={name}>`. Three lines, no new module, no read.

**Pros**:

- Effectively free. The URL is already minted and already cached, so a render
  that is visible costs nothing extra to offer.
- No memory pressure, no blob, no object URL to clean up.

**Cons**:

- It does not work. The URL is cross origin, so the browser ignores `download`,
  navigates instead of saving, and names the file whatever the server says. Both
  the naming acceptance criterion and the plain expectation that a download
  downloads fail outright.
- The hour long URL lifetime becomes a user visible expiry on a saved file's
  link rather than an internal caching detail.

### Option 2: read the file through the SDK and save the blob

`puter.fs.read(path)` returns a `Blob`, which becomes an object URL on a
generated anchor with the chosen filename, clicked and then revoked.

**Pros**:

- Works on a private path, which is every project rather than only the published
  ones.
- The object URL is same origin by construction, so `download` is honoured and
  the filename decision actually holds.
- No expiry to race. The read happens at the moment of the click rather than
  depending on a URL minted some minutes earlier.
- Confirmed against the installed SDK typings rather than assumed:
  `read` is declared as returning `Promise<Blob>` in
  `node_modules/@heyputer/puter.js/types/modules/FileSystem/index.d.ts`.

**Cons**:

- The whole file lands in memory before the save starts. Fine for a square
  render, and a bad habit to generalise from.
- The file is fetched a second time on a visit where it is already displayed,
  because the displayed copy is behind a cross origin URL that cannot be reused.
- The object URL is a resource that has to be released, and releasing it too
  eagerly cancels the save in some browsers, so the lifecycle needs stating
  rather than improvising.

### Option 3: fetch the minted view URL and save the resulting blob

Keep `useStoredUrl` as the source, then `fetch` that URL and turn the response
into a blob, which sidesteps the cross origin `download` problem while reusing
the cache.

**Pros**:

- A render already on screen costs no second read from Puter, only a fetch that
  may well be served from the HTTP cache.
- Same saving mechanics as option 2 from the blob onward, so the filename
  decision survives.

**Cons**:

- It depends on Puter's URL host sending permissive CORS headers, which is an
  unverified assumption about somebody else's infrastructure and one that can
  change without notice. A silent failure here looks like a broken button, not
  like a policy.
- It reintroduces the expiry: a URL minted fifty minutes ago and fetched now can
  be dead, which is a failure mode option 2 simply does not have.
- Two systems now have to be right instead of one.

### Option 4: use the published public URL

Download from the permanent hosted copy that feature 9 writes at publish time.

**Pros**:

- No expiry at all, by design, and it is the same file anyone with the link
  already sees.
- Would extend naturally to the public project page later.

**Cons**:

- It exists only for published projects, so it cannot serve the private case,
  which is the majority case and the one the scope row describes.
- It couples export to feature 9, which is still in progress and not yet
  verified. A feature that could ship independently would stop being able to.
- Still cross origin, so it needs option 3's fetch anyway and inherits its CORS
  risk on top of the coverage gap.

## Rationale

Option 2 is chosen because it is the only one that satisfies the two forces from
Context at the same time. The path is the durable identifier, and option 2 is
the only option that reads from the path rather than from a URL derived from it;
that makes it the only one that works for a private project, which is the state
every project is in until somebody chooses otherwise. Option 1 fails on the
browser fact rather than on taste, and it is worth recording that it fails
rather than leaving it to be rediscovered as a bug: an anchor pointing at a
cross origin URL is a download that navigates.

Between options 2 and 3, the deciding force is that option 3 makes a correct
feature depend on a CORS header the project neither controls nor currently
knows the value of. Option 2 depends on `puter.fs.read`, which the app already
depends on everywhere else and which is typed in the installed package. Choosing
a verified dependency over an unverified one is the whole trade, and the cost of
choosing it, one extra read of a file that is already visible, is measured in a
few hundred kilobytes on a click somebody deliberately made.

Two of the engineer's picks went against the recommendation, and both are
reasonable calls worth recording as deliberate. `.btn-outline` rather than
`.btn-quiet` puts a bordered control in a label row that spec 0004 left as two
lines of text, which makes the row heavier but makes the action findable; that
is a fair trade for the one action on the page that produces something a person
keeps. Present but disabled rather than absent is the more interesting one,
because a truly `disabled` button is unfocusable and announces nothing, so
"present but disabled" done naively is strictly worse than absent for a keyboard
user: the clutter with none of the information. `aria-disabled` is what makes
the choice pay off, and it forces a small amendment to spec 0004's state 5 of 6,
which is currently attribute driven. That amendment is the honest cost of the
override and it is written into the build plan rather than left implicit.

One trap is named in the build plan because it would otherwise be found by
somebody's file being renamed badly: `sanitisePlanName` in `app/upload/plan.ts`
looks like exactly the right helper and is not. It strips a trailing extension,
which is correct for the filename it was written for and wrong for a project
name, since `Flat 2.b north` would come out as `flat-2`. The collapse rule is
worth sharing; the strip is not.

Finally, the decision to persist nothing deserves a sentence, because the
alternatives were tempting and both were declined. A last downloaded timestamp
would mean schema 4, a parser change, and a write on a path that is currently
pure read, for information nobody asked to see. A download count on the feed
entry can only be written by the worker, which makes it a feature 9 change
rather than an export change. Keeping this feature a pure read is what makes it
independently shippable while feature 9 is still in progress.

## Cross check

A second model read the drafted spec before it was accepted and found five gaps,
all of them the same kind: a value an acceptance criterion needed whose source
the spec never named. Every user visible string was deferred to the build, which
`app/render/failures.ts` does not do and this spec should not either, so all
seven are now quoted in a **Copy** table. The split between `unreadable` and
`unreachable` claimed a precedent in `app/storage/urls.ts` that does not exist
there, and had no decidable rule, so it is now a `stat` before the read rather
than an inspection of whatever `fs.read` throws. The fallback filename stem was
unnamed, `DownloadRender.tsx` was named once and never placed, and `saveBlob` was
asserted to be incapable of failing while AC-9 forbids any raw exception.

The check also found something worth more than the gaps: `AuthControl.tsx`
already sets `aria-disabled` on the sign in button while it is busy, and the CSS
has only ever matched `[disabled]`, so that button has never dimmed. The
amendment AC-13 asks for is therefore a fix to a live inconsistency, not a rule
invented for this feature.

One simplification came out of it too. Deriving the extension from the stored
path has an unreachable branch, because `RENDER_EXTENSION` is hardcoded and
nothing writes any other format, so the constant is used directly and the day a
second format arrives is named in Consequences instead.
