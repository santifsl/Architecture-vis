# 0008. Rationale: the app shell and the personal project gallery

The build spec is [index.md](index.md). This file is the reasoning behind it and
is not read during a build.

## Context

> ⚠️ Premise note: features 5 and 6 are both still `in-progress` in scope.md,
> and specs 0005, 0006 and 0007 are all still `In Progress`. Their code is
> written but none of the three verify walkthroughs has been run. This gallery
> is the first screen that shows many stored records at once, so it is also the
> first screen where a defect in the create or render write path stops being one
> project you were watching and becomes a wall of wrong cards. That is not a
> reason to delay feature 7, and building it may well be the fastest way to
> notice such a defect. It is a reason to expect the first walk of this gallery
> to find bugs that belong to features 5 and 6, and to fix them there rather
> than papering over them in a card.

Roomify can create a project and render it, and it can show you that one project
at a URL. What it cannot do is show you the second one. There is no list, no way
back, and no navigation at all beyond the browser's address bar: the header in
`app/root.tsx` is a wordmark and a sign in control, and `/projects` is a
placeholder whose own comment says feature 7 fills it in. A person who renders
two floor plans has no way to reach the first one again short of a bookmark.

The forces are unusually settled here, which is why this decision is narrow.

The data is already there. Spec 0002 decided that a project lives in its owner's
own `puter.kv` under `project:<id>`, and it built `listProjects` for exactly this
screen, sorted newest first and skipping records this build cannot parse. That
function has been written, unused, since feature 3. So the question is not where
the gallery gets its data; it is what to draw and how much of it at once.

The look is already decided too. Feature 4's structural reference in scope.md
rules on the card grid directly: keep the shape of image, name and date, drop the
per card `Community` badge because a private gallery must never imply sharing,
and replace the generic clock and author meta line with a before and after
thumbnail pair. Spec 0004 then fixed the tokens, the six type roles, and the busy
treatment. There is no palette question left to ask.

What is genuinely open is quantity and liveness. A view URL for a private Puter
file expires, so `app/storage/` mints them on demand and caches the in flight
promise for under an hour, never persisting one. That design was built for a
project page showing one or two images. A gallery asks for two per card, and
`listProjects` hands back every project at once with no pagination to ask for,
so the number of private URLs alive at one moment becomes a property of how many
projects someone happens to have. Separately, a project whose render is running
raises the question of whether the gallery watches it, which is really a question
about whether a grid of cards is allowed to touch the leased cross tab claim in
`app/render/` that four separate fixes were needed to get right.

## Options considered

### Option 1: the full grid at `/projects` only

Leave home exactly as it is, hero and upload card, and put everything in the
guarded route. The navbar carries the only way in.

**Pros**:

- The thinnest possible slice. One new screen, one loader, one component.
- Home stays a landing page with a single job, which is the reading feature 4's
  reference gave it when it cut the second call to action.

**Cons**:

- Drops the projects section feature 4's structural reference explicitly put on
  the home screen, which would be overriding a decision already on record
  without saying so.
- Someone who signs in and lands on home sees no evidence their past work
  exists, which is most of what this feature is for.

### Option 2: a read only gallery on two surfaces, sharing one card

A capped strip on home under the upload card, the full paged grid at
`/projects`, one `ProjectCard` used by both, no live updates and no render
driving.

**Pros**:

- Honours feature 4's reference on the home screen and gives the guarded route a
  real job, at the cost of one extra loader, because the card is shared.
- Keeps the render loop in exactly one place. The gallery reads a status word
  and never claims, so nothing about the cross tab lease has to be reasoned
  about again on a screen with many cards.
- Client side paging bounds the mints on arrival, which is the one genuinely new
  risk this screen introduces.

**Cons**:

- Two surfaces, so two places to check when the card changes.
- A card showing `Working` never resolves itself. The person has to navigate.
- Paging state is component state and is lost on navigation.

### Option 3: live cards that update, and optionally resume, in place

The grid subscribes to running renders and swaps each card to its finished image
as it arrives, and in the fuller version restarts one it finds stalled.

**Pros**:

- The nicest thing to watch, and the only option where a finished render appears
  where you are already looking.
- Would make the gallery a genuinely useful place to sit while several renders
  run.

**Cons**:

- Wires the render loop into N cards. Every one of the four start guards and the
  leased claim now has to hold for a grid, on two surfaces, one of them
  unguarded.
- In the resume variant the gallery becomes a second place that starts renders,
  competing with the project page for the same claim. That is precisely the
  shape the four claim fixes in the recent history were fighting.
- Far more machinery for a screen people pass through on the way to a project
  page.

### Option 4: home is the gallery

For a signed in person, home becomes hero, upload card, then the full grid, and
`/projects` redirects to it.

**Pros**:

- One surface to build and maintain, and the gallery is impossible to miss.

**Cons**:

- The home screen grows without bound, and the upload card, the actual call to
  action, gets pushed further up the page the more you use the product.
- Makes the guarded route pointless, throwing away the one place `RequireUser`
  is already proven.

## Rationale

Option 2 wins on the two forces that are actually live.

The first is that the design is already decided and this feature does not get to
quietly reopen it. Feature 4's structural reference puts a projects section on
the home screen and describes the card grid down to what the meta line carries.
Option 1 would silently drop that section and Option 4 would inflate it into the
whole page; Option 2 is the reading that satisfies the reference as written, and
sharing one `ProjectCard` between the two surfaces is what makes honouring it
cheap rather than a doubling of work.

The second is that the render loop is the most expensive thing in this codebase
to get right, and it is finally right. The recent history is four consecutive
fixes to the cross tab claim: claiming atomically, claiming with one increment,
releasing only a claim young enough to be ours, and releasing nothing when no
claim was taken. Option 3 takes that machinery and multiplies it by a grid, on a
surface that is partly unguarded, for a screen most people are passing through.
The honest tradeoff is that a card reading `Working` does not resolve itself,
which is a real cost paid in one navigation. Buying liveness with a second place
that can start a render is not a trade worth making now, and the seam is not
closed: nothing in Option 2 prevents adding subscriptions later, because the card
already reads its state from the record.

Paging deserves its own note, because it is the one place this spec is stricter
than it looks, and one place where it must not overclaim. `listProjects` has no pagination and reading everything is
genuinely cheap, one key value list call. The cost that matters is not the read
but the mints: two expiring URLs to a private file per card, held in a module
scope cache. Rendering 12 cards rather than all of them is therefore a security
and resource bound as much as a performance one, which is why it appears in the
invariants rather than as a display preference. The alternative considered,
minting lazily as cards scroll into view, buys a smoother screen for an
observer per card and a failure that happens where nobody is looking. A button
is the boring choice and the right one here.

What paging does **not** do is bound the mints over a whole session. Pressing
`Show more` enough times reaches every project, so the cap governs what is alive
on arrival, not a ceiling on the day. That is worth stating plainly rather than
letting the invariant read stronger than it is. The real ceiling, if one is ever
needed, is unmounting cards that scroll far out of view, and nothing here
prevents adding it.

The smaller calls, made rather than asked:

- **A card is one link, and a failed mint gets no retry button.** Nesting a
  retry button inside a card sized link is both an accessibility problem and a
  contradiction of what a card is. `CLAUDE.md` asks every failure to carry an
  action, and here the action is the card itself: it still opens the project
  page, which already has a real retry beside a real sentence. The runner up,
  making the card a container with a separate title link, was rejected because
  it shrinks the click target to a line of text on the one screen whose whole
  job is clicking through.
- **`STATE_WORDS` moves rather than being copied, and the card reads it through
  `renderView`.** The card and the plate must never disagree about whether a
  render is `Queued`, `Working` or `Stopped`. A second copy of the words is one
  way they drift; reading the stored status instead of the view is the other,
  and the subtler one. `stalled` does not exist in `RENDER_STATUSES` at all: it
  is derived by `isStaleRender` at read time, so a card reading
  `renders[model].status` would show `Working` forever on a render abandoned ten
  minutes ago, while the project page beside it said `Stopped`. The card goes
  through `renderView(render, Date.now())` for exactly this reason. This was a
  real defect in the first draft of this spec, caught in cross check.
- **The card reuses the plate's frame and busy treatment rather than inventing
  a card sized version.** `.plate-frame` already holds a square from first paint
  and `[data-busy="true"]` already carries the blurred plan under a scrim, which
  is this app's signature state. The blurred plan is the same path the card's
  own thumbnail mints, and `app/storage/urls.ts` caches the in flight promise,
  so reusing it costs no second mint. A separate small card busy state would
  have been a second look for the same fact.
- **The date is formatted in the viewer's own locale and timezone**, by passing
  `undefined` to `Intl.DateTimeFormat`. There is no user setting to read and
  inventing one would be a data model change for a date under a thumbnail.
- **`cardRender` is a function, not `models[0]`.** `MODEL_IDS` is a union of one
  today, and `app/projects/AGENTS.md` records that the map shape is deliberately
  kept as the seam a second model returns through. Preferring the first complete
  render, then the first render of any kind, is the rule that stays correct if
  that ever happens, and it costs three lines now.
- **Both loaders return failures as data.** Not a new decision, just holding the
  line `app/routes/project.tsx` already set: a thrown response takes the header
  and the sign in control down with it.
- **The home loader calls `listProjects` while signed out rather than checking
  auth first.** The alternative, a loader that resolves auth for itself, would
  put a second Puter call on every home visit and would break
  `app/auth/AGENTS.md`'s rule that the root loader is the one place that decides
  who is signed in. Calling unconditionally is safe because `withPuter` refuses
  synchronously with no network call and no popup, and the resulting `signedOut`
  failure is a perfectly good marker. Whether the strip renders at all is still
  read from `useAuthState()`, so on the tick where the two could disagree, the
  auth fact wins and the navbar and the strip stay consistent.

## References

**Project sources** (verifiable, in this repo):

- `scope.md`, feature 4's structural reference for the home screen: the card
  grid shape, the dropped `Community` badge, and the before and after thumbnail
  meta line. Feature 7's own scope row for the navbar and gallery intent.
- Spec 0002, which decided the owner's own key value store is the system of
  record and built `listProjects` for this screen.
- Spec 0004, the token system, the six type roles, and the busy treatment this
  feature's state words and `Show more` control must use.
- Spec 0007, which left `MODEL_IDS` a union of one while keeping the map shape.
- `app/storage/AGENTS.md`, the minted URL rules: never persisted, promise
  cached, purged on sign out.
- `app/auth/AGENTS.md` and `app/render/AGENTS.md`, the concurrency primitives and
  the leased claim this feature deliberately does not touch.
- `CLAUDE.md`: folder by feature, no test runner, every failure is a sentence
  and an action, and the `frontend-design` plugin requirement for UI work.
- The `react-router-framework-mode` skill at
  `.agents/skills/react-router-framework-mode/`, for `clientLoader`,
  revalidation, and route module conventions.

**Practices and standards**:

- Pagination is not optional on a list surface, applied here to the render count
  rather than the query, because the scarce resource is minted private URLs
  rather than rows.
- Derived display state is computed at read time, never read from a stored
  field that does not carry it. `stalled` is the case in point.
- Single writer: one module owns every write to a store, and a read only surface
  stays read only.
- One interactive element per card, rather than nesting controls inside a link,
  which is the accessible way to build a clickable card.
