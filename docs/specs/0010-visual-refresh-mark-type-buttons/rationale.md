# 0010 rationale: the AV mark, a display typeface, and real buttons

The decision, the requirements and the build plan are in
[index.md](index.md). This file is the reasoning behind them.

## Context

> ⚠️ Premise note: the brief describes this as tightening what is already
> built, and most of it is. One item is not. Renaming the product from Roomify
> to AV is a change of a different kind, and it has one trap that a visual
> refresh would not normally carry: `scripts/deploy-worker.mjs` names the
> deployed Puter worker and app `architecture-vis-roomify`, and Puter's app and
> worker names are global across every account rather than per account. The
> current name is a reservation this project holds. A find and replace that
> reaches that file produces a new `.puter.work` URL, needs a redeploy from a
> verified Puter account, and leaves `VITE_PUTER_WORKER_URL` in the Vercel
> project pointing at nothing, which is an outage rather than a styling
> regression. The right framing is that the rename is a presentation rename:
> everything a person reads becomes AV, and the platform identity stays where
> it is. AC-2 and the risk list carry that.

Four screens exist and they work. The navbar, the home and upload screen, the
gallery and the project page all sit on spec 0004's token system, which settled
colour, spacing, the six type roles and the six states every control must
define. What 0004 never settled was which typeface the roles are set in. It
named `--font-sans` as Inter once and moved on, so the product's whole
typographic identity is the default that came with the Vite template. Every
screen is correct and none of them is distinctive.

Three smaller gaps sit alongside it. The navbar's brand is the literal word
`Roomify` in a heading role, which is a placeholder that never got replaced.
The signed out navbar renders a real button for signing in while the signed in
navbar renders `.btn-quiet`, which reads as text, so the two halves of the same
control disagree about what kind of thing they are. And the hero copy is a
first draft that names neither the product's positioning nor, now, the same
product name the new copy uses.

The forces that shaped the answer: the design system is deliberately closed and
enforced by ESLint on every `className`, so nothing here can be done by adding
classes to a screen; there is no test runner or browser automation by project
rule, so every claim has to be checkable by a command or by a person in a real
browser; and the flat, single accent, no shadow language is a decision the
engineer restated explicitly rather than an accident to improve upon.

## Options considered

### Option 1: extend the existing system in place

Amend spec 0004's system: add one type role, one button variant, one family
axis on the roles, retune the tracking the new face needs, and let every screen
inherit the change through the classes it already uses.

**Pros**:

- Most of the visual change lands in `app/app.css` and reaches all four screens
  at once, because the screens already name roles rather than values.
- The ESLint enforcement, the contrast script and the six state matrix keep
  working unchanged; a new variant is checked by the machinery that already
  exists.
- One system to read afterwards, not two.

**Cons**:

- Widens the closed set, and a closed set that grows once can grow again. Seven
  roles is more to hold than six.
- Makes spec 0004's own prose and the ESLint messages wrong the moment it
  lands, so three documents have to be corrected alongside the code.

### Option 2: style the screens directly

Leave the token layer alone and put the new type and the new button treatment
on the screens that need them.

**Pros**:

- No amendment to spec 0004, no new role to name, no ESLint message to update.
- Each screen can be changed and reviewed with no risk to the others.

**Cons**:

- Impossible as written. The ESLint design rules fail a commit containing a
  family, size, weight or tracking in a `className`, which is precisely the
  mechanism that would have to be used. Doing it anyway means switching off the
  rules that feature 4 built and proved.
- Reintroduces exactly the habit 0004 exists to stop, where every screen re
  decides its own type.

### Option 3: a second visual layer beside the current one

Introduce a parallel set of brand level classes for the refreshed surfaces and
migrate screens onto it over time.

**Pros**:

- Lets the refresh land one screen at a time with no shared layer to get right
  first, and an unfinished migration is visible rather than hidden.
- Familiar strangler shape for a risky change.

**Cons**:

- The strangler pattern earns its cost when the old system is load bearing in
  production and cannot be changed safely. Here the old system is a stylesheet
  in a four screen app with no data behind it, so the pattern buys nothing and
  costs a period where two sources of truth for type both exist.
- Guarantees a stretch where two screens look like two products, which is the
  problem this feature is trying to solve.

## Rationale

Option 1 follows from the enforcement described in Context. The design rules
make a `className` incapable of carrying a family, a size, a weight or
tracking, so the only place a typeface can be introduced is the token layer,
and that settles the shape of the change before taste enters it. Option 2 is
not a slower path to the same place; it is a path that requires disabling
feature 4's rules.

The seventh role is the part worth defending, because a smaller change was
available. Setting Chakra Petch as `--font-sans` and giving `type-body` an
Inter opt out would have been two lines and no new role. It was rejected for
the reason 0004 exists: it makes the display face the inherited default, so
every new piece of text is Chakra Petch until somebody remembers otherwise, and
the one thing that must not be Chakra Petch, running prose, becomes the
exception nobody remembers. Naming the roles explicitly costs one more role and
makes the wrong outcome unreachable rather than merely discouraged.

`type-label` is a real role rather than a convenience because three component
classes currently copy the body role's four metric declarations by hand.
Buttons and navigation labels were already a distinct role in everything but
name; they were borrowing one because there was nothing else to borrow. Naming
it removes the copy and makes "buttons use the display face, prose does not"
expressible in the system instead of as a comment.

On the button variant, the engineer asked whether sign out should match sign in
exactly. It should not, and the reason is the accent rule from `scope.md`'s
design feature rather than a preference about weight. Clay marks the thing you
are interacting with. If sign out took `.btn-accent`, the only clay on a signed
in navbar would be the exit, which points the product's single accent at the
least important action available. `.btn-outline` gives sign out a button's
shape and a button's affordance without a button's emphasis, and it takes clay
on hover and focus, so the accent still appears the instant somebody reaches
for it. The cost, honestly, is that `.btn-outline` and `.btn-quiet` now sit
close enough together that a future screen has a judgment call between them.
That is written into Consequences rather than pretended away.

On the one button question, Puter's own current documentation settles it rather
than a preference: `puter.auth` publishes `signIn`, `signOut`, `isSignedIn`,
`getUser` and the usage methods, and no `signUp`. `signIn` opens one popup that
covers an existing account and a new one, and even takes
`attempt_temp_user_creation` for instant onboarding. Two navbar buttons would
be two labels for one call. The label `Sign in with Puter` names the account
system on the control itself, which matters here because the popup lands on
`puter.com` and a person who did not expect that reads it as a redirect
somewhere unexpected. `SignInPrompt` already uses that longer label, so this
also makes the app's two sign in surfaces agree.

On the navbar feeling sparse, the bet in AC-12 is that it does not need a
structural answer. It has two clusters and it reads thin today because the left
one is a word set at heading size and the right one is a name beside a piece of
text. A drawn mark and a bordered button change what is in the clusters, not
how many there are. Adding a third zone or a centred link would import a
marketing navigation shape the engineer explicitly ruled out for this pass,
and would do it to solve a problem that the mark may well have already solved.
If it still reads thin once the real vector art is in, that is a smaller
question to reopen than a layout to undo.

The project page taking spacing only is the engineer's call and it is the right
one on risk. The comparison view from spec 0009 is the newest thing in the app,
merged days ago, and labelling the key and the plates would have put new
elements directly beside it. Type and rhythm reach that page anyway through
step 1.

## Evidence gathered

**The rename surface.** A case insensitive search for `roomify` across the code
tree, excluding `docs/`, returns matches in: `app/shell/Navbar.tsx` (the
wordmark and the navigation landmark's label), `app/auth/SignInPrompt.tsx`,
`app/auth/BootScreen.tsx`, `app/platform/ConfigScreen.tsx` (a heading and two
sentences), `app/gallery/UnreadableNote.tsx` (two strings), `app/projects/store.ts`
(one message), `app/routes/home.tsx`, `app/routes/projects.tsx` and
`app/routes/project.tsx` (the three document titles), `app/platform/puter.ts`
and `app/auth/state.ts` and `app/auth/RequireUser.tsx` (the `RoomifyUser` type
and `toRoomifyUser`), `app/app.css` (two comments), `eslint.config.js` (one rule
message), and `scripts/deploy-worker.mjs` plus `worker/roomify.js` (the
platform identity, which stays).

**The persisted keys are safe.** `PROJECT_KEY_PREFIX` in
`app/projects/record.ts` is `project:`. No stored key, and no storage path,
carries the product name, so nothing already saved by anybody is affected.

**The button matrix today.** `app/app.css` defines `.btn-accent` (outlined
clay, so the accent is already restrained rather than filled) and `.btn-quiet`
(no border, ink, underlines on hover). There is no neutral bordered variant,
which is why the sign out answer needed a new class rather than an existing
one. Both classes, plus `.notice`, copy the body role's four metric
declarations, which is the duplication `type-label` removes.

**The enforcement surface.** `eslint.config.js` blocks, inside any `className`:
raw colour values, arbitrary colour values, stock Tailwind colour families,
stock text sizes, named font weights, `tracking-` and `leading-`, arbitrary
type values, `rounded`, and off ladder spacing. Three of those messages
enumerate the roles as six. The file also carries feature 4's hard won note
that `no-restricted-syntax` replaces rather than merges across config objects,
which is why the SDK import guard and the design rules are composed explicitly.

**The Puter worker identity.** `scripts/deploy-worker.mjs` sets both
`WORKER_NAME` and `APP_NAME` to `architecture-vis-roomify`, with a comment
recording that the bare name `roomify` is held by another Puter account.
`worker/AGENTS.md` states that app and worker names are global across all of
Puter and that a worker is served at `https://<worker-name>.puter.work`.

## References

**Project sources**

- `docs/specs/0004-design-system-tokens-and-states/index.md`: the closed token
  system, the six type roles, the nine step ladder and the six state matrix
  that this spec amends rather than replaces.
- `scope.md`, feature 4: the palette, the single accent rule, the busy state as
  clay at reduced opacity, and the no status colour rule.
- `docs/specs/0008-app-shell-and-project-gallery/index.md` and
  `docs/specs/0009-side-by-side-comparison-view/index.md`: the surfaces this
  refresh touches and the one it deliberately leaves alone.
- `docs/specs/0001-puter-auth-and-platform-access/index.md`: the auth control's
  single flight guard and the `aria-busy` over `disabled` decision that the new
  button variant has to keep.
- `worker/AGENTS.md` and `scripts/deploy-worker.mjs`: the global Puter app and
  worker namespace, and the held name.
- `CLAUDE.md`: the accessibility baseline on every screen, the rule that
  repeated classes become a component, and the requirement that the
  `frontend-design` plugin is actually invoked for UI work.

**Practices and standards**

- Puter's current Auth documentation for the published `puter.auth` methods:
  `signIn`, `signOut`, `isSignedIn`, `getUser`, and no `signUp`. Checked during
  this design conversation rather than recalled, per `CLAUDE.md`'s rule that
  Puter's own current docs are the reference.
- Google Fonts as the delivery for Chakra Petch, which ships under the SIL Open
  Font Licence 1.1. Static family, weights 300 to 700 roman plus italics; this
  spec loads 500 and 600 roman only.
- WCAG 2.1 contrast at 4.5:1 for text, which `scripts/check-contrast.mjs`
  already measures against both surface tones on every run of `npm run verify`.
- Loading a web font with `display=swap` and a real fallback stack, so a
  blocked or slow font request degrades to a readable page rather than an
  invisible one.

## Three build time amendments, and why they were taken

Recorded after the fact, during `/develop`, at the engineer's direction. The
decisions themselves are in `index.md`'s `## Amendments`; what follows is the
reasoning that would otherwise be lost with the conversation.

**The mark as a mask.** The choice was between placing the PNG as an image and
painting it as a mask. An image is the obvious answer and it is the wrong one
here for a reason specific to this design system: the drawing is a near black
that is not `--color-ink`, and the whole apparatus of this project, the closed
palette, the ESLint rules, `check-contrast.mjs`, exists to stop exactly that
colour appearing on a screen. A mask keeps the shape and drops the colour, so
the mark is painted from the palette like everything else and answers the hover
the link already had. The cost is real and worth stating: a mask cannot carry a
second colour, so if the mark ever becomes two toned this decision has to be
reopened. It also depends on `mask` in CSS, which is why the rule carries the
`-webkit-` form beside the standard one.

**Centring one screen.** The objection to this is that a design system with one
exception per screen is not a system. The answer is that the left edge was never
load bearing for a landing hero: it is load bearing for a grid of cards and for
a drawing sheet, where a real column of content lines up against it and a ragged
start would read as a mistake. A hero is two paragraphs and a card, and on a
2560px display, left anchored inside a centred column, it puts everything in the
left half of the screen and leaves the right half empty. The exception is
recorded, scoped to one screen and named, which is the difference between an
exception and drift.

**Denting the flat rule, and the accent rule, on purpose.** This is the change
that costs the most, so it is worth being blunt about what it costs. Spec 0004
made two promises: nothing is raised off the page, and clay appears only on
something you are operating. The drop target now breaks both, with a shadow and
with a clay wash behind an icon nobody clicks.

It was taken anyway because the card is not decoration, it is the product's one
instruction: put a drawing here. Flat and evenly spaced, it read as an empty
box rather than as a target, which is a functional failure and not a taste
complaint. The alternatives were weighed. A heavier border was rejected as
giving the one screen that is meant to feel like a gallery wall two competing
frames, which is the same objection that killed the inner dashed rectangle when
this card was first built. A filled clay button as the whole card was rejected as
pointing the accent at the surface rather than at the action inside it.

What keeps this from becoming a precedent is that it is scoped to two class
names, both in `app/app.css`, and that the lint rule which fails `shadow-md` in
a `className` was deliberately left in place rather than loosened. A second card
wanting a shadow has to come back here and argue for it.
