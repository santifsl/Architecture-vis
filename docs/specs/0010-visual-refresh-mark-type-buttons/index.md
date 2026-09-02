# 0010. The AV mark, a display typeface, and real buttons

**Date**: 2026-09-01
**Status**: In Progress

## Summary

The app gets its identity: a drawn AV mark in place of the plain word in the
navbar, Chakra Petch (a squared display typeface from Google Fonts, under the
open font licence) on everything except running prose, the new hero copy, a
real button for signing out as well as signing in, and tighter spacing on the
four screens that already exist. Nothing about the look decided in spec 0004
changes: same six colours, same one accent, still flat with no shadow, no
gradient and no pill. What changes is the type, the mark, the words, and the
rhythm. The one structural addition to the design system is a seventh type
role, `type-label`, which is what buttons and navigation links take so that
running prose can stay on Inter while every other piece of text moves to the
new face.

Product naming moves to AV across the whole app and the documents. The Puter
worker and app identity stay `architecture-vis-roomify`, deliberately, and the
spec says why.

## Requirements

**User stories**:

- As a visitor landing on the home screen, I want the page to say plainly what
  this product does and to look like somebody designed it, so that I trust it
  with a drawing before I have signed in.
- As a signed out visitor, I want one obvious way in, so that I never have to
  work out whether I need to sign in or sign up first.
- As a signed in person, I want signing out to look and behave like every other
  control in the app, so that I am not hunting for a piece of text.
- As anyone reading a screen, I want one typographic system, so that a heading,
  a button and a date look like they belong to the same product.

**Acceptance criteria**:

- **AC-1**: Every surface that names the product reads `AV`, never `Roomify`:
  the navbar mark, the document title on all three routes, the meta
  description, `BootScreen`, `ConfigScreen`, `SignInPrompt`'s sentence,
  `UnreadableNote`, the gallery empty state, and the "saved by a newer version"
  message in `app/projects/store.ts`. A case insensitive search for `roomify`
  across `app/` returns nothing, identifiers included (`RoomifyUser` becomes
  `AvUser`, `toRoomifyUser` becomes `toAvUser`).
- **AC-2**: The Puter worker and app identity stay `architecture-vis-roomify`.
  `scripts/deploy-worker.mjs`, `worker/roomify.js` and the remote path keep
  their names, and a comment in the deploy script records that the name is a
  global Puter reservation rather than a product name, so a later reader does
  not finish the rename by hand. `VITE_PUTER_WORKER_URL` is unchanged and no
  redeploy is required by this feature.
- **AC-3**: The navbar mark is a `Logo` component with a fixed box, 28px tall
  and width auto capped at 96px, set in `app/app.css`. Replacing its contents
  with the final vector art changes no other element's position. It carries the
  accessible name `AV` and is the link home. The navigation landmark around it
  is labelled `Main`, not the product name. _Amended during the build: the art
  arrived as a monochrome raster rather than a vector, so it is painted as a CSS
  mask in `currentColor` rather than placed as an inline SVG; the mark is
  followed by the wordmark `AV` in `type-label`, which is now the link's
  accessible name in place of the `aria-label`; the box's width cap is 128px
  rather than 96px to hold both; and the header is sticky. See `## Amendments`,
  1 and 4._
- **AC-4**: Chakra Petch is loaded at weights 500 and 600 only, roman only, in
  the same single Google Fonts request that already loads Inter, with
  `display=swap` and both existing preconnect links kept.
- **AC-5**: A seventh type role, `type-label`, exists as an `@utility` in
  `app/app.css`, at the body role's size and line height with weight 500 and
  tracking `0.01em`. Chakra Petch is carried by `type-display`, `type-title`,
  `type-heading`, `type-label` and `type-meta`. Inter is carried by
  `type-body`. `type-code` is unchanged on the mono stack.
- **AC-6**: `.btn-accent`, `.btn-quiet`, `.btn-outline` and `.nav-link` take
  their size, weight, tracking and family from `type-label` rather than
  restating the body role's metrics. `.notice`, which shares the current
  metrics selector with the two button classes, is split out of it and keeps
  the body role: a notice is prose, not a control.
- **AC-7**: The tracking and weight of the Chakra Petch roles are retuned for
  the new face. Every role's `font-size` and the nine step spacing ladder are
  unchanged, so no screen reflows because of a size change.
- **AC-8**: `.btn-outline` exists and defines all six states from spec 0004
  (rest, hover, active, focus visible, disabled, busy) with the same geometry
  as `.btn-accent`: a hairline border and ink text at rest, taking clay on
  hover, active and focus. It introduces no new colour, shadow or radius.
- **AC-9**: The signed out navbar shows exactly one button, labelled
  `Sign in with Puter`, styled `.btn-accent`. There is no separate sign up
  control anywhere.
- **AC-10**: The signed in navbar shows the username followed by a
  `.btn-outline` button labelled `Sign out`. Both auth controls keep the
  `aria-busy` and `aria-disabled` pattern with the handler guard, so neither
  can fire twice, and neither uses the real `disabled` attribute.
- **AC-11**: The hero shows the headline and subhead written out in
  `## Feature design`, verbatim, and the home route's meta description follows
  the subhead's first sentence. The
  headline is `type-display` capped at `max-w-2xl`; the subhead is `type-body`
  in soft ink capped at `max-w-prose`. ~~Both sit on the page's single left
  edge~~, and the gaps between headline, subhead and the upload card each move
  up one ladder step. _Amended during the build: the hero block and its text are
  centred, on this screen only. See `## Amendments`, 2._
- **AC-12**: The navbar aligns its two clusters on the centre line rather than
  the baseline, and its vertical padding moves up one ladder step. No third
  zone, no centred navigation, no new links.
- **AC-13**: `/projects` opens with a masthead: the `type-display` heading, a
  `type-meta` count line beneath it reading `N PROJECTS` (and `1 PROJECT` when
  there is one), and a hairline rule closing the block before the grid.
- **AC-14**: Inside a gallery card, the name sits closer to its frame than the
  date sits to the name, so each card reads as one image with a caption rather
  than three evenly spaced lines.
- **AC-15**: The project page changes by type and spacing only. No new label,
  caption or title block element is added, and the comparison view built in
  spec 0009 is not touched.
- **AC-16**: The accessibility baseline holds on every changed screen: the
  contrast script passes unchanged, every interactive element still shows the
  offset clay focus ring, the whole navbar is reachable and operable by
  keyboard, and the mark exposes its name to assistive technology.
- **AC-17**: No drop shadow, gradient, glow, pill, second hue or status colour
  is introduced anywhere, _with one named exception: `.plan-card`, the floor
  plan drop target, which takes a shadow and a clay wash badge. See
  `## Amendments`, 3._ The ESLint design rules still fail a planted violation of
  each kind, and their messages name seven type roles rather than six.
- **AC-18**: `npm run verify` passes: typecheck, lint, the contrast script, and
  a real build.

## Decision

**Chosen option**: Option 1: extend the existing system in place.

Keep spec 0004's token system and amend it, adding one type role, one button
variant and one family axis, rather than restyling screens directly or
starting a second visual layer beside it.

**Implementation skills**: `frontend-design`
(`anthropics/frontend-design`, `.claude/skills/frontend-design/`) ·
`react-router-framework-mode` (`remix-run/agent-skills`,
`.agents/skills/react-router-framework-mode/`)

## Feature design

### The type system after this change

| Role           | Family       | Used by                                                   |
| -------------- | ------------ | --------------------------------------------------------- |
| `type-display` | Chakra Petch | the hero headline, the gallery masthead, a project's name |
| `type-title`   | Chakra Petch | the project route's own headings                          |
| `type-heading` | Chakra Petch | section headings, card names                              |
| `type-label`   | Chakra Petch | buttons and navigation links (new)                        |
| `type-meta`    | Chakra Petch | tracked caps: dates, counts, file notes                   |
| `type-body`    | Inter        | running prose only                                        |
| `type-code`    | mono         | paths, variable names, stack traces                       |

Two new theme tokens carry the split: `--font-display` holds the Chakra Petch
stack, `--font-sans` keeps Inter. Neither is reachable from a `className`; a
screen still names a role and nothing else.

`type-label` takes the body role's current size (`0.875rem`) and line height
(`1.55`), so no control changes size. Its own two values are decided here:
weight **500** and tracking **`0.01em`**. A squared face at control size wants a
hair of positive tracking rather than the body role's zero, and 600 would put
every button in competition with the headline.

`app/app.css` today declares those four metrics once for three classes at once,
in a single `.btn-accent, .btn-quiet, .notice` selector. That selector is
**split**: the two button classes and `.nav-link` take `type-label`, and
`.notice` keeps the body role's metrics, because a notice is a sentence of
prose rather than a control. Missing this split is how the error notice would
silently end up set in the display face.

**Retuning** (AC-7): Chakra Petch has squared counters that close up under the
negative tracking Inter wanted. Pull `--type-display-tracking` back from
`-0.03em` toward zero, ease `--type-title-tracking` and
`--type-heading-tracking` the same way, and re pick each Chakra Petch role's
weight from the two that ship: 600 where a role is carrying the page
(`type-display`, `type-title`), 500 elsewhere. `--type-meta-tracking` stays
open at `0.06em`; that role was always meant to be tracked wide and the new
face suits it.

No `font-size` moves, so no token changes a line's height. That is not the same
as nothing reflowing: Chakra Petch's glyph widths differ from Inter's at an
identical size, so a control label or a heading can wrap at a width where it
did not before. The narrow viewport pass in build step 10 is what catches it.

### The hero copy

Decided by the engineer, and the exact strings the build writes into
`app/routes/home.tsx`:

> **Headline**: From blueprint to built space, instantly, with AI.
>
> **Subhead**: AV is an AI-first design environment that turns any 2D floor
> plan into a photorealistic 3D render, seen straight from above, with your
> walls exactly where you drew them. Upload a plan, and let AV do the rest.

The subhead is written here with a comma where the engineer's draft used a
dash, which is the house style for prose in this project's documents. If the
dash is wanted on screen it is a one character change at the call site, and it
is the engineer's call, not the build's.

The `meta` description on the home route follows the subhead's first sentence
rather than staying at the current one, so the browser tab, the search result
and the page all say the same thing.

### The button matrix after this change

| Class          | Border                   | Text at rest | Role                                            |
| -------------- | ------------------------ | ------------ | ----------------------------------------------- |
| `.btn-accent`  | hairline clay            | clay         | the one call to action on a screen              |
| `.btn-outline` | hairline hairline colour | ink          | a real button that is not the main action (new) |
| `.btn-quiet`   | none                     | ink          | an inline action inside prose or a card         |

`.btn-outline` shares `.btn-accent`'s padding, radius, geometry and busy sweep
exactly, so the two sit side by side without a visible mismatch. It differs
only in which colour its border and label take at rest. Its hover, active and
focus states take clay, which keeps the accent rule intact: clay still appears
only where somebody is interacting.

`.btn-quiet` survives untouched. It is still right for the retry action inside
the gallery's failure state and the upload card's retry, both of which sit
inside prose rather than in a control row.

### The mark

A `Logo` component in `app/shell/`, rendering an inline SVG inside a fixed box
sized in `app/app.css`. The box is **28px tall, width auto, capped at 96px**,
which matches the optical height of the wordmark it replaces, so the navbar's
left edge does not move when the real art arrives. Until the vector art exists
the box renders the letters `AV` set in `type-display`, in ink. The box, not
the artwork, determines the navbar's left edge, so dropping in the final mark
is a one file change with no layout consequence. The component carries the
accessible name in either state.

The navigation landmark around it is relabelled from `aria-label="Roomify"` to
`aria-label="Main"`. A landmark should name the region rather than repeat the
brand, and once `Logo` is a named link the old label was announcing the product
name twice.

The reference image is an open dependency, listed in Follow up. Nothing else in
this feature waits on it.

### Value sourcing

| Surface           | Value shown                                | Source                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navbar mark       | the accessible name `AV`                   | a literal in `Logo`, not derived from the route or a title                                                                                                                                                                                     |
| Navbar, signed in | the username                               | `useAuthState()`, the root loader's auth fact, unchanged                                                                                                                                                                                       |
| Gallery masthead  | the count in `N PROJECTS`                  | `loaderData.value.projects.length`, the readable records only. Unreadable records are deliberately excluded, because `UnreadableNote` already states that number in its own sentence and counting them twice would make the two lines disagree |
| Gallery masthead  | singular or plural                         | derived from that same count, `1 PROJECT` at exactly one                                                                                                                                                                                       |
| Gallery masthead  | the block when the read failed or is empty | not rendered. The count line appears only on the branch that renders the grid, so there is no `0 PROJECTS` state competing with the existing empty state sentence                                                                              |
| Hero              | headline and subhead                       | literals in `app/routes/home.tsx`, written out verbatim in `## Feature design` above                                                                                                                                                           |
| Home route        | the meta description                       | the subhead's first sentence, not a third piece of copy                                                                                                                                                                                        |
| Navbar            | the navigation landmark's label            | the literal `Main`. It describes the region, and no longer the product                                                                                                                                                                         |
| `type-label`      | weight and tracking                        | decided here: 500 and `0.01em`. Not inherited from the body role, which is 400 and zero                                                                                                                                                        |
| `Logo`            | the box's height and width                 | decided here: 28px tall, width auto capped at 96px. Not derived from the artwork, which does not exist yet                                                                                                                                     |
| Every screen      | the product name                           | a literal per surface. There is no shared name constant, and adding one is not in scope: nine literals in prose read better than nine interpolations                                                                                           |
| Fonts             | the Chakra Petch faces                     | the existing Google Fonts stylesheet request in `app/root.tsx`                                                                                                                                                                                 |

### Key invariants

- Clay appears only on something being interacted with. `.btn-outline` at rest
  is ink, which is exactly why it exists.
- No screen states a family, size, weight, tracking, colour or radius in a
  `className`. Adding `type-label` widens the closed set to seven; it does not
  open it.
- The Puter worker name is a global reservation, not a product name. It does
  not follow the rename.
- Every interactive control defines all six states from spec 0004. A new
  variant is not exempt.

### Configuration required

None. No new environment variable, and `VITE_PUTER_WORKER_URL` is unchanged.

### Critical test scenarios

- Signed out, the navbar shows one `Sign in with Puter` button; pressing it
  raises Puter's popup, and completing it as a brand new account works from the
  same button, verifies **AC-9**.
- Signed in, `Sign out` is a bordered button; keyboard tab reaches the mark,
  the `Projects` link and the button in that order, each showing the clay ring,
  verifies **AC-10**, **AC-12**, **AC-16**.
- A double press on a busy auth button fires the action once, verifies
  **AC-10**.
- `/projects` with several projects shows `N PROJECTS`; with exactly one shows
  `1 PROJECT`; with none shows the existing empty state and no count line,
  verifies **AC-13**.
- A planted `text-lg`, a planted `font-bold` and a planted `shadow-md` each
  fail lint with a message naming seven roles, verifies **AC-17**.
- `grep -ri roomify app/` returns nothing; the same search in `scripts/` and
  `worker/` still returns the worker identity, verifies **AC-1**, **AC-2**.
- The app renders correctly with the font request blocked in devtools, proving
  the fallback stack carries the layout, verifies **AC-4**.
- At a narrow viewport, no button label, navigation link or heading wraps where
  it did not before the face changed, and the `Sign out` button in particular
  stays on one line beside the username, verifies **AC-7**, **AC-16**.
- The error notice under a failed sign in is still set in Inter at body size,
  proving the shared metrics selector was split rather than moved wholesale,
  verifies **AC-6**.

## Build plan

No build approach is recorded for this project, in `CLAUDE.md` or in
`scope.md`. The order below assumes the sensible default for a change like
this: the shared layer first, because every surface depends on it, then one
surface at a time, each independently reviewable and shippable.

1. The type layer in `app/app.css`: `--font-display`, the Chakra Petch stack,
   the `type-label` role and its `@utility`, the family on the five display
   roles, and the retuned tracking and weights. The font request in
   `app/root.tsx` gains Chakra Petch at 500 and 600 in the same URL, satisfies
   **AC-4**, **AC-5**, **AC-7**
2. `.btn-outline` in `app/app.css` with all six states, the shared metrics
   selector split so `.notice` keeps the body role, and the two button classes
   plus `.nav-link` moved onto `type-label`. Prove the busy sweep, the disabled
   rule and the reduced motion block cover the new class, since all three are
   written as selector lists naming the existing classes by hand and a new
   variant joins none of them by itself, satisfies **AC-6**, **AC-8**
3. The ESLint messages updated from six roles to seven, and the design rules re
   proven against a planted violation of each kind. Watch the trap feature 4
   already paid for: `no-restricted-syntax` replaces rather than merges across
   config objects, so the SDK import guard and the design rules must stay
   composed explicitly, satisfies **AC-17**
4. The `Logo` component and its box, with the letter placeholder, satisfies
   **AC-3**
5. The navbar: the mark in place of the word, the landmark relabelled `Main`,
   `Sign in with Puter` on `.btn-accent`, `Sign out` on `.btn-outline`, centre
   alignment and the padding step, satisfies **AC-3**, **AC-9**, **AC-10**,
   **AC-12**
6. The rename across `app/`: prose on six surfaces, the three document titles
   and the meta description, and the `RoomifyUser` and `toRoomifyUser`
   identifiers. The deploy script and worker keep their names and gain the
   comment saying why, satisfies **AC-1**, **AC-2**
7. The home screen: the new headline and subhead, the measures, and the two
   widened gaps, satisfies **AC-11**
8. The gallery: the masthead block with its count line and rule, and the card
   rhythm inside `ProjectCard`, satisfies **AC-13**, **AC-14**
9. The project page: the type inherited from step 1 plus wider gaps between the
   title block, the key and the plates. Nothing added, nothing in the
   comparison view touched, satisfies **AC-15**
10. `npm run verify`, then the browser walk: every screen at a narrow and a wide
    viewport with an eye specifically on wrapping, since the new face's glyph
    widths differ from Inter's at the same size and a control label or heading
    can break where it previously did not; then the keyboard pass, and the
    blocked font check, satisfies **AC-16**, **AC-18**

## Amendments

Three changes made during the build, at the engineer's direction, each reversing
or narrowing something written above. They are recorded here rather than left in
a conversation, because all three are the kind of thing a later reader would
otherwise take for drift.

### 1. The mark is a CSS mask, not an inline SVG

`## The mark` assumed the art would arrive as a vector. It arrived as
`assets/AV_logo_nobackground.png`, a 1024px square PNG, genuinely transparent,
carrying a monochrome near-black drawing inside 46% empty padding.

Placed as an `<img>`, that file brings its own near-black into the navbar, which
is an off-system colour in the one place the product signs its name, and it
cannot answer the hover the link around it already has. So the build cropped it
to its own edges, threw the colour channels away, and kept the coverage:
`app/shell/av-mark.png`, 553 by 469, referenced by `.logo-art` as a mask and
painted in `currentColor`. The mark is therefore ink from the palette, it takes
clay on hover with the rest of the link, and the palette stays closed.

`assets/` keeps the source art. It is not a second `public/`: nothing serves it
and nothing imports it, it is where the drawing came from. See `## Follow-up`.

### 4. The mark gained its wordmark, and the header sticks

Two later additions, taken the same way and recorded here rather than lost with
the conversation.

The drawn monogram alone is a shape before it is two letters, for a product
nobody has heard of yet, so `AV` is spelled out beside it in `type-label`, the
role the navigation already sets its own text in. Being inside the link, it
inherits ink and the hover clay exactly as the mark does. It is also now the
link's accessible name, and the `aria-label` is gone: visible text naming its own
link cannot drift out of step with what is on screen. The box's width cap moved
from 96px to 128px to hold both, which is still a cap with room to spare, and
`.logo` gained a 0.5rem gap.

The header is `sticky top-0` with `z-10` and an explicit `bg-bone`. The
background is the load bearing part: a sticky header with a transparent
background lets the page scroll through it and its hairline stops reading as an
edge. The `z-10` puts it over the plate overlays, which position inside their own
frames and make no stacking claim of their own.

### 2. The hero is centred, on the home screen only

AC-11 put the headline and subhead on the page's single left edge, which is what
the rest of the app does. On a wide display that reads badly: a short headline
and two sentences, left anchored inside a centred column, leave the right half of
a 2560px screen empty while the eye still starts hard left.

So on the home screen the hero block and the text inside it are both centred: the
headline, the subhead and the upload card. Nothing else moved. The recent strip
directly beneath it keeps the left edge, and so do the gallery masthead and the
project sheet, because a grid and a drawing sheet have a real left edge to line
up against and a landing hero does not. This is a one screen exception, not a new
rule, and the left edge remains what every other screen is built on.

### 3. The named exception to the flat rule: `.plan-card`

Spec 0004 made the look flat, and it stays flat: no shadow, no gradient, no glow,
no pill, on every card, plate, frame and surface in the app. `.plan-card`, the
floor plan drop target on the home screen, is the single exception, taken
deliberately and scoped to that one class.

It earns it by being the only element in the app a person is asked to drop a file
onto. A flat rectangle on a flat page does not read as a target, and the card was
reading as empty. It gets three things:

- **A shadow**, two layers, both mixed from `--color-ink` rather than from a grey
  of their own: a tight contact shadow that seats the card, and a wide soft one
  that lifts it. The lift closes while a file is dragged over the card, so the
  card reads as accepting it.
- **A circular badge behind the upload mark**, filled with clay at 10% mixed over
  the surface tone. This is the one place clay appears on something you do not
  operate, which is a real dent in spec 0004's accent rule and is why it is
  written down here. 10% is where `--color-ink-soft` still clears 4.54:1 on the
  resulting ground, the text minimum, on a surface that only ever holds an icon.
  The wash is mixed from the token at use, so retuning the accent retunes it too,
  and no seventh colour enters `@theme`.
- **More room**: the card's padding, the gap under the badge and the gap above
  the button each move up, so the hierarchy reads badge, heading, file note,
  button rather than four things floating in one box.

The exception cannot spread by copy and paste: the ESLint rule that fails a
planted `shadow-md` in a `className` is unchanged, and both the shadow and the
wash exist only inside `.plan-card` and `.plan-badge` in `app/app.css`. Any
second use of either is a new decision, not a precedent this one set.

## Migration plan

**Strategy**: in place, phased, no data migration.

**Phases**: the ten steps above, in order. Steps 1 to 3 are the shared layer
and land together. Steps 4 to 9 are each one surface and can land separately.

**Rollback**: revert the commit. Nothing here writes to Puter storage, the key
value store or the worker, so there is no state to unwind and no deploy to
coordinate.

**Risks**:

- The Puter worker name is one careless find and replace away from being
  renamed. App and worker names are global across all of Puter, the current
  name is a held reservation, and renaming it would produce a new
  `.puter.work` URL, a required redeploy from a verified account, and a stale
  `VITE_PUTER_WORKER_URL` in the Vercel project. AC-2 and the comment in the
  deploy script exist for exactly this.
- The busy sweep, the disabled state and the reduced motion block are written
  as selector lists naming `.btn-accent` and `.btn-quiet` by hand. A new
  variant joins none of them automatically, and a missed one is invisible until
  somebody watches a slow sign out.
- A second font family is a second chance at a flash of unstyled text. The
  fallback stack has to be a real one, and the blocked font check in step 10 is
  what proves it.

## Consequences

**Positive**:

- One typeface decision replaces the ambient default. A heading, a button and a
  date now visibly belong to the same product, which is the thing the current
  screens are missing.
- Signing in and signing out finally look like the same kind of thing, and
  `.btn-outline` gives every future screen a real button that is not the call
  to action, which the matrix did not have.
- The rename removes a genuine ambiguity: the hero copy and the navbar
  currently name two different products.
- The mark arriving behind a component boundary means the vector art is a one
  file swap rather than a layout pass.

**Negative / tradeoffs**:

- The closed type set grows from six roles to seven, and roles now carry a
  family as well as metrics. That is one more thing to hold in mind, and spec
  0004's own prose, the ESLint messages and `docs/coding-standards.md` all say
  "six" today and become wrong the moment step 1 lands.
- A second web font is real bytes and a real second failure mode on a slow
  connection, in return for identity rather than function.
- The rename touches roughly a dozen files for no behavioural gain, and it puts
  the deployed worker's name permanently out of step with the product's name.
  Anybody reading the deploy script for the first time will pause.
- `.btn-outline` and `.btn-quiet` now sit close enough together that a future
  screen has a genuine judgment call to make about which one an action wants.

**Neutral**:

- No data, no storage keys and no worker behaviour change. `PROJECT_KEY_PREFIX`
  is `project:` and carries no product name, so nothing already saved is
  affected by the rename.
- This spec amends spec 0004 rather than superseding it. The palette, the
  ladder, the six state matrix, the busy treatment and the enforcement approach
  all stand exactly as written.
- Dark mode stays out of scope, as decided in spec 0004.
- The marketing surfaces (pricing, a community navigation item) stay out of
  scope by the engineer's explicit instruction, to be revisited once feature 9
  exists.

## Follow-up

- [x] The AV reference image has not reached the build yet. Attach it, vectorize
      it, and swap it into `Logo` in place of the letter placeholder. Until then
      the placeholder ships, and it is the only part of this feature that is not
      finished. _Closed: the art arrived as `assets/AV_logo_nobackground.png` and
      ships as the mask `app/shell/av-mark.png`. It is still a raster, so a real
      vector would still be an improvement, and it would be a change to that one
      file._
- [ ] `assets/` is a new top level folder holding the source artwork, and this
      project already has `public/` for static files. Nothing serves `assets/`
      and nothing imports it, so the two do not actually collide, but the
      distinction is worth one line in root `AGENTS.md` on the next `/sync`:
      `public/` is served, `assets/` is where drawings come from, and shipped
      derivatives live beside the code that uses them.
- [ ] Spec 0004 says the type system has six roles and no family axis. Add a
      note there pointing at this spec, so a reader of 0004 alone is not
      working from a stale count.
- [ ] `docs/coding-standards.md` records the design system rules split into
      Enforced and Judgment. The seventh role and the third button variant
      belong in both halves.
- [ ] Confirm the Chakra Petch open font licence file is satisfied by the
      Google Fonts hosted delivery, which it normally is, before any later move
      to self hosting.
- [ ] The `frontend-design` plugin is required by `CLAUDE.md` for any UI work
      but is not named in root `AGENTS.md` or `CLAUDE.md`'s agent skills list
      with a path. Record it where the other skills are recorded.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
