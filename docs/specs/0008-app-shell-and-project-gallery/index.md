# 0008. The app shell and the personal project gallery

**Date**: 2026-09-01
**Status**: In Progress

## Summary

Roomify gets the frame it has been missing: a navbar on every screen, and a
gallery of your own past projects. The gallery is a plain read of what is
already stored, one prefix list against your own Puter key value store, so this
feature adds no new data and no new backend call. Cards show the render, a small
floor plan thumbnail beside the date, and the project name, and clicking one
opens the project page. Cards do not update while a render runs; you open the
project to watch that.

## Requirements

**User stories**:

- As someone who came back a week later, I want to see my past projects so the
  tool feels like a workspace rather than a one off generator.
- As someone with a project still generating, I want its card to say so, so I
  know where to click to watch it.
- As someone on any screen, I want a way back to my projects, so I am never
  stranded on a project page.

**Acceptance criteria**:

- **AC-1**: The navbar renders on every screen inside the configured app. It
  shows the Roomify wordmark linking to `/`, and a `Projects` link to
  `/projects` that appears only when someone is signed in. The auth control
  keeps its current place on the right.
- **AC-2**: `/projects` lists the signed in person's own projects, newest first,
  read through the existing `listProjects` and nothing else. No worker call and
  no second store is involved.
- **AC-3**: A card shows four things: the render as its square image, the
  project name, the creation date, and the floor plan as a small thumbnail on
  the meta line beside that date. The square is `.plate-frame`, the same
  `aspect-ratio: 1 / 1` the render plate uses and `RENDER_ASPECT_RATIO`
  records. The thumbnail is a new `.plan-chip` class, because `.plan-key` is
  sized for the project sheet.
- **AC-4**: A card whose render has not finished shows that render's state word
  in the image square and reserves the same square so nothing shifts. The word
  comes from `renderView(render, Date.now())`, **never** from
  `renders[model].status`: `stalled` is a view state derived from
  `isStaleRender`, so reading the stored status directly would leave an
  abandoned render reading `Working` forever on a card while the project page
  says `Stopped`. A working card reuses `.plate-frame[data-busy="true"]` and
  `BusyPlan`, so the busy state is the one spec 0004 built rather than a second
  invention. The gallery neither polls a render nor starts one.
- **AC-5**: The whole card is one link to `/project/:id`. No card contains a
  second interactive element.
- **AC-6**: `/projects` renders at most 12 cards on arrival. A `Show more`
  control adds 12 at a time and is gone once everything is shown. A card that
  has not been rendered mints no view URL, so the number of live minted URLs is
  bounded by how many cards are mounted rather than by how many projects exist.
  Repeated `Show more` is deliberately not capped beyond that.
- **AC-7**: When `listProjects` reports unreadable records, a quiet line under
  the grid says so in plain words, in `type-meta`. No notice box and no alert
  styling. The home strip shows the same line in place of being absent when it
  would otherwise vanish only because every record was unreadable.
- **AC-8**: With no projects at all, `/projects` shows a plain empty state and a
  link back to the upload card, not an empty grid. When nothing parsed **and**
  `unreadable` is above zero, it shows the empty state and AC-7's line together,
  because both facts are true and the second explains the first.
- **AC-9**: When `listProjects` fails, `/projects` shows that failure's own
  sentence and a retry control that runs the read again. No raw exception
  reaches the screen.
- **AC-10**: Signed out, `/projects` shows the existing sign in prompt at the
  same URL and lists nothing.
- **AC-11**: Home shows a `Recent projects` section under the upload card, at
  most 3 cards, with a `See all` link to `/projects`. Whether anyone is signed
  in is read from `useAuthState()` and from nowhere else, so the navbar and the
  strip can never disagree; the loader result only decides whether there is
  anything to show. It is absent when signed out, and absent when signed in with
  no projects, except for AC-7's line.
- **AC-12**: A card whose image URL fails to mint keeps its `.plate-frame`
  square, empty, with one `type-meta` line inside saying it cannot be shown, and
  stays a link to the project, where the real retry already exists. No new
  colour and no new token.
- **AC-13**: Signing in populates both surfaces without a manual reload.
- **AC-14**: The feature adds no persisted state. No new key in the store, no
  new field on the record, and no change to `SCHEMA_VERSION`.

## Decision

**Chosen option**: Option 2: a read only gallery over the existing store, on two
surfaces, sharing one card.

The gallery is a pure read of `listProjects` rendered by one `ProjectCard`
component used by both a capped strip on home and the full grid at `/projects`,
with client side paging and no live render updates.

**Implementation skills**:
`react-router-framework-mode`
(`remix-run/agent-skills`, `.agents/skills/react-router-framework-mode/`) ·
`react-router` (bundled with this project, `.agents/skills/react-router/`)

`CLAUDE.md` additionally requires Anthropic's `frontend-design` plugin to be
invoked before any screen is written here. It is not a repository skill, so it
cannot be pointed at a path; it must actually be run, not assumed active.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new entities and no schema change. The gallery reads `Project` exactly as
spec 0002 defined it and spec 0007 amended it, through the existing
`listProjects` in `app/projects/store.ts`:

| Value read          | Field                     | Notes                                                   |
| ------------------- | ------------------------- | ------------------------------------------------------- |
| Card image          | `renders[model].path`     | `null` until that render is `complete`                  |
| Card thumbnail      | `floorPlan.path`          | Always present, always a path and never a URL           |
| Card title          | `name`                    | Derived from the filename at creation                   |
| Card date           | `createdAt`               | Epoch milliseconds                                      |
| Card state word     | `renderView(render, now)` | A **view** state, not the stored status. Adds `stalled` |
| Link target         | `id`                      | Sorts by creation time on its own                       |
| Skipped record note | `ProjectList.unreadable`  | Already returned, never yet shown to anyone             |

**State transitions**:

None introduced. The card is a read of the render state machine spec 0002
defined and 0007 amended; it never advances it. This is what keeps
`app/render/` the single place a render is driven, and keeps the leased cross
tab claim honest.

**API surface**:

There are no HTTP endpoints in this feature. Puter is the backend and the read
already exists, so the surface is a module surface:

| Surface                               | Kind                | Key inputs         | Key outputs                         | Auth                   | Key failures                                         |
| ------------------------------------- | ------------------- | ------------------ | ----------------------------------- | ---------------------- | ---------------------------------------------------- |
| `listProjects()`                      | existing, unchanged | none               | `{ projects, unreadable }`          | the caller's own Puter | `signedOut`, `unreachable`                           |
| `clientLoader` on `/projects`         | new                 | none               | the `StoreResult<ProjectList>`      | none at the loader     | returns the failure as data, never throws            |
| `clientLoader` on `/`                 | new                 | none               | the same `StoreResult<ProjectList>` | none at the loader     | `signedOut` is the marker; the strip does not render |
| `<ProjectCard project>`               | new component       | one `Project`      | one linked card                     | n/a                    | mint failure becomes a placeholder                   |
| `<ProjectGrid projects initialCount>` | new component       | projects, a cap    | the grid plus its `Show more`       | n/a                    | n/a                                                  |
| `cardRender(project)`                 | new pure function   | one `Project`      | the render a card should show       | n/a                    | returns `null` when there is none                    |
| `formatProjectDate(createdAt)`        | new pure function   | epoch milliseconds | a short date string                 | n/a                    | n/a                                                  |

Both loaders return the store's result as data rather than throwing, for the
same reason `app/routes/project.tsx` already does: a thrown response is caught
by the error boundary, which replaces the route subtree and takes the header and
the sign in control down with it.

The home loader calls `listProjects` **unconditionally**, including while signed
out. That is safe and is the only shape that does not duplicate the auth
decision: `withPuter` refuses synchronously with `PuterGateError` when there is
no session, with no network call and no sign in popup, and `store.ts` already
maps that to the `signedOut` failure. There is deliberately no second
`resolveAuthState()` call here, because `app/auth/AGENTS.md` puts that decision
in the root loader and nowhere else.

**Value sourcing**:

| Action                 | Value produced or displayed             | Source                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render a card          | the render image                        | `renders[cardRender(project)].path`, minted through the existing `useStoredUrl`                                                                                                                                                     |
| Render a card          | the floor plan thumbnail                | `floorPlan.path`, minted through the same hook                                                                                                                                                                                      |
| Render a card          | the project name                        | `name`, set at creation by `projectNameFrom(filename)` in `app/render/rules.ts`                                                                                                                                                     |
| Render a card          | the date                                | `createdAt`, formatted by `Intl.DateTimeFormat`                                                                                                                                                                                     |
| Render a card          | the timezone and locale that date is in | the viewer's browser, read by passing `undefined` as the locale. Not stored, not a setting, not a guess                                                                                                                             |
| Render a card          | which render the card shows             | `cardRender`: the first entry of `models` that has a `complete` render, else the first that has any. Total by construction, since `createProject` writes a render entry per requested model, so the `null` branch is defensive only |
| Render a card          | the state word for an unfinished render | `renderView(render, Date.now())` from `app/render/rules.ts`, then the shared `STATE_WORDS` map moved out of `RenderPlate.tsx`. Never the stored status                                                                              |
| Render a card          | whether a render counts as stalled      | `isStaleRender` and `STALE_AFTER_MS`, already in `app/render/rules.ts`. The card computes it at render time, the same way the plate does                                                                                            |
| Render a card          | the busy look                           | `.plate-frame[data-busy="true"]` in `app/app.css` plus `BusyPlan`, both built by spec 0004 and feature 6                                                                                                                            |
| Render a card          | the square itself                       | `.plate-frame`, whose `aspect-ratio: 1 / 1` matches `RENDER_ASPECT_RATIO`                                                                                                                                                           |
| Render a card          | the thumbnail size                      | a new `.plan-chip` class in `app/app.css`. `.plan-key` exists but is sized for the project sheet                                                                                                                                    |
| Render a card          | the look when a mint fails              | an empty `.plate-frame` with one `type-meta` line. No new colour, no new token                                                                                                                                                      |
| Render the grid        | the order                               | `listProjects` already sorts newest first on the id, which carries creation time                                                                                                                                                    |
| Render the grid        | how many cards to show at first         | a constant in this feature: 12 at `/projects`, 3 in the home strip                                                                                                                                                                  |
| Render the grid        | the skipped record sentence             | `ProjectList.unreadable`                                                                                                                                                                                                            |
| Show the Projects link | whether anyone is signed in             | root loader data, through the existing `useAuthState`. Never a fresh Puter call                                                                                                                                                     |
| Show the home strip    | the same fact                           | the same `useAuthState()`, and nowhere else. On disagreement with the loader result, auth wins                                                                                                                                      |
| Show the home strip    | whether to show the skipped record line | `unreadable` above zero with nothing parsed. Then the line replaces the absent strip                                                                                                                                                |

**Key invariants**:

- The gallery never writes. `app/projects/store.ts` stays the single writer, and
  nothing in this feature calls `updateProject`.
- The gallery never starts or resumes a render. `app/render/` stays the only
  place that claims one.
- No minted URL is persisted or put in a loader return value. Every URL is
  minted at render time through `useStoredUrl`, whose cache is module scope and
  is purged on sign out.
- A card that is not rendered mints nothing. Paging is a render cap, not a
  display cap, so the live minted URLs are bounded by the mounted card count,
  not by how many projects exist. Someone pressing `Show more` repeatedly can
  still reach every project in one session; that is accepted, and it is the
  arrival cost that this bounds.
- A mounted card mints the floor plan **always** and the render **only when
  complete**, so a grid of unfinished projects still mints one URL per card.
- One card contains exactly one interactive element: the card itself.

**Security model**:

Every read is the signed in person's own Puter store, scoped by their own
session, so there is no ownership check to write and no way to ask for someone
else's project: a different account listing the same prefix sees their own keys.
`/projects` stays wrapped in the existing `RequireUser`. The loader is allowed
to run while signed out and simply comes back with the store's `signedOut`
failure, which the guard renders as the sign in prompt.

The one real exposure is the minted view URLs, which read a private file with no
authentication. This feature adds no new handling for them: it uses
`useStoredUrl`, so the existing rules hold, including the sign out purge that
`app/root.tsx` mounts above every page. A gallery is the first screen that mints
many at once, which is exactly why the paging cap is an invariant above rather
than a nicety. Note the cap bounds what is alive at once on arrival, not the
total across a long session of pressing `Show more`.

No regulated data is involved. No compliance scope applies.

**Configuration required**:

None. No new environment variable, no new credential.

**Critical test scenarios**:

- Happy path: sign in with several finished projects, land on home, see the
  strip capped at 3 with a working `See all`, follow it to a grid that is newest
  first and opens the right project. Verifies **AC-1**, **AC-2**, **AC-3**,
  **AC-5**, **AC-11**.
- Paging: with more than 12 projects, confirm only 12 cards exist in the DOM on
  arrival, `Show more` adds 12, and the control disappears at the end. Verifies
  **AC-6**.
- Unfinished render: start a render, navigate to `/projects` while it runs,
  confirm the card shows the state word, the square does not collapse, and no
  second render starts. Verifies **AC-4**.
- Failure case: with the network blocked, confirm the grid shows the store's own
  sentence and that the retry actually re reads. Verifies **AC-9**.
- Mint failure: with the render path deleted underneath, confirm the card falls
  back to a placeholder, stays a link, and shows no button. Verifies **AC-12**.
- Auth: visit `/projects` signed out and confirm the sign in prompt at that URL
  with nothing listed, then sign in and confirm both surfaces fill in with no
  manual reload. Verifies **AC-10**, **AC-13**.
- Skipped records: with a version 1 record present, confirm the quiet line
  appears and names the cause in plain words. Verifies **AC-7**.

## Build plan

Ordered as a tracer bullet, per `CLAUDE.md` and scope.md: a thin thread through
the whole feature first, so a real gallery can be walked in a browser before any
of it is thickened.

1. `app/shell/Navbar.tsx`: lift the header out of `ConfiguredApp` in
   `app/root.tsx` into its own component, add the wordmark link and the
   `Projects` link gated on `useAuthState`. The auth control moves across
   unchanged, satisfies **AC-1**
2. `app/gallery/rules.ts`: the pure half. `cardRender` and `formatProjectDate`.
   Move the `STATE_WORDS` map out of `app/render/RenderPlate.tsx` to somewhere
   both the plate and the card import, so the two can never disagree on a word.
   The card reads its word through `renderView` from `app/render/rules.ts`, not
   from the stored status, satisfies **AC-3**, **AC-4**
3. `app/gallery/ProjectCard.tsx` plus the `.plan-chip` class in `app/app.css`:
   one card. The `.plate-frame` square, the `data-busy` treatment with `BusyPlan`
   when the render is still working, the plan thumbnail on the meta line, the
   name, the date, the empty frame plus one `type-meta` line on a failed mint,
   and the whole thing as one link, satisfies **AC-3**, **AC-4**, **AC-5**,
   **AC-12**
4. `app/routes/projects.tsx`: the `clientLoader` calling `listProjects`, the
   grid inside the existing `RequireUser`, the empty state, and the failure
   sentence with its retry through `useRevalidator`. This is the thread end to
   end and the first point the feature is walkable, satisfies **AC-2**,
   **AC-8**, **AC-9**, **AC-10**, **AC-13**, **AC-14**
5. `app/gallery/ProjectGrid.tsx`: the 12 cap and `Show more`, extracted from
   task 4's grid once it works, so the cap is one component both surfaces get,
   satisfies **AC-6**
6. The unreadable line under the grid, and the all unreadable case where it
   sits with the empty state, satisfies **AC-7**, **AC-8**
7. The home strip in `app/routes/home.tsx`: its own `clientLoader` calling
   `listProjects` unconditionally, the same `ProjectGrid` capped at 3, the
   `See all` link, visibility driven by `useAuthState()`, absent when signed out
   or empty, and showing AC-7's line when it is empty only because everything
   was unreadable, satisfies **AC-7**, **AC-11**
8. Walk [verify.md](verify.md) against a real dev server and a real browser, per
   `CLAUDE.md`'s rule that there is no test runner here

## Consequences

**Positive**:

- The app finally has a frame. Every screen has a way back, which the project
  page has never had.
- `ProjectCard` is the component feature 8 and feature 9 both need. The
  comparison view and the community feed each get a card shape rather than
  inventing one, and feature 9's `FeedEntry` carries the same four fields a card
  reads.
- Nothing is persisted, so this feature cannot corrupt a record. It is the first
  feature since 0001 with no write path at all, which makes it cheap to get
  wrong and cheap to fix.
- The paging cap puts a real bound on how many private view URLs exist on
  arrival, which no screen has had until now. It does not bound a long session
  of pressing `Show more`, and the spec says so rather than implying otherwise.

**Negative or tradeoffs**:

- Two surfaces show the same cards, so a change to a card is a change in two
  places to look at, even sharing one component.
- `Show more` state is component state and resets on navigation. Someone who
  expands to 36 cards, opens a project and comes back is at 12 again. Real, and
  accepted for now rather than pushed into the URL.
- Cards do not update while a render runs. A person watching a card for a
  finished image will wait forever without navigating. The state word says
  `Working`, which is honest, but it is not self correcting.
- `listProjects` reads every project record in full, with values, just to show
  four fields per card. Fine at tens of projects and quietly heavy at thousands,
  and the store has no lighter projection to ask for.
- Lifting the header out of `root.tsx` touches the one file every screen
  depends on, for a feature that is otherwise additive.

**Neutral**:

- A new `app/gallery/` area, and a new `app/shell/` for the navbar, both per
  `CLAUDE.md`'s folder by feature rule.
- `STATE_WORDS` moves out of `app/render/RenderPlate.tsx`. That is a real edit to
  a file feature 6 owns, and it is the right move rather than a second copy.
- `Intl.DateTimeFormat` enters the codebase for the first time.

## Follow-up

- [ ] Delete and rename were considered and deliberately left out of this
      feature. When delete is designed it owes a decision this spec does not
      make: whether the hosted floor plan and render files in Puter storage are
      deleted with the record or left orphaned.
- [ ] The `Show more` count resetting on navigation is accepted here. If it
      becomes annoying in real use, the fix is a search param, not component
      state, so the browser back button restores it.
- [ ] Reading whole records to show four fields is fine now and is the first
      thing to revisit if a gallery ever feels slow. A lighter list projection
      would be a change to `app/projects/store.ts`, not to this feature.
- [ ] `CLAUDE.md` requires the `frontend-design` plugin to actually be invoked
      before any screen here is written. If it does not fire on its own during
      `/develop`, invoke it directly rather than proceeding.
- [ ] Features 5 and 6 are built but not verified. See the premise note in
      [rationale.md](rationale.md); this gallery is the screen that will show any
      defect in their write path across every card at once.
- [ ] `Show more` has no cap beyond the project count, so a very large gallery
      can still mint a URL per project across one session. Acceptable now. If it
      ever matters, the fix is unmounting cards that scroll far out of view, not
      a smaller page size.
- [ ] The `react-router-framework-mode` skill is referenced in the root
      `CLAUDE.md` but there is no `app/shell/AGENTS.md` or `app/gallery/AGENTS.md`
      yet. `/sync` should record both areas once this is built.
