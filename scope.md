# Scope: Roomify

Upload a 2D floor plan, pick Claude, Gemini, or both, and get back a
photorealistic 3D render of the space. Every upload and render gets permanent
hosting with a real public URL, every project persists in a personal gallery,
and a project can be made public to sit in a shared community feed. Over
time that feed becomes the place anyone can browse to see what the tool
actually produces.

Build it in a thin, working slice first, one floor plan actually reaching a
model and coming back as a hosted render, before making any single part of
it fuller. Then thicken it piece by piece. Before building anything, decide
what you're doing and why in a few plain sentences, then build it, and if
the plan turns out wrong once it's actually built, say so and fix the plan
too, not just the code.

Whenever a "build it" style step actually gets underway, break it into its
own short list of what's genuinely being done, and check each part off as
it's finished, right in this file. That way this file can be opened fresh, in
a brand new conversation, and it's obvious what's already done and what's
still left, without anyone re-explaining the feature from scratch.

## Stack

Already decided, nothing open here: React 19, React Router v8 in framework
mode (the `@react-router/dev` Vite plugin, `app/routes.ts` route config, route
modules with generated `./+types/*` types), running as a **static SPA**
(`ssr: false`), Vite, TypeScript, TailwindCSS v4.

No traditional backend: Puter is the entire server-side surface, auth,
permanent file storage, a key-value database, serverless workers, and hosted
AI models, all called from the client through the Puter.js SDK. Claude and
Gemini are both wired in as render options, called through the same worker
rather than two separate integrations.

## Deployment

Static SPA on Vercel. Not SSR, and that follows directly from the stack
above rather than being a separate preference.

Puter.js is a client-only SDK. Auth holds a session in the browser, `puter.fs`
and `puter.kv` are called from the browser against Puter's own servers, and
the render worker is invoked from the browser too. There is no data a server
of ours could fetch that the client can't fetch itself, no secret to keep off
the client (Puter meters the model calls against the signed-in user, not
against a key we hold), and no request a Node process would add anything to.
Running a server would mean paying for a hop that does nothing but forward.

What that means concretely:

- `react-router.config.ts` sets `ssr: false`. React Router still renders the
  root route **at build time** into `build/client/index.html`, so
  `@react-router/node` stays a dependency and every route must remain
  SSR-safe: no `window`, `document`, or `puter.*` during the initial render.
  Puter has to be reached from an effect or an event handler, never at module
  scope or in a render body. This is the one real constraint the SPA choice
  puts on feature code.
- `build/client/` is the deployed artifact. A `build/server/` directory is
  still emitted as a build-time byproduct of that root-route render; it is
  not deployed and nothing runs it.
- Only `clientLoader` and `clientAction` are available. A server `loader` in
  any route other than root is not supported in SPA mode.
- `vercel.json` rewrites every path to `/index.html`. Without it, any URL
  other than `/` 404s on a hard refresh once there is more than one route.
- There is no `npm run start` and no Dockerfile. There is no server to start.

Reversible if it ever needs to be: flipping `ssr` back to `true` restores
server rendering without changing any UI, which is exactly why this is a
cheap decision to make now.

## At a glance

| #   | Feature                                              | Phase      | Status      |
| --- | ----------------------------------------------------- | ---------- | ----------- |
| 1   | Connecting to Puter                                  | Foundation | done        |
| 2   | Coding standards & tooling                           | Foundation | not started |
| 3   | Data model                                           | Foundation | done        |
| 4   | Design & look                                        | Foundation | not started |
| 5   | Upload & host a floor plan                           | Slice 1    | not started |
| 6   | Create a project & generate the 3D render            | Slice 1    | not started |
| 7   | App shell & project gallery                          | Slice 2    | not started |
| 8   | Side-by-side comparison view                         | Slice 3    | not started |
| 9   | Public/private visibility & the community feed       | Slice 4    | not started |
| 10  | Export                                               | Slice 4    | not started |

## Foundation

### 1. Connecting to Puter · done

The Vite project itself gets created manually first, `npm create vite@latest`,
fast and simple, no reason to spend agent time or tokens on something that
easy.

The real decision here is how the app authenticates a user through
`puter.auth`, and how the rest of the app treats "signed in" as a fact it can
trust everywhere, the navbar, the gallery, the create-project flow, without
re-checking it in five different places. Decide that shape once, then wire
`puter.fs`, `puter.kv`, and `puter.workers` into the project alongside it,
since all four are really one connection to the same platform.

**Spec: [0001](docs/specs/0001-puter-auth-and-platform-access/index.md).** Decided: sign
in only from a deliberate click, the user resolved once at boot from Puter's own
non-interactive cached check (`puter.whoamiCache_`, never `getUser()`, which
raises a login popup on an expired token), held in root `clientLoader` data and
revalidated on sign in and sign out. SDK via the `@heyputer/puter.js` npm package
for its real types. No temporary accounts.

- [x] Decide the approach
- [x] Write the spec
- [x] Build it: `/develop` feature 1
  - [x] Platform access module, the single SDK import, and the non-interactive
        boot check, satisfies AC-1, AC-9, AC-10
  - [x] Root route wired with sign in and sign out working end to end. **This is
        the review point**, the thin thread should genuinely run here before
        anything below is built, satisfies AC-2, AC-3, AC-4. Confirmed in a
        real browser before the PR merged: signed-out load, sign in, signed-in
        reload, and the corrupted-token reload, which settled to signed out
        with no Puter popup. The thread genuinely runs
  - [x] Popup failures, the session-ended banner, and the route guard, satisfies
        AC-5, AC-6, AC-7. Built on branch `feature/auth-failures-and-guard`.
        Typecheck and a real build pass, and all seven manual cases were walked
        in a real browser on 2026-08-26 and passed. Two of them (a blocked popup,
        and Puter ending a live session) have no interface that can produce them,
        so `verify.md` records the console recipes that drive the real SDK path
        for each. A cold reload holding a dead token deliberately shows no
        banner: AC-6 is about a session ending mid-use, and the SDK's boot event
        fires before anything is listening anyway
  - [x] Environment validation with a readable boot screen, plus the check that
        only the access module imports the SDK, satisfies AC-8, AC-11. Built on
        branch `feature/env-validation-and-import-guard`. `app/platform/env.ts`
        checks configuration and `app/platform/ConfigScreen.tsx` is the screen a
        missing `VITE_PUTER_WORKER_URL` produces; it replaces the whole app
        rather than sitting inside it, since with no worker URL there is no app
        to sit inside. The import rule landed as `scripts/check-sdk-import.mjs`
        (`npm run check:imports`) instead of a bare grep, and was proven against
        a planted violation rather than only against a clean tree
  - [x] Typecheck, real build, and the manual browser walkthrough, satisfies
        AC-9 except for lint. Typecheck and a real build pass, with the variable set
        and unset, and no Puter call runs during the build-time root render. All
        four configuration-screen steps were walked in a real browser on
        2026-08-27 and passed
  - [ ] Lint, the remaining part of AC-9. Not done here and cannot be: feature 2
        is what installs it, and its ESLint `no-restricted-imports` task is what
        finally replaces `npm run check:imports`
- [ ] Verify it: `/check verify` feature 1
      _Skipped deliberately. The manual walkthrough in `verify.md` is this
      project's verification (CLAUDE.md rules out a test runner and browser
      automation), and all four milestone-4 cases plus the earlier milestones
      were walked by hand and passed. Five checks stay unticked in `verify.md`,
      each with its reason: the offline boot case, two AC-3/AC-4 steps not
      re-walked since milestone 2, the `/projects` hard-refresh that needs a
      real Vercel deployment rather than the dev server, and AC-10, which has
      no call site to verify until feature 5 makes the first storage call._

Code: `app/platform/puter.ts` is the only module importing the SDK (`withPuter`,
the non-interactive `readCurrentUser`, sign in and sign out, and the two event
subscriptions). `app/auth/` holds `AuthState`, `resolveAuthState` and
`requireUser` (`state.ts`), the two deliberate actions (`actions.ts`), the
one-shot session-ended flag (`sessionEnded.ts`), the shared hooks (`useSignIn`,
`useAuthState`, `useAuthEvents`), and the chrome (`AuthControl.tsx`,
`SessionBanner.tsx`, `SignInPrompt.tsx`, `RequireUser.tsx`, `AuthNotice.tsx`,
`BootScreen.tsx`). `app/platform/env.ts` checks the required environment
variables and `app/platform/ConfigScreen.tsx` is what a missing one renders;
`scripts/check-sdk-import.mjs` (`npm run check:imports`) is what holds the
single-import rule until feature 2 installs the lint rule. The root
`clientLoader`, `HydrateFallback`, and the event subscription live in
`app/root.tsx`; `app/routes/projects.tsx` is the first
guarded route, a placeholder feature 7 fills in. The palette tokens and the
shared button, banner, notice, and boot-rule treatments are in `app/app.css`.

No `/test` box on this feature: CLAUDE.md rules out a test runner and browser
automation for this project, so verification is the manual walkthrough in
[the spec's verify checklist](docs/specs/0001-puter-auth-and-platform-access/verify.md).
That file is the running record of what has actually been walked in a browser and
what has not, milestone by milestone.

Also from spec 0001: write a project-local `.agents/skills/puter/` skill
mirroring the bundled `react-router` one. No usable Puter skill exists in the
registry (the one candidate was reviewed and declined; it teaches the CDN global
this project rejects). The installed package's own source and generated types are
the only accurate reference.

### 2. Coding standards & tooling

Write down the real conventions for this project once it actually exists,
then install linting, formatting, and a pre-commit hook that actually
enforces them. See `docs/coding-standards.md` for the long version, already
written ahead of the tooling it describes.

- [ ] Decide the approach
- [ ] Install lint, format, and whatever else is needed, and write it up in
      `docs/coding-standards.md`
- [ ] From spec 0001: an ESLint `no-restricted-imports` rule allowing
      `@heyputer/puter.js` only in the platform access module. Feature 1's AC-11
      rests on a grep until this exists, and the rule is what stops a stray SDK
      import quietly reintroducing an unbidden login popup.

### 3. Data model · done

There's no relational database here, Puter's KV store is the only
persistence layer, so the "data model" is really the shape of the keys and
values everything else depends on: a project record (owner, name, the
floor-plan file URL, the render URL or URLs if both models ran, which
model(s) were used, a status per model, public or private, timestamps), and
however the community feed actually finds public projects without scanning
every key a user has ever written. That lookup shape is worth deciding
carefully now, since it's the one part of a KV store that doesn't come for
free the way a relational query would.

**Spec: [0002](docs/specs/0002-project-records-and-public-feed-index/index.md).**
The constraint spec 0001 raised is settled. `puter.kv` really is scoped per user
per app, and `puter.fs.share` only reaches a named Puter account, so an anonymous
visitor has no credential to read anybody's records and the community feed cannot
be a KV lookup performed as the visitor. Two anonymous channels carry this. `*.puter.site`
static hosting was verified against the installed SDK and by real
unauthenticated requests. Worker endpoints were checked against the installed
SDK only, whose handler separates `user.puter` (the caller, only when a session
was sent) from `me.puter` (the worker owner's own store); no worker is deployed
yet, so that half is not confirmed by a real unauthenticated request and is
verified with feature 9. Decided: a project lives in its owner's own KV and that copy is the
truth; publishing sends only the project id to the worker, which re reads the
project through `user.puter`, copies its images into one app owned hosted
directory, and writes a small entry into a chunked feed index in `me.puter`;
anonymous visitors read that index and single public projects over plain HTTP.
Publishing needs at least one complete render. The public half of this belongs to
feature 9; feature 3 builds the record shape the rest of the app writes to.

- [x] Decide the approach
- [x] Write the spec
- [x] Build it: `/develop` feature 3, code in `app/projects/`
  - [x] The record types and key builders: `Project`, `RenderState`, `ModelId`,
        `PublicAssets`, `FeedEntry`, all `readonly`, plus the time sortable id
        generator, satisfies AC-2
  - [x] The owner side store module over `withPuter`: create, read, list by
        prefix, update, delete, with a plain failure message on the way out,
        satisfies AC-1, AC-14. Delete fails closed: a public project is refused
        until it is unpublished, and a record that no longer parses is refused
        too, since its visibility is unknown and deleting it could strand a feed
        entry and its hosted copies. Two different sentences, because they need
        two different fixes
  - [x] The invariant checks the store module calls (`renders` matches `models`,
        `publishedAt` agrees with `visibility`, name length, value size before a
        write), satisfies AC-11, AC-13
- [x] Verify it: `/check verify` feature 3, steps in
      [verify.md](docs/specs/0002-project-records-and-public-feed-index/verify.md)
      _The public half of this spec (AC-3 to AC-10, AC-12) cannot be verified
      here. It needs a deployed worker and the hosted subdomain, so those
      criteria are verified with feature 9, not now._

### 4. Design & look

A near-monochrome, gallery-quality palette: bone/ivory backgrounds
(`#FAF8F4` background, `#EFEBE3` surfaces), near-black warm ink for text
(`#1C1B19` primary, `#8A8478` secondary), a barely-visible hairline border
(`#E3DED3`), and exactly one accent, a deep burnt-clay orange (`#B5551F`),
used only for things you interact with, buttons, links, the upload/generate
call to action, focus states, nothing else.

A generation-in-progress state is the same accent color at roughly 55%
opacity rather than a second hue, the accent quietly recedes while working
instead of competing with a different color. An error is the same primary
ink color plus a thin accent-outlined icon with no fill, no red, no alert
box, errors here read as understated, not urgent. There is no dedicated
color for public versus private, that's a fact about a project, not a status
that needs alarm-style signaling, it's shown with a label or an open/closed
icon in the existing text colors.

Because the palette is this quiet on purpose, the uploaded floor plan and
the AI-rendered image are the only genuinely saturated things on any screen,
that's deliberate, not an oversight to fix later.

#### Structural reference for the home screen

Adapted from the real Roomify tutorial project, not copied from it.

The real project's home screen: navbar, then a hero section with a
pill-shaped announcement badge (pulsing dot + text), a headline, a subtitle,
two CTAs side by side (a text link and an outlined "Watch Demo" button), and
an upload card sitting directly under the hero with a decorative
grid-pattern background behind it. Below that, a "Projects" section: a grid
of cards, each showing an image, a "Community" badge, the project name, and
a clock-icon-plus-date-plus-author meta line.

Our version keeps the good structural bones and cuts the generic-SaaS
decoration that doesn't fit the palette's restraint:

- **No pill badge with a pulsing dot**, in the navbar or the hero. That's a
  startup-launch decoration that fights the near-monochrome, gallery-quality
  restraint already decided above.
- **One CTA in the hero, not two.** The upload card sitting right there in
  the hero already is the demo; a separate "Watch Demo" button is a
  marketing-site reflex this product doesn't need.
- **The upload card keeps its icon, heading, file-type note, and drop
  zone**, but no decorative grid-pattern background behind it. A plain
  hairline border (`#E3DED3`), consistent with every other surface in the
  app, replaces it.
- **The projects grid keeps the card-grid shape** (image, name, date) but
  drops the "Community" badge from every card. That word is reserved for the
  actual public community feed (feature 9); a personal gallery showing your
  own private projects should never imply they're already shared. The meta
  line under each card shows something specific to Roomify instead of a
  generic clock-and-author line: which model rendered it (Claude, Gemini, or
  both), or a small before/after thumbnail pair.

This section governs feature 5 (Upload) and feature 7 (App shell & gallery)
the way the sketches governed LLM Arena's arena screen, leaderboard, and
models page: it's structure only. Nothing here overrides the palette,
typography, or accent rules already decided above.

- [ ] Decide the approach
- [ ] Build it

## Slice 1: Core render loop

### 5. Upload & host a floor plan

A user uploads a 2D floor plan image. It's written to permanent storage
through `puter.fs`, which returns a real public URL, that URL is what
everything downstream (the worker, the KV record, the comparison view) 
actually points at, never a local blob URL that dies when the tab closes.

The upload card's layout is governed by feature 4's structural reference for
the home screen: icon, heading, file-type note, drop zone, hairline border,
no grid-pattern background.

- [ ] Decide the approach
- [ ] Build it

### 6. Create a project & generate the 3D render

The heart of the product. A project is created once a floor plan is hosted,
and generation kicks off against whichever model(s) were selected, Claude,
Gemini, or both, through a Puter serverless worker rather than calling a
model directly from the browser. Each model's render, if both are running,
proceeds and fails independently, exactly like Roomify's own two-model
option implies, one being slow or erroring never blocks or corrupts the
other. The project's KV record tracks a status per model (pending, complete,
failed) so the gallery can show real progress rather than a single spinner
that hides which one is actually done.

- [ ] Decide the approach
- [ ] Build it

## Slice 2: App shell & gallery

### 7. App shell & project gallery

The frame everything else sits inside: a navbar, and a personal gallery of a
signed-in user's own past projects, each card showing its floor plan
thumbnail, its render (or its in-progress state) and which model(s) it used.
This is what makes the tool feel like a real workspace across visits, not
just a single one-off generation.

The navbar and the card grid are governed by feature 4's structural
reference for the home screen: no pill badge, no per-card "Community" badge,
and a meta line naming the model(s) rather than a generic clock-and-author
line.

- [ ] Decide the approach
- [ ] Build it

## Slice 3: Comparison

### 8. Side-by-side comparison view

An interactive view, a slider or toggle, between the original floor plan and
its AI-rendered counterpart. This is the one place besides buttons/links
that the accent color is allowed to appear on, since the slider itself is an
interactive element, the images on either side never get their own tinted
frame or border, they carry the visual distinction on their own.

- [ ] Decide the approach
- [ ] Build it

## Slice 4: Sharing & export

### 9. Public/private visibility & the community feed

A project owner can flip a project public or private at any time. Public
projects show up in a global community feed anyone can browse, without
needing an account, that's what actually makes the feed work as discovery.
Only creating a project and toggling its visibility need sign-in. The
owner's own view is identical to what anyone else sees, plus the ability to
actually edit or regenerate.

**Spec: [0002](docs/specs/0002-project-records-and-public-feed-index/index.md).**
The approach is already decided there, alongside feature 3's record shape, since
the two could not be settled apart: an anonymous visitor holds no credential, so
the feed is served by the worker out of a store only the worker can write, and
public images are copied into one app owned `*.puter.site` directory. What is
left here is the public half of that spec's build plan, **tasks 4 to 11**, which
the feature 3 pass deliberately left untouched because they have nothing to run
against until a real worker is deployed: the hosted subdomain and its worker
constant, the two anonymous `GET` routes, the fenced lock helper, `POST /publish`
and `POST /unpublish`, the republish-on-mutation path with its "public copy is
out of date" state, and the two public SPA routes. AC-3 to AC-10 and AC-12 are
verified here too, for the same reason.

- [x] Decide the approach
- [ ] Build it: tasks 4 to 11 of spec 0002's build plan
- [ ] Verify it: AC-3 to AC-10 and AC-12, deferred here from feature 3

### 10. Export

A way to download a generated render at full resolution for use outside the
app, a presentation, a portfolio, a client deck. Straightforward once the
render already has a permanent public URL from feature 5's storage approach.

- [ ] Decide the approach
- [ ] Build it

## Not doing right now

Kept here so the plan stays honest about what's deliberately left out.

- Any render style or model beyond Claude and Gemini.
- Commenting, liking, or any social feature on the community feed beyond
  browsing public projects.
- An admin or moderation page for public content.
- A public API for the community feed.
- Multiple floor plans per project, or re-uploading a corrected plan into an
  existing project.
- Privacy policy and terms pages.
- Analytics or session-replay tooling. Nobody's asked for this yet.
