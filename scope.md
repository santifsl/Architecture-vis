# Scope: Roomify

Upload a 2D floor plan, press one button, and get back a top-down 3D render
of the space whose walls follow your drawing. Every upload and render gets permanent
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
AI models, all called from the client through the Puter.js SDK. Gemini is the
only render model, called through a Puter worker rather than from the browser.
Claude was a render option until spec 0007 dropped it, and it is not
coming back.

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

| #   | Feature                                        | Phase      | Status      |
| --- | ---------------------------------------------- | ---------- | ----------- |
| 1   | Connecting to Puter                            | Foundation | done        |
| 2   | Coding standards & tooling                     | Foundation | done        |
| 3   | Data model                                     | Foundation | done        |
| 4   | Design & look                                  | Foundation | done        |
| 5   | Upload & host a floor plan                     | Slice 1    | done        |
| 6   | Create a project & generate the 3D render      | Slice 1    | done        |
| 7   | App shell & project gallery                    | Slice 2    | done        |
| 8   | Side-by-side comparison view                   | Slice 3    | done        |
| 9   | Public/private visibility & the community feed | Slice 4    | in-progress |
| 10  | Export                                         | Slice 4    | in-progress |
| 11  | The AV mark, a display typeface & real buttons | Slice 5    | in-progress |

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
        instead of a bare grep, and was proven against a planted violation
        rather than only against a clean tree. Feature 2 has since replaced
        that script with the ESLint rules and deleted it
  - [x] Typecheck, real build, and the manual browser walkthrough, satisfies
        AC-9 except for lint. Typecheck and a real build pass, with the variable set
        and unset, and no Puter call runs during the build-time root render. All
        four configuration-screen steps were walked in a real browser on
        2026-08-27 and passed
  - [x] Lint, the remaining part of AC-9. Closed by feature 2, which installed
        ESLint and brought the tree to zero at `--max-warnings 0`. AC-11 now
        rests on `no-restricted-imports` plus a `no-restricted-syntax` selector
        for the dynamic form, proven against five planted forms, and
        `scripts/check-sdk-import.mjs` is deleted
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
the single-import rule is held by ESLint (`eslint.config.js`), installed by
feature 2. The root
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

### 2. Coding standards & tooling · done

Write down the real conventions for this project once it actually exists,
then install linting, formatting, and a pre-commit hook that actually
enforces them. See `docs/coding-standards.md` for the long version, already
written ahead of the tooling it describes.

**Spec: [0003](docs/specs/0003-lint-format-and-commit-hooks/index.md).** The
conventions were already written; nothing enforced them, so every rule in that
document's Enforced section was held by care rather than by a tool. Decided:
install exactly what the document names, ESLint with typescript-eslint's
`recommendedTypeChecked` plus the four rules it names by hand, `react-hooks`,
`react-refresh` and `jsx-a11y`, Prettier owning all formatting with the Tailwind
class-order plugin pointed at the real `app/app.css`, and Husky plus
`lint-staged` running both over staged files then typechecking the whole
project. One migration pass, the existing tree brought to zero violations rather
than carrying a warning baseline, because at twenty-six files the baseline
machinery costs more than the cleanup it defers. Feature 1's AC-11 moves onto a
`no-restricted-imports` rule paired with a `no-restricted-syntax` selector for
the dynamic `import()` form, and `scripts/check-sdk-import.mjs` is deleted rather
than kept alongside it. No CI: `npm run verify` and the hook are the enforcement.

Three things the spec's config sketch got wrong, all found by running it rather
than by reading it, and all corrected in the code:

- `eslint-plugin-jsx-a11y` still caps its peer range at ESLint 9, and it is the
  only holdout; every other plugin already supports 10. ESLint is pinned to `^9`
  so nothing is force-installed. A one-line bump once the plugin catches up.
- `eslint-plugin-react-hooks` v7 keeps the old eslintrc-format config at
  `configs.recommended`. The flat one is `configs.flat.recommended`.
- esquery delimits its regex with a slash, so the slash inside the package name
  has to be escaped alongside the usual metacharacters, or the selector is a
  parse error at lint time.

One rule needed a decision the spec did not anticipate.
`react-refresh/only-export-components` fires on every React Router route module,
because a route module is required to export `meta`, `links`, `clientLoader`,
`ErrorBoundary` and the rest alongside its component. Rather than switch the
rule off for routes, the config names those exports in `allowExportNames`, which
keeps the rule live for a genuine violation.

- [x] Decide the approach
- [x] Write the spec
- [x] Build it: `/develop` feature 2, tasks 1 to 9 of the spec's build plan
  - [x] Prettier with `prettier-plugin-tailwindcss` pointed at `app/app.css`,
        `.prettierignore`, the `format` and `format:check` scripts, and one
        reformat of the tree committed on its own so it never mixes with a
        behaviour change, satisfies AC-2, AC-9, AC-10
  - [x] ESLint on the type-aware project service with `recommendedTypeChecked`,
        the four named rules, the three plugins, and `eslint-config-prettier`
        last, then the tree brought to zero at `--max-warnings 0`. Expect the
        `no-unsafe-*` family to fire in `app/platform/puter.ts`, where the SDK's
        own declarations type `whoami`, `whoamiCache_` and `on` as `any`; the fix
        there is a narrow typed accessor at that boundary, not a file-wide
        disable, satisfies AC-1, AC-10. The `no-unsafe-*` family never fired:
        `app/platform/puter.ts` already narrows everything the SDK types as
        `any` down to `unknown` at the boundary, so the spec's expectation was
        pessimistic and no accessor was needed
  - [x] The SDK import rule in both forms, proven against a planted static
        import, a planted re-export and a planted dynamic `import()`, and only
        then `scripts/check-sdk-import.mjs` and the `check:imports` and `check`
        scripts deleted, satisfies AC-3, AC-4
  - [x] `npm run verify` chaining typecheck, lint, format check and a real
        build, then Husky and `lint-staged` with `"prepare": "husky"`, proven
        against an auto-fixable violation, a non-fixable one, and a type error
        in an unstaged file, satisfies AC-5, AC-6, AC-7, AC-8
  - [x] `docs/coding-standards.md` corrected and completed: `app/app.css` not
        `app/globals.css`, the real `app/auth`, `app/platform`, `app/projects`
        layout not `features/`, the SDK import rule and the `jsx-a11y` rules
        added to Enforced, and no more future-tense CI. Then feature 1's last
        box below gets ticked, satisfies AC-11, AC-4
- [x] Verify it: the manual walkthrough in
      [verify.md](docs/specs/0003-lint-format-and-commit-hooks/verify.md).
      Real commands and real commits on a scratch branch, same as every other
      feature here; `CLAUDE.md` rules out a test runner. The three steps that
      section flagged as worth an independent pass, the SDK import forms in the
      real `actions.ts` and `store.ts`, the Tailwind scramble in the real
      `AuthControl.tsx`, and `npm run verify` from a fresh clone, were walked by
      hand afterwards by a session that had not written the code, and all three
      passed

Code: `eslint.config.js` is the whole lint configuration, including the SDK
import rule and its per-file override for `app/platform/puter.ts`.
`.prettierrc.json` points the Tailwind class-order plugin at `app/app.css`, and
`.prettierignore` keeps `build/` and `.react-router/` out. `.husky/pre-commit`
runs `lint-staged` then a whole-project typecheck, with the `lint-staged`
globs and every script in `package.json`. `scripts/` is gone.

Every acceptance criterion was proven by running it during the build, not only
by reading the code: the import rule against five planted forms (static,
re-export, dynamic `import()`, type-only, dynamic subpath), `verify` against a
deliberate type error to confirm it stops at the first failure, the hook against
an auto-fixable violation, a non-fixable one and a type error in an unstaged
file, and the hook's self-installation against a genuine fresh clone plus
`npm install`. That record has since been re-walked independently, and
`verify.md` is fully ticked.

One defect surfaced in review after the feature was first called done, and is
fixed: the `lint-staged` globs did not mirror what is actually configured, so
the hook let through staged files that `npm run verify` then rejected. A `.js`
file got Prettier and no ESLint even though `eslint.config.js` lints it, and
`.mts` and `.cts` matched no group at all. The globs now follow one rule, every
extension ESLint is configured for gets ESLint then Prettier, everything else
Prettier parses gets Prettier alone, and `verify.md` carries a step that holds
them to it.

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

### 4. Design & look · done

A near-monochrome, gallery-quality palette: bone/ivory backgrounds
(`#FAF8F4` background, `#EFEBE3` surfaces), near-black warm ink for text
(`#1C1B19` primary, `#6E685E` secondary), a barely-visible hairline border
(`#E3DED3`), and exactly one accent, a deep burnt-clay orange (`#A94D19`),
used only for things you interact with, buttons, links, the upload/generate
call to action, focus states, nothing else.

Two of those values were corrected while spec 0004 was being written, and the
correction is the reason the numbers here no longer match what feature 1 built
against. Secondary ink was `#8A8478` and the accent was `#B5551F`. Measured,
the first clears only 3.50:1 against bone and 3.12:1 against ivory, and the
second clears 4.62:1 against bone but 4.12:1 against ivory, all under the 4.5:1
the accessibility baseline asks for. The second one was already live: a
`.btn-accent` sits inside the ivory session-ended banner, so that label fails on
screen today. The rule that replaces the two values is that every text token
must clear 4.5:1 against **both** surface tones, so no component ever has to
know which background it is on. Nothing else about the palette changes.

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
  generic clock-and-author line: a small before/after thumbnail pair. Naming
  the model was the other half of this idea and spec 0007 removed the point of
  it, there being one model now.

This section governs feature 5 (Upload) and feature 7 (App shell & gallery)
the way the sketches governed LLM Arena's arena screen, leaderboard, and
models page: it's structure only. Nothing here overrides the palette,
typography, or accent rules already decided above.

**Spec: [0004](docs/specs/0004-design-system-tokens-and-states/index.md).** The
palette above was never the missing piece; what was missing was everything
around it. Nothing said which type sizes were allowed, what the spacing rhythm
was, or which states a control had to define, so every screen re-decided all
three and none of it could be checked. Decided: a closed token system, six named
type roles (`type-display`, `type-title`, `type-heading`, `type-body`,
`type-meta`, `type-code`) built as Tailwind v4 `@utility` classes, a nine-step
spacing ladder on the stock base, tokens for radius, border width and motion,
and a six-state matrix (rest, hover, active, focus-visible, disabled, loading)
that every interactive control must define. `type-meta` is the one real new idea:
annotation type, tracked open and uppercase, set in full ink, which replaces
"small faded grey text" and so removes the habit that produced the contrast
defect in the first place. The busy state is defined here rather than deferred to
feature 6, because generation-in-progress is this app's signature state and
`.boot-rule` already proves the pattern: the label drops to clay at 55% and a
hairline sweeps beneath it, never a spinner and never a second hue. Enforcement
is ESLint rules on `className` that fail the commit, plus a contrast script in
`npm run verify`, plus the manual walkthrough. One migration, the existing nine
files brought onto the system before the rules are switched on, same play as
feature 2. Dark mode is deliberately out of scope.

- [x] Decide the approach
- [x] Build it: `/develop` feature 4, the six tasks of spec 0004's build plan
  - [x] The token layer in `app/app.css`: the two corrected colours, the six type
        roles and their `type-*` utilities, `--radius`, `--border-hairline`,
        `--duration-quick`, `--ease-standard`, and the four component classes
        pointed at the role values instead of their own font sizes. Note the
        roles deliberately avoid the `--text-*` namespace, which Tailwind would
        auto-expand into a second, unblocked `text-<role>` utility, satisfies
        AC-1, AC-2, AC-3, AC-7
  - [x] `scripts/check-contrast.mjs` wired into `npm run verify`, proven by
        reverting each of the two colours in turn and watching it fail with the
        right ratio, not only by watching it pass, satisfies AC-1
  - [x] The six states on `.btn-accent` and `.btn-quiet`, with the busy sweep as
        an `::after` so no call site needs new markup, and the three existing
        auth buttons moved off the real `disabled` attribute onto `aria-busy`
        plus `aria-disabled` **with their handlers guarded**. `aria-disabled`
        does not block a click, so an unguarded handler fires sign-in twice,
        satisfies AC-5, AC-6, AC-7, AC-11
  - [x] Retrofit the nine existing screens onto the system. The judgment calls
        are already made in the spec: `SignInPrompt`'s `h1` becomes
        `type-heading`, both `text-ink-soft` paragraphs become
        `type-body text-ink-soft`, `mt-5` becomes `mt-6`, `ps-5` becomes `ps-4`,
        satisfies AC-3, AC-4, AC-8
  - [x] The ESLint rules, added only once the tree is already clean, then proven
        against a planted violation of each kind rather than only against a clean
        tree. Watch the esquery slash-escaping trap feature 2 already paid for,
        satisfies AC-3, AC-4, AC-8
  - [x] The documents: the design-system rules into `docs/coding-standards.md`
        split Enforced and Judgment, and dark mode into "Not doing right now",
        satisfies AC-9, AC-10
- [x] Verify it: the manual walkthrough in
      [verify.md](docs/specs/0004-design-system-tokens-and-states/verify.md).
      Real commands and a real browser, same as every other feature here. The
      three steps most worth an independent pass are the two contrast reverts and
      the double-fire check on a busy button, since all three prove a guard
      rather than a look. **Closed 2026-08-28 with 31 of 45 steps run and passing
      and 14 waived.** Everything a command can decide was exercised and recorded
      in `verify.md`, including both contrast reverts, all twelve planted lint
      violations, and the guard audit showing no `disabled={` left in any JSX. The
      14 waived steps are the browser walk: the visual states, the keyboard pass,
      the nine screen review, and the double-fire check on a live sign in. They
      were not run, and they stay unticked in `verify.md` rather than being
      claimed. This feature is `done` on the engineer's call, not because the walk
      passed. The double-fire step is the real exposure: `aria-disabled` does not
      block a click, so if the handler guard ever regresses, sign in fires twice
      and nothing on screen looks wrong. `createSingleFlight` is what holds it

**Code**: `app/app.css` (the whole token layer, the six `type-*` utilities, and
the six states on `.btn-accent` and `.btn-quiet`), `scripts/check-contrast.mjs`
plus its `contrast` script in `package.json`, the nine design-system rules in
`eslint.config.js`, and the retrofit across `app/root.tsx`, `app/auth/` and
`app/routes/`.

Two corrections the build made to the plan. First, AC-11's handler guard already
existed: `createSingleFlight` in `app/auth/singleFlight.ts`, built for feature 1,
is read and written synchronously and already drops a second sign-in call, so
moving the three buttons to `aria-disabled` did not need a new guard, only a note
in `useSignIn` recording that the latch is now load bearing rather than belt and
braces. Second, the ESLint composition had a real trap the spec did not name:
`no-restricted-syntax` replaces rather than merges across config objects, so
scoping the design rules to `app/` silently switched off feature 1's SDK
dynamic-import guard in exactly the directory it exists for. The two are composed
explicitly now, and a planted `await import("@heyputer/puter.js")` inside `app/`
was used to prove the guard still fires. Spec 0004's Neutral note about Prettier
class ordering was also backwards and is corrected there.

No `/test` box on this feature, same as features 1 and 3: `CLAUDE.md` rules out a
test runner and browser automation, so verification is the manual walkthrough.

## Slice 1: Core render loop

### 5. Upload & host a floor plan · done

A user uploads a 2D floor plan image. It's written to permanent storage
through `puter.fs`, and what everything downstream (the worker, the KV record,
the comparison view) points at is the **file path**, never a local blob URL
that dies when the tab closes.

The original wording here said `puter.fs` returns a real public URL. Writing
the spec disproved that against the installed SDK: `write` returns no URL at
all, and the only anonymous URL on offer, `getReadURL`, expires, by default in
a day. A permanent anonymous URL comes from `puter.hosting`, which spec 0002
already assigned to feature 9's publish step. So the path is the permanent
identifier, and a short-lived view URL is minted on demand whenever a screen
needs to show the image.

The upload card's layout is governed by feature 4's structural reference for
the home screen: icon, heading, file-type note, drop zone, hairline border,
no grid-pattern background.

**Spec: [0005](docs/specs/0005-upload-and-host-a-floor-plan/index.md).** Decided:
store the path, mint one-hour read URLs on demand and cache the in-flight promise
per path. Feature 5 writes nothing to `puter.kv`; it hands back a `FloorPlan` and
stops, and feature 6 creates the project. Available space is checked with
`fs.space()` before every write, because a quota refusal makes Puter show its own
usage dialog that no app can suppress. The uploading state is spec 0004's busy
hairline driven by real progress. A cross check caught two things worth carrying
here: `parseFloorPlan` in `app/projects/invariants.ts` requires the `url` field at
runtime, so dropping it without changing the parser would make every project
unreadable rather than fail to compile; and Replace must validate the new file
before deleting the old one, or a cancelled picker destroys the plan you had.

- [x] Decide the approach
- [x] Build it: `/develop` feature 5, the eight tasks of spec 0005's build plan
  - [x] Drop `url` from `FloorPlan` in both places that enforce it, the type in
        `app/projects/record.ts` and `parseFloorPlan` in
        `app/projects/invariants.ts`, and record the change in spec 0002. No data
        migration: feature 6 is unbuilt so no record exists yet, satisfies AC-3
  - [x] The pure layer in `app/upload/plan.ts`: allowed types and size, the
        validation decision, the MIME-to-extension map, the filename sanitiser
        and its awkward cases, and the path builder. No I/O, so it is checkable
        by hand, satisfies AC-2, AC-5
  - [x] The storage module over `withPuter`: the `fs.space()` pre-check, `write`
        with progress and abort, an idempotent delete, and `readPlanUrl` over a
        promise cache that goes stale at 50 minutes and purges on delete, plus
        the plain-sentence failure vocabulary, satisfies AC-1, AC-4, AC-6, AC-7,
        AC-10, AC-13
  - [x] The `usePlanUpload` hook and its state machine: the held file across
        sign-in, one `pick` shared by first upload and Replace, busy states inert
        to a second pick, and abort on unmount, satisfies AC-11, AC-16, AC-17
  - [x] The upload card on the home route, to feature 4's structural reference
        and spec 0004's tokens, including the determinate progress hairline, the
        preview from a minted URL, and the keyboard and accessibility pass. Not
        wrapped in `RequireUser`, which would unmount it and discard the held
        file, satisfies AC-8, AC-9, AC-12, AC-14, AC-15
        **Code**: `app/upload/` (`plan.ts` the pure rules, `failures.ts` the sentences,
        `store.ts` the Puter calls and the URL cache, `usePlanUpload.ts` the state
        machine, `PlanUploadCard.tsx` the card), the card's classes in `app/app.css`,
        the hero in `app/routes/home.tsx`, and the `FloorPlan` correction in
        `app/projects/record.ts` and `app/projects/invariants.ts`.

One correction the build made to the spec. AC-17 said to cancel an in-flight
upload through `write`'s `abort` option. That option is a _notification_ fired
after a cancellation completes, typed `(operationId: string) => void`, so it
reports a cancellation and cannot cause one. The real handle is `init`, which is
handed the `XMLHttpRequest` whose `abort` the SDK overrides. TypeScript caught
it; had the types been looser it would have compiled and silently never
cancelled anything. AC-17 now names the right mechanism.

- [x] Verify it: `/check verify` feature 5, the walkthrough in
      [verify.md](docs/specs/0005-upload-and-host-a-floor-plan/verify.md). Two
      steps need a nearly full Puter drive and may have to be waived. The step
      most worth doing properly is cancelling the picker during Replace, since
      that is the one that used to destroy the existing plan
      _Partly walked 2026-08-28, 15 of 50 steps run and passing, 35 left. The
      eight command and code-shape steps ran, and the seven highest-stakes
      runtime steps were walked by hand: the cancelled picker during Replace
      (the destructive one this box called out), the decode-check refusal, the
      abort on unmount, and the four signed-out held-file steps. All passed.
      Staying in-progress rather than closing, because three unrun steps are the
      ones feature 6 builds directly on: the shape of the stored path, the
      preview loading from a minted `token-read` URL rather than a `blob:` one,
      and a first upload on a fresh account, which is where
      `createMissingParents` bites. The other 32 are a fair waive. One step
      cannot be walked as written: the `.tiff` Replace case, because the file
      input's `accept` attribute filters `.tiff` out of the picker before
      validation ever runs._
      **Closed 2026-09-02 with 19 of 59 steps run and passing and 40 waived.**
      Closed on the engineer's call, not because the walk finished. The three
      unrun steps this box was held open for, the shape of the stored path, the
      preview loading from a minted `token-read` URL rather than a `blob:` one,
      and a first upload on a fresh account where `createMissingParents` bites,
      are waived as exercised indirectly rather than as still unknown: features
      6 through 9 are all built directly on that path, and every one of them
      reads it, writes to it, or copies out of it. Feature 6 renders from a
      stored plan and writes its output beside it, feature 7 lists those paths
      in the gallery, feature 8 mints view URLs for them, and feature 9 copies
      the plan and the render out of that directory into public hosting, proven
      live at 62,798 and 1,220,851 bytes. A wrong path shape or a missing parent
      directory would have taken all four of those down, and none of them saw
      it. The `.tiff` Replace case is waived as unwalkable rather than unwalked:
      the file input's `accept` attribute filters `.tiff` out of the picker
      before validation ever runs, so there is no way to press it. The remaining
      36 are the ordinary browser walk. What is genuinely unwalked and worth
      knowing: a first upload on a truly fresh account has still never been seen
      by a person, only inferred from four features standing on it.

No `/test` box, same as features 1, 3 and 4: `CLAUDE.md` rules out a test runner
and browser automation, so verification is the manual walkthrough.

### 6. Create a project & generate the 3D render · done

**Revised on 2026-08-31, read the revision below before this section.** Claude is
gone, the render is one direct call instead of two stages, and the busy state is
the blurred floor plan. Everything from here to that revision describes what was
actually built first and is kept because it explains why the code looks the way it
does, not because it is still the plan.

The heart of the product. A project is created once a floor plan is hosted,
and generation kicks off against whichever model(s) were selected, Claude,
Gemini, or both, through a Puter serverless worker rather than calling a
model directly from the browser. Each model's render, if both are running,
proceeds and fails independently, exactly like Roomify's own two-model
option implies, one being slow or erroring never blocks or corrupts the
other. The project's KV record tracks a status per model (pending, complete,
failed) so the gallery can show real progress rather than a single spinner
that hides which one is actually done.

The wording above assumed both models paint an image. **They don't**, and
writing the spec is what proved it: Puter reaches image generation only through
`puter.ai.txt2img`, an image-model call, and Claude is reachable only through
`puter.ai.chat`. Claude has no image output at all. So a render is two stages,
the selected model reads the plan and writes a scene prompt, then one shared
image model paints that prompt with the plan as its input image. What's compared
is how Claude and Gemini each _read_ a floor plan, both painted with the same
brush so neither is handicapped. That's the honest version of the two-model
promise, and it's the same correction habit feature 5 used on `puter.fs`.

**Spec: [0006](docs/specs/0006-create-a-project-and-render/index.md).** Decided:
both models write the scene, `gpt-image-1-mini` at medium and 16:9 paints both,
inside a **stateless** worker that takes a path and returns a path. The client
alone writes the record, keeping spec 0002's single-writer rule and every
invariant behind one door. One request per model, awaited in parallel with a
120-second timeout each, rather than a polling job: nothing guarantees a
serverless worker keeps running after it responds, so polling would buy a loop
and a second source of truth and still leave the stuck case. The record gains one
field, `prompt` on `RenderState`, which is what makes two different renders
explicable rather than mysterious; no migration, because feature 6 writes the
first record that ever exists. A cross-check on a second model caught the holes
worth naming here: a project could be created and never rendered, a render could
start twice (strict mode, a reload, a second tab), and a timed-out attempt could
come back late and stomp its own retry. All three are closed by three guards,
`singleFlight`, an already-running refusal, and a `startedAt` stamp compared
before every write.

The one real unknown is load-bearing enough to be build task 1: whether a worker
running under its own app identity may write into this app's data directory as
the caller. It's undocumented, everything about storage hangs off it, and a
throwaway `/probe` route answers it for one deploy. The fallback is already
chosen if the answer is no: the worker returns the bytes and the client writes
them, exactly as feature 5 writes a plan.

- [x] Decide the approach
- [x] Build it: `/develop` feature 6, the eleven tasks of spec 0006's build plan,
      ordered as a tracer bullet per CLAUDE.md, one model end to end before
      anything is made fuller
  - [x] Prove the write direction with a throwaway `/probe`, then build
        `worker/roomify.js` and `scripts/deploy-worker.mjs`: the session check,
        the absolute-path and `renders/` guard, the two model stages, and the
        provider-failure-to-code mapping. **Proved: `/probe` answered `200 {"wrote":true}`
        against the deployed worker on a real session, so a worker CAN write into
        the caller's app data directory as the caller. The primary design holds, the
        bytes-back fallback was not needed, and the route has been deleted and the
        worker redeployed without it. Recorded in spec 0006's `rationale.md`.** The deploy script also had to route around
        a real SDK bug: `workers.create` with no app named auto-provisions a
        sandbox app and then reads `owner.uuid` off it, a field the `read` and
        `create` driver methods it uses never return, so every deploy crashed
        before sending anything. It now names a `roomify` app explicitly, which
        takes the string branch and reads only `uid`. The other two failures on the way
        to a first deploy were not SDK bugs but a wrong idea about Puter's
        namespaces, recorded here because the wrong idea is the tempting one: **app
        names and worker names are both global across all of Puter**, not per
        account. A worker is served at `https://<worker-name>.puter.work`, so its
        name is a subdomain, and `roomify` was already held by a stranger in both
        namespaces. What made this hard to see is that `apps.get(name)` goes through
        the `read` driver, which resolves a name across all of Puter and returns no
        `owner` field, so it answered with a real uid for an app this account does
        not own. `apps.list()` is the only call that means "yours": it is the
        `select` driver with `predicate: ['user-can-edit']`, and it correctly never
        listed `roomify`. Trusting `get` as an ownership test got the deploy as far
        as the worker driver, which refused with `Actor cannot mint a token for
another app`. Both names are now project-prefixed,
        `architecture-vis-roomify`, `apps.checkName` confirmed both free, and
        `ensureApp` treats only the listing as proof of ownership and explains the
        conflict rather than retrying it. Deployed and live at
        `https://architecture-vis-roomify.puter.work`; a POST to `/probe` and
        `/render` without a session answers `401 {"errorCode":"signedOut"}`, so both
        routes are really there. The worker also corrects the spec on
        how the plan reaches a model: `ai.chat` has no `puter_path`, it takes a
        URL, a `File`, or a data URI, and `gpt-image-*`'s `input_image` wants
        base64 too, so the worker reads the plan's bytes once as the caller and
        the same data URI feeds both stages. Path in, path out is unchanged. Both `VISION_MODELS` ids are pinned
        and confirmed, `google:google/gemini-2.5-pro` and
        `anthropic:anthropic/claude-opus-4-5`, per spec 0006's Model parity
        rule: same capability tier (Google Pro against Anthropic Opus, never
        Sonnet), both native provider rather than a router, both non-preview,
        nearest generation rather than newest,
        satisfies AC-3, AC-9, AC-11, AC-12, AC-15
  - [x] The record change and the shared plumbing: `prompt` onto `RenderState` in
        **both** `record.ts` and `parseProject`, and the URL-minting cache moved
        out of `app/upload/store.ts` into `app/storage/urls.ts` now two features
        need it, satisfies AC-4, AC-5, AC-7
  - [x] `app/render/`: the pure layer (out paths, name derivation, the ten-minute
        stale rule, the failure sentences) and `store.ts`, the worker call with
        its `AbortController` timeout and a parser that narrows the response
        instead of casting it, satisfies AC-1, AC-2, AC-9, AC-10, AC-13
  - [x] The thin thread: `/project/:id`, its loader, `RequireUser`, and
        `useProjectRenders` starting every `pending` render on mount **with all
        three start guards in place from the first version**, one model proven
        end to end, satisfies AC-1, AC-4, AC-7, AC-14, AC-17, AC-18
  - [x] Both models in parallel, Retry on a failed or stale card, then the picker
        and Generate on the upload card, and the `frontend-design` pass over all
        of it, satisfies AC-2, AC-6, AC-8, AC-16
        **Code**: `worker/roomify.js` and `scripts/deploy-worker.mjs` (the server
        side), `app/render/` (`rules.ts` the pure rules, `failures.ts` the
        sentences, `store.ts` the worker call, `useProjectRenders.ts` the state
        machine and the three start guards, `useGenerate.ts` the picker,
        `RenderPlate.tsx` and `ProjectSheet.tsx` the page), `app/routes/project.tsx`,
        `app/storage/` (`urls.ts` the shared URL cache, `useStoredUrl.ts` its
        React half), `app/ui/Notice.tsx`, the `prompt` field and the `url`
        correction in `app/projects/record.ts` and `app/projects/invariants.ts`,
        the two new concurrency primitives in `app/auth/singleFlight.ts`, and the
        page's classes in `app/app.css`.

Four corrections the build made, all written into spec 0006's new _Corrections
made during the build_ section rather than only into the code. The two worth
knowing without opening it: `checkProject` demanded a `url` on every `complete`
render, inherited from spec 0002, which would have refused **every** render this
feature produces as `invalid` on the very write that finished it, so `url` is now
the hosted public copy feature 9 writes and `complete` requires only a `path`.
And spec 0002's open item about two renders finishing at once, which it
explicitly handed to feature 6, is now answered: every write for one project goes
through a per-project serial queue, so two completions cannot interleave and lose
one model's render. That was AC-2 quietly broken at the record level.

The design pass settled the project page as a drawing sheet rather than a feed of
cards: a title block, the floor plan as a small **key** (it is what you refer back
to, not what you came to look at), then one plate per model. Each plate carries
the scene note the model actually wrote, in the code role, clamped to four lines
and expandable. That note is the page's signature element and it is what makes the
two-model promise honest: the models are compared on how they **read** the plan,
because one shared image model painted both, and the page says so in one line
under the plates rather than letting anyone conclude Claude drew a picture.

- [x] Verify it: `/check verify` feature 6, the walkthrough in
      [verify.md](docs/specs/0006-create-a-project-and-render/verify.md). Two
      steps are worth doing properly whatever else gets waived: the second tab on
      a generating project, and the late answer from a timed-out attempt landing
      after a retry. Both were found by cross-check rather than by design, which
      is exactly why they need a real hand check
      **Closed 2026-09-02 with 0 of 43 steps run and 43 waived.** That number is
      the honest one and it is not a typo: this walkthrough was written and never
      opened. What stands in for it is the revision below, spec 0007, whose own
      walkthrough ran 30 of 49 and which supersedes the parts of 0006 that
      carried the most risk, the two-stage render, the model parity rule and the
      picker. The render loop itself has also been exercised continuously since,
      by every project features 7, 8 and 9 were built and demonstrated against,
      including the two projects sitting in the live community feed right now
      with finished Gemini renders. Closed on the engineer's call. The two steps
      this box named as worth doing properly, the second tab on a generating
      project and the late answer from a timed-out attempt landing after a retry,
      are the same gap the claim-fix box below records, and they stay unwalked

#### Revision, 2026-08-31: one model, one call, a new busy state

Three changes decided after the build above shipped, designed together in
**spec [0007](docs/specs/0007-one-model-and-the-top-down-render/index.md)**,
which supersedes parts of 0006 (AC-2, AC-3, AC-5, AC-6, AC-7, the two-stage
render, the Model parity rule, the `PAINTER` constant) and 0002's `ModelId`.
Everything else in both specs still stands.

**Claude is dropped. Gemini is the only model.** The picker goes with it, so the
upload card ends at one Generate button. `ModelId` becomes a union of one and
`SCHEMA_VERSION` goes to 2, which makes every project record written so far
unreadable, accepted on the understanding that only this machine has ever created
one. The per-model map shape (`models`, `renders`, `renderUrls`) is deliberately
kept rather than collapsed: `invariants.ts` is the file this project has already
been caught by twice, spec 0005 on `FloorPlan.url` and spec 0006 on `checkProject`
demanding a `url`, and rewriting three invariant functions in the same commit that
changes the schema doubles the exposure to exactly that failure for a benefit
that is aesthetic. Feature 9 also gets to build against the `FeedEntry` shape it
was designed for.

**The two-stage render is gone.** It existed so two models could be compared on
how they _read_ a plan, and with one model there is nothing to compare. So does
`prompt` on `RenderState` and the scene note on the page, which were the evidence
for that comparison. One direct call now: `puter.ai.txt2img` against
`google:google/gemini-2.5-flash-image` with the plan as `input_image` and the
tutorial's top-down instruction pinned verbatim. That id was picked by 0006's own
rule (native `google:` prefix, non-preview, nearest generation) applied to the
image model list rather than the chat list, which matters: the chat list carries
no `google:`-prefixed image model at all, only `infron:` and `openrouter:` routed
ones the parity rule excludes. Square output replaces 16:9, and prose turns out to
be the wrong channel for geometry anyway, a paragraph cannot say where a wall is.

**The busy state becomes the plan itself.** While a render works, the plate goes
full sheet width and holds your own floor plan blurred behind a bone scrim
carrying `Generating your 3D render`, and the small key is hidden for exactly that
period so the drawing is never on screen twice. Feature 4's six states are
extended, not replaced: the clay hairline still sweeps under the blur, so the app
keeps one busy signal shared by buttons, the boot rule and the plate, and there is
still no spinner. Contrast is a property of the scrim rather than of whatever
somebody uploaded, computed at 8.13:1 worst case, and it becomes a token
(`--color-scrim-ground`) that `check-contrast.mjs` measures on every `npm run
verify` rather than a number in a comment.

**Feature 8 is unaffected**, contrary to the assumption that started this
revision. It compares the plan against the render, not two models against each
other, so it survives intact and the square top-down output actually makes the
slider easier to build.

- [x] Decide the approach
- [x] Build it: `/develop` feature 6 revision, the seven tasks of spec 0007's
      build plan. Order matters here in a way it usually doesn't: the client must
      stop requiring a `prompt` before the worker stops sending one, or every
      render in between fails while writing its image anyway
  - [x] Record, invariants and the response parser in one commit: schema 2,
        `MODEL_IDS` to `["gemini"]`, `prompt` out of `RenderState`,
        `parseRenderState`, `RenderProduct` and `parseRenderResponse` together,
        satisfies AC-1, AC-4, AC-12. `parseRenderResponse` now ignores an extra
        key rather than refusing one, which is what makes the phase 1 window
        safe: it is reading answers from the OLD worker until the deploy lands
  - [x] The worker: one `txt2img` call on the pinned model and prompt,
        `VISION_MODELS` renamed to `RENDER_MODELS`, then deploy and make one real
        render, which settles whether `ratio` and `quality` are accepted and what
        aspect comes back. Record the answer in `rationale.md`, satisfies AC-2,
        AC-3. The pinned prompt round-trips verbatim, 1723 characters, checked by
        evaluating the template literal rather than by eye. **Deployed and proven
        by a real render: 628x628, top down, walls following the uploaded plan,
        served from a real token-read URL.** The square is a genuine 628x628
        rather than a crop, so `.plate-frame`'s `1 / 1` and the model agree and
        `object-fit: cover` trims nothing. Worth being exact about what that
        does and does not settle: the worker sends **no `ratio` and no
        `quality`**, so the square is this model's own default, not an honoured
        option, and whether it would honour an explicit `ratio` is still untested
        because nothing has sent it one. Neither option is being added back:
        there is nothing observable to gain, and passing an option this model
        might reject turns into a `paintFailed` on every render with nothing in
        the message saying why. Recorded in spec 0007's `rationale.md`
  - [x] The square ratio and the stale prose it leaves: `RENDER_ASPECT_RATIO`,
        and the two comments naming the deleted `PAINTER` that no grep catches,
        satisfies AC-8. The constant and `.plate-frame` now name each other, so
        the two halves of the number are findable from either side
  - [x] The busy state: the blurred plan, the scrim, the message, the ivory
        fallback when the URL mint fails, the `--color-scrim-ground` token, and
        the `TEXT_ONLY_SURFACES` bucket in `check-contrast.mjs` so the contrast
        claim is machine-checked, satisfies AC-5, AC-6, AC-7, AC-9. **The bucket
        needed one correction the spec did not foresee, and it would have failed
        the build as written.** Spec 0007 skipped the ring check on the scrim
        ground because clay measures 2.64:1 there on a pairing that cannot occur,
        and the same argument reaches further than it took it: `ink-soft` measures
        2.61:1 and clay-as-text 2.64:1 on that ground, and neither is ever painted
        there either. Measuring every text token would fail `npm run verify` on
        three impossible pairings rather than one. So the bucket maps a surface to
        the closed set of inks that actually appear on it,
        `{ "scrim-ground": ["ink"] }`, which keeps the guarantee the token was
        created for:
        change `--color-ink` or the scrim's 72% and the build fails instead of a
        person quietly failing to read the message. Measured at **8.14:1**, nine
        pairs, all clear. Written up in spec 0007's `rationale.md` under
        _Corrections made during the build_
  - [x] The reshaped sheet and the picker removal: single full-width plate, key
        only when not working, `useGenerate` and `PlanUploadCard` stripped of the
        toggles, then the `frontend-design` pass and `npm run verify`, satisfies
        AC-5, AC-10, AC-11. Whether the plate is working moved into `rules.ts` as
        `plateView` plus `isWorkingView`, because the plate and the key both
        depend on that one fact and AC-5 is precisely that they agree: written
        twice they could drift and the page would show the plan twice or not at
        all. The `frontend-design` pass settled one thing and deliberately nothing
        more: the overlay line takes the sheet's existing annotation role,
        uppercase and letterspaced, because a note stamped across a drawing while
        the work is in progress is an annotation rather than a headline, and
        reusing the role keeps the closed type set closed. No box, no clay on the
        words, no second line and no percentage. Clay stays interactive-only and
        the busy signal stays the one hairline sweep the whole app shares.
        **Code**: `worker/roomify.js` (one `txt2img` call, `RENDER_MODEL`,
        `RENDER_MODELS`, the pinned `RENDER_PROMPT`), `app/render/`
        (`rules.ts` for the square ratio and the two new view helpers,
        `RenderPlate.tsx` for `BusyPlan` and the plate, `ProjectSheet.tsx` for
        the reshaped sheet, `store.ts` and `useProjectRenders.ts` for the
        promptless response, `useGenerate.ts` stripped to one action),
        `app/upload/PlanUploadCard.tsx` (`GenerateRender` replacing
        `ModelPicker`), `app/projects/record.ts` and `invariants.ts` (schema 2,
        one model id, no `prompt`), `app/app.css` (the three busy layers, the
        square frame, `--color-scrim-ground`, the `.plate-note` and
        `.model-toggle` blocks deleted) and `scripts/check-contrast.mjs`
        (`TEXT_ONLY_SURFACES`)

  - [x] Delete `visionFailed` and `visionRefused` from `failures.ts`, AFTER the
        deploy above. Done in that order, which was the point: while the two
        stage worker was live it could still answer `visionRefused`, and a client
        that had already forgotten the code would have dropped it on the fallback
        and said "the render service sent back something this app couldn't read",
        which is both wrong and less useful than the sentence it replaced. The
        migration ran client, then worker, then this deletion, with no window in
        which a deployed client could meet a code it did not know
- [x] Verify it: `/check verify` feature 6 revision, the walkthrough in
      [verify.md](docs/specs/0007-one-model-and-the-top-down-render/verify.md).
      Two steps are worth doing properly whatever else gets waived: the dark
      floor plan against the overlay text, because the 8.13:1 figure is computed
      rather than observed, and holding the render against the original plan,
      because whether the model actually respects the strict geometry
      requirements is the entire premise of the change and no code review can
      tell you
      **Closed 2026-09-02 with 30 of 49 steps run and passing and 19 waived.**
      Closed on the engineer's call. Of the two steps this box called out, the
      second one has effectively been answered by use rather than by a formal
      pass: every render this project has produced since has been looked at
      beside its plan, and the top-down geometry has held. The first one has not.
      The dark floor plan against the overlay text is still a computed 8.13:1 and
      nobody has put a genuinely dark plan under that text and looked, which is
      the accepted gap here

Seven findings came back from the cross-check on spec 0007 and all seven are
folded in. Two would have broken the build as written, and they're recorded in
that spec's `rationale.md` rather than only here: adding the scrim ground to
`SURFACES` drags the clay focus-ring check onto a pairing that can't occur and
fails `npm run verify` at 2.64:1, and the original task order deployed the worker
before the client stopped requiring a `prompt`, which is precisely the failure the
migration plan warns about.

No `/test` box, same as features 1, 3, 4 and 5: `CLAUDE.md` rules out a test
runner and browser automation, so verification is the manual walkthrough.

### A bug the AC-9 verify pass found: a failed mint was permanent

`/debug`, 2026-08-31. Not a feature, a fix, recorded here because it changes a
shared hook and three screens.

`app/storage/urls.ts` deliberately refuses to cache a failed mint, and says why
in its own comment: one flaky network moment must not leave an image broken for
the rest of the session. `app/storage/useStoredUrl.ts` then did exactly that one
layer up. Its `failed` flag was written once, to `true`, and the effect that
could have reset it keyed on `[path]` alone, so a path that does not change,
which is every path here, meant a single failure lasted for the life of the
component. The two layers disagreed, and the module's decision stopped at the
React boundary.

Pre-existing, inherited verbatim from feature 5's `readPlanUrl`. The revision did
not cause it but did widen the exposure: `BusyPlan` mints the plan path while the
render works and swallows the failure for AC-5's ivory fallback, the failure
evicts the cache entry, and then the floor plan key mounts and mints the same
path a second time. That second failure is the one that stuck.

The second finding is the one that decided the fix. All three failure surfaces
showed a sentence and no way out, against `CLAUDE.md`'s standing rule that a
failure is always a human sentence **and a retry action**. The sticky flag was
what you get when an "always" rule is half applied, so an automatic retry would
have closed the symptom and left the rule broken.

- [x] `useStoredUrl` returns `retry` alongside `url` and `failed`. It clears both
      and bumps an attempt counter in the effect deps, so the reset lives in an
      event handler rather than as a synchronous `setState` in an effect body,
      which is the thing that hook and the upload card already have comments
      explaining they avoid
- [x] A `Try showing it again` button beside all three failure sentences, in
      `PlanUploadCard`, `RenderPlate` and `ProjectSheet`
- [x] No automatic retry. A `signedOut` failure does not fix itself on a timer,
      and a bounded auto retry would hide a real sign out behind a spinner
- [x] `npm run verify` green: typecheck, lint, format, contrast, build
- [x] Feature 5's `verify.md` gains a `When the mint fails` block. It had zero
      coverage for a failed preview, which is why this went unseen
- [x] Walk that new block by hand. It needs the network panel offline, which is
      the one part no amount of reading the code can stand in for
      _Walked 2026-08-31. Passed. The failure sentence and the retry button both
      appeared, and the preview recovered on the button once back online, with no
      page reload._

### A review pass on the URL cache and the worker handler

Code review, 2026-08-31. Two findings acted on, one recorded and deliberately
left alone.

**Signing out left the minted-URL cache full.** `forgetAllStoredUrls` was called
from `usePlanUpload`, which is mounted on the home screen only. Sign out from
`/project/:id` and nothing cleared it: a URL in that cache reads a private file
with no authentication and stays live for the rest of its hour, so on a shared
browser the next account to open the same path within the 50 minute cache
lifetime would have been handed the previous account's floor plan or render. The
purge now lives in `app/storage/useForgetUrlsOnSignOut.ts`, mounted by
`ConfiguredApp` in `root.tsx` beside `useAuthEvents`, for the same reason that
subscription is there: the root layout is the one component mounted wherever the
person happens to be standing when the session ends. `usePlanUpload` keeps its
own reset, which is about the card's preview, not the cache.

**The worker's `/render` handler bound two values with `let`.** `body` and
`planUri` were each filled in from a `catch`, which is the ordinary idiom and
also the one thing `CLAUDE.md`'s immutability rule does not allow. They are now
`readJsonBody` and `readPlan`, small helpers that return the value or a null /
tagged failure, and the handler reads as a sequence of single-assignment steps.
Behaviour is unchanged, including the 404 versus 502 split on an unreadable plan.

- [x] `npm run verify` green: typecheck, lint, format, contrast, build

**The render claim was not atomic, and now is.** `commitRenderStart` reads the
record, checks `mayStartRender`, then writes, so two tabs could both pass the
check before either write landed, both call the worker, and one paid render be
discarded by the `startedAt` stamp.

This was first declined on the grounds that Puter KV has no compare and swap.
That was wrong, and it came from taking spec 0006's own wording rather than
reading the SDK, which is the mistake `CLAUDE.md` names Puter specifically to
avoid. `puter.kv` ships `incr`, which increments on the server and returns the
new value, so exactly one caller can ever be handed `1` for a key that does not
exist yet. That is a claim with no read in front of it.

`app/render/claim.ts` is guard 4, and the only one of the four that reaches past
one tab:

- [x] The winner is whoever `incr` hands `1` for `render-claim:<id>:<model>`.
      Everyone else stands down silently, exactly as guard 2's refusal already
      did
- [x] A lease, not a lock. `kv.expire` at `STALE_AFTER_MS`, the same window
      after which the record itself stops believing a `running` render, so the
      two agree instead of one blocking what the other allows. A tab that dies
      mid render frees the model rather than wedging it
- [x] The loser refreshes the lease too. `incr` and `expire` are two calls, and
      a tab dying between them would otherwise leave a key with no expiry that
      blocks that model forever. One extra call makes that impossible, and a
      loser cannot hold the lock open because losers only arrive on a mount or
      a retry, never on a timer
- [x] A stale `running` render needs no special path. The lease is set a minute
      shorter than `STALE_AFTER_MS`, so a claim always runs out before the
      record stops believing the render it stands for, and taking one over is an
      ordinary claim on a key that is already gone
- [x] Review caught the first version of that. It deleted the key before
      claiming, which is two calls and not atomic: two tabs retrying the same
      stalled render could interleave and both be handed `1`, and one tab's
      delete could throw away a live claim the other had just taken, so they
      stomped each other instead of merely duplicating. Deleting nothing is both
      simpler and correct
- [x] Released in a `finally`, so a failure or a navigation gives the render
      back immediately instead of making Retry sit out the lease
- [x] A release only deletes a claim young enough to still be its own. Review
      caught this: the key holds a count, not an owner, so an attempt that
      outlived its lease was deleting whatever claim happened to be there, which
      could be a successor's live one, freeing the render for a third paid
      generation. Elapsed time settles it with no extra round trip, because a
      successor cannot exist until the lease has run out. An attempt too old to
      release safely lets the key expire instead, which costs nothing: the
      client gives up on a render after two minutes, far inside the window
- [x] A claim that cannot be reached degrades to the old three guards rather
      than refusing to render. A KV hiccup that left someone unable to render at
      all would be worse than the duplicate it prevents, and a real outage still
      surfaces one step later when `commitRenderStart` cannot write. That
      degraded attempt is its own state, `unguarded`, not a `won` claim: review
      caught it reporting `won`, which meant an attempt holding no key at all
      went on to delete whatever key it found, taking out a live claim another
      tab legitimately owned. Owning nothing and releasing nothing are now the
      same thing
- [x] Guard 3 stays. It is still the backstop for a late answer from an attempt
      whose lease ran out
- [x] `npm run verify` green: typecheck, lint, format, contrast, build
- [x] Walk it by hand: two tabs on the same pending project, and a Retry on a
      stalled render. Nothing here can be checked by reading
      **Closed 2026-09-02 unwalked, and this is the feature's real exposure.** Every
      one of the nine claim points above was settled by code review and reasoning,
      including the three that review itself caught: the delete-before-claim race,
      the release that could free a successor's live claim, and the degraded
      `unguarded` attempt reporting `won`. Not one of them was ever put in front of
      two real tabs. Reasoning found three defects in this code and it is entirely
      possible it left a fourth. What bounds the risk is the cost of the failure
      rather than its likelihood: the worst case is a duplicated paid render, not a
      lost project or a corrupt record, because guard 3's compare before write and
      the lease's own expiry both sit underneath it. That is why this is a waive and
      not a shipped defect, and it stays named here rather than being tidied away

## Slice 2: App shell & gallery

### 7. App shell & project gallery · done

The frame everything else sits inside: a navbar, and a personal gallery of a
signed-in user's own past projects, each card showing its render (or its
in-progress state), its floor plan thumbnail, its name and its date. This is
what makes the tool feel like a real workspace across visits, not just a
single one-off generation. Naming the model on a card was the other half of
that meta line and spec 0007 removed the point of it, there being one model.

The navbar and the card grid are governed by feature 4's structural
reference for the home screen: no pill badge, no per-card "Community" badge,
and a before/after thumbnail pair rather than a generic clock-and-author line.

**Spec: [0008](docs/specs/0008-app-shell-and-project-gallery/index.md).** Decided:
a **read-only** gallery over the `listProjects` spec 0002 already built, on two
surfaces sharing one `ProjectCard`, a strip of 3 on home and the full grid at
`/projects`. Client-side paging renders 12 cards at a time, which matters
because the scarce resource is not rows but the expiring view URLs each card
mints for a private file. Cards do **not** update while a render runs and never
start one: `app/render/` stays the only place a render is claimed, which is
worth a navigation given the four consecutive fixes that cross-tab claim needed.
Delete, rename and search were each considered and deliberately left out. The
feature adds no persisted state at all, the first since feature 1 with no write
path.

The cross-check on this spec caught a real defect in its first draft, recorded
here because it is the kind that survives every other check: the card's state
word was sourced to `renders[model].status`, but `stalled` is not a stored
status. It is derived by `isStaleRender` inside `renderView`, so a card reading
the stored field would show "Working" forever on an abandoned render while the
project page beside it said "Stopped". The card goes through `renderView` and
`verify.md` has a step aimed squarely at it.

- [x] Decide the approach: spec 0008
- [x] Build it: `/develop` feature 7, the eight tasks of spec 0008's build plan,
      code in `app/shell/` and `app/gallery/`
  - [x] The shell: lift the header out of `app/root.tsx` into
        `app/shell/Navbar.tsx`, with the wordmark link and a `Projects` link
        gated on `useAuthState`, satisfies AC-1
  - [x] The card and its pure half: `app/gallery/rules.ts` (`cardRender`,
        `formatProjectDate`), and `STATE_WORDS` moved out of `RenderPlate.tsx`
        so the plate and the card cannot drift. It landed in
        `app/render/rules.ts` rather than in the gallery, beside the
        `RenderView` type it is keyed by: the plate imports it too, and
        `app/render/` importing from `app/gallery/` would point the dependency
        the wrong way. Then `ProjectCard.tsx` reusing
        `.plate-frame` and its `data-busy` treatment, plus a new `.plan-chip`
        class. The word comes from `renderView`, never the stored status,
        satisfies AC-3, AC-4, AC-5, AC-12
  - [x] The thread end to end: `/projects` with its `clientLoader`, the grid
        inside the existing `RequireUser`, the empty state, and the failure
        sentence with a `useRevalidator` retry. First point this is walkable,
        satisfies AC-2, AC-8, AC-9, AC-10, AC-13, AC-14
  - [x] Thicken it: `ProjectGrid` with the 12 cap and `Show more`, then the
        unreadable line including the case where everything was unreadable,
        satisfies AC-6, AC-7
  - [x] The home strip: its own `clientLoader` calling `listProjects`
        unconditionally, the same grid capped at 3, and `See all`, satisfies
        AC-7, AC-11
- [x] Verify it: the manual walkthrough in
      [verify.md](docs/specs/0008-app-shell-and-project-gallery/verify.md). The
      stale-render step is the one worth an independent pass: a card reading the
      stored status passes every other step on that page.
      **Closed 2026-09-02 with 10 of 50 steps run and passing and 40 waived.**
      Closed on the engineer's call. The stale-render step this box singled out
      is ticked in `verify.md`, but it was ticked by the build's own pass and
      never independently walked, and that is the accepted gap. It matters more
      than its one line suggests: it is the one place where `renderView` and the
      stored status can silently drift, a card that reads the stored status
      passes every other step on the page, and the defect it exists for is one
      the cross check actually found in the first draft. The rule is pure and
      lives in `app/render/rules.ts`, which is what makes reading it a fair
      substitute for walking it, but reading it is what happened. The other 39
      are the ordinary browser walk of a gallery whose cards have been looked at
      constantly since, while features 8, 9 and 11 were built on top of them

No `/test` box, same as features 1, 3, 4, 5 and 6: `CLAUDE.md` rules out a test
runner and browser automation, so verification is the manual walkthrough.

## Slice 3: Comparison

### 8. Side-by-side comparison view · done

Checked against feature 6's 2026-08-31 revision and **unaffected**. This compares
the plan against the render, not two models against each other, so dropping Claude
takes nothing away from it. The square top-down output it now receives is easier
to slide against a plan than the old 16:9 interior was.

An interactive view, a slider or toggle, between the original floor plan and
its AI-rendered counterpart. This is the one place besides buttons/links
that the accent color is allowed to appear on, since the slider itself is an
interactive element, the images on either side never get their own tinted
frame or border, they carry the visual distinction on their own.

**Spec: [0009](docs/specs/0009-side-by-side-comparison-view/index.md).** Decided:
the render plate stays exactly as built, and a **separate comparison section**
sits directly beneath it once a render is complete, holding
`react-compare-slider` v4 at the halfway point. The render is therefore on the
sheet twice, against the rule `ProjectSheet` holds for the plan. That was chosen
knowingly, after the objection that would have made it expensive was ruled out:
the promise cache in `app/storage/urls.ts` shares one mint per path, so the
second copy costs one image decode and zero Puter calls. What is bought with the
page height is a comparison that announces itself rather than one discovered by
noticing a hairline. No writes, no worker calls, no schema change, the third
feature running with no persisted state. Code goes in a new `app/compare/`.

Three things the cross-check caught that no amount of reading the code would
have, because they live in a dependency. The library's handle root sets
`outline: 0` **inline** and takes no `className` from us, so the app-wide focus
ring can never reach it; the indicator moves onto our own grip through
`[data-rcs="handle-root"]:focus-visible .compare-grip`, the first exception to
spec 0004's one-ring rule and a forced one. The first draft's "the plan is on
screen exactly once" was false for two models, one running and one complete
showing a blurred plan and a large plan together, so the three places are now
decided together by one `planPlacement` rather than each testing its own
condition. And the tutorial's `defaultValue={50}` is the v2/v3 prop name; v4
calls it `defaultPosition` and would have ignored the old one silently, landing
on the same 50 by coincidence.

- [x] Decide the approach: spec 0009
- [x] Build it: `/develop` feature 8, the eight tasks of spec 0009's build plan.
      Code in `app/compare/` (`RenderComparison.tsx`, `CompareHandle.tsx`,
      `rules.ts`), plus `planPlacement` in `app/render/rules.ts`, the rewired
      `app/render/ProjectSheet.tsx`, and the comparison block at the end of
      `app/app.css`
  - [x] The thread: `app/compare/RenderComparison.tsx` on library defaults,
        mounted from `ProjectSheet`'s existing `models.map` under its own plate,
        gated on `complete` **and** a non-null `render.path`. Walk it in a
        browser before styling anything, satisfies AC-1, AC-2, AC-4, AC-12
  - [x] The frame and the two fits in `app/app.css`: `.plate-frame` on the slider
        root, the render covering and the plan contained on ivory so no wall is
        ever cropped out of the drawing being judged, satisfies AC-3, AC-13
  - [x] The handle and the labels: our own node passed to `handle`, never the
        library's circle, plus the heading and the label row in the plate's own
        idiom. `frontend-design` must actually fire before this one, satisfies
        AC-6, AC-7
  - [x] The one-plan rule: `planPlacement` in `app/render/rules.ts` beside
        `isWorkingView`, replacing `ProjectSheet`'s `working` boolean rather than
        joining it, plus the both-URLs-or-nothing guard, satisfies AC-5, AC-10,
        AC-11
  - [x] Keyboard, focus and motion: the grip indicator, and no `transition`
        prop. Do not spend time on an outline rule that cannot win, satisfies
        AC-8, AC-9

Code review caught one thing the fourteen code-shape checks could not, and it
changed AC-10. `useStoredUrl` kept its `failed` flag per hook instance, so with
the render in the plate and again in the comparison, the plate's `Try showing it
again` re-minted for the plate alone and the comparison sat on a failure nothing
could clear. Worse, a failed PLAN mint had no retry anywhere at all: the sheet
mounts a comparison only when `planPlacement` says `"comparison"`, which is
exactly when `FloorPlanKey`, the surface that owns that button, is off the page.
The fix moves the attempt counter into a module-scope map keyed by path,
subscribed to through `useSyncExternalStore`, so every view of one file retries
together, and gives the comparison the plan's failure sentence while it owns the
plan. AC-10 now reads "one button per failed file, and every failed file has one"
rather than "no section if either URL failed", which is the rule it was reaching
for all along.

Reviewing also settled the oldest contradiction in `CLAUDE.md`: its "How to work"
section claimed there was no spec-file system while "Workflow skills" mandated
the `/architect` pass that creates one. Nine specs had already settled it. That
paragraph now says specs live in `docs/specs/` and keeps only the standard it was
really defending, that a spec records a real decision rather than fills a
template.

- [x] Verify it: the manual walkthrough in
      [verify.md](docs/specs/0009-side-by-side-comparison-view/verify.md). Two
      steps are worth an independent pass and neither is visual: reading
      `planPlacement` against `["running", "complete"]` by hand, since one model
      means the two-plan bug cannot be walked, and counting the view-URL mints in
      the network panel, since a second mint per path is invisible on screen.
      **Closed 2026-09-02 with 14 of 34 steps run and passing and 20 waived.**
      Closed on the engineer's call. Both steps this box named as worth an
      independent pass are the accepted gaps. `planPlacement` against
      `["running", "complete"]` is ticked in `verify.md` from the build's own
      reading and was never independently re-read; with one model the two-plan
      bug it guards cannot be walked at all, so a second pair of eyes on a pure
      function was the entire available check and it did not happen. The view-URL
      mint count in the network panel was never opened, so a regression in the
      promise cache in `app/storage/urls.ts` would quietly double this page's
      Puter calls with nothing on screen to show for it. Both are cheap to run
      later and neither can corrupt anything: the first is a layout mistake and
      the second is a cost mistake. The other 18 are the ordinary browser walk

No `/test` box, same as every feature here: `CLAUDE.md` rules out a test runner
and browser automation, so verification is the manual walkthrough.

Two things the build settled that the spec could only guess at.

The grip is the architectural dimension tick, an oblique stroke at 45 degrees,
drawn twice, in `.plan-mark`'s own weight. That is no longer what ships, and the
reversal is worth keeping visible rather than editing away. Feature 11's build
first added a shaft and two arrowheads either side of the ticks, because the
ticks alone were too quiet to read as draggable on a busy render; that was still
too subtle in use, so the mark is now the plain icon spec 0009 refused, a bone
disc with a clay ring and a double arrow. The drawing vernacular lost the one
element that carried it, in exchange for a mark nobody has to learn. Still our
own node and still flat, with none of the library handle's blur or shadows, and
the opaque disc retired the doubled bone casing every earlier version needed.
Recorded as an amendment on spec 0009's AC-7. That is where `frontend-design`
landed after ruling out the two obvious answers: a circle is the library's
default and the thing spec 0009 explicitly refused, and a pair of flat drag
ridges is a widget from another product. A dimension tick is how a drawing
terminates a measurement, so the mark that says "take hold of me" is the same
mark that says "this is a measurement between two pictures". Both the divider
and the ticks carry bone clearance either side of the clay, which is not
decoration: a bare one pixel clay hairline sitting on top of an arbitrary render
is not reliably visible, and the casing is what makes it a line on a sheet in
every render rather than in most of them.

AC-3 and AC-10 pull against each other and the build had to resolve it. AC-3
wants the square reserved from the first paint so a slow mint never shifts the
page; AC-10 says a comparison with a missing URL is not rendered at all. Read
literally together, a mint that has simply not landed yet would hide the section
and then grow the page by a full square when it arrives, which is the shift AC-3
forbids. So the section and its `.plate-frame` mount as soon as the sheet hands
the plan over, and only the slider inside waits for both URLs; a _failed_ mint
still takes the whole section away, which is the case AC-10 is actually about.

`react-compare-slider` costs about 9 kB raw and 3 kB gzipped, measured by
building `project-main` with and without the import: 16.09 kB / 5.88 kB gzipped
against 6.13 kB / 2.52 kB. That closes the spec's third follow-up.

## Slice 4: Sharing & export

### 9. Public/private visibility & the community feed · in-progress

A project owner can flip a project public or private at any time. Public
projects show up in a global community feed anyone can browse, without
needing an account, that's what actually makes the feed work as discovery.
Only creating a project and toggling its visibility need sign-in. The
owner's own view is identical to what anyone else sees, plus the ability to
actually edit or regenerate.

**Specs: [0011](docs/specs/0011-publish-visibility-and-community-feed/index.md),
which amends [0002](docs/specs/0002-project-records-and-public-feed-index/index.md).**
0002 decided the three store model alongside feature 3's record shape, since the
two could not be settled apart: an anonymous visitor holds no credential, so the
feed is served by the worker out of a store only the worker can write, and public
images are copied into one app owned `*.puter.site` directory. That stands. A
review of 0002 then found six open design problems, all in this half, and 0011 is
the pass that answers them. It replaces four things 0002 designed, the chunked
index, the fenced lock, the publish write order, and the staleness rule, with a
flat cursor paginated index that needs no lock, an intent first publish, and a
revision counter that compares no clocks. 0011 also owns this feature's build
plan; 0002's tasks 4 to 11 are superseded by it. AC-3 to AC-14 come from 0002 and
AC-15 to AC-25 from 0011, and all of them are verified here.

- [x] Decide the approach: spec 0011
- [x] Build it: /develop feature 9
  - [x] Prove the platform facts, land schema 3, and move the write queue behind
        `app/projects/store.ts` (AC-16, AC-19, AC-20, AC-21). The platform check
        is a hard gate and blocks everything below it
    - [x] Schema 3 (spec task 2): `revision` on `Project`, `publishedRevision`
          on `PublicAssets` and `FeedEntry`, and `parseProject` reading a stored
          version 2 record as version 3 with `revision` of `0` and
          `publicAssets` cleared. `feedPageKey` and `FEED_META_KEY` are deleted
          with the chunked index they belonged to. **The spec's task 2 was
          incomplete and the build corrected it**: `checkVisibility` demanded
          that `publishedAt` and `publicAssets` were set exactly when a project
          was public, which no intent first publish can ever satisfy, and which
          would have refused the upgrade's own output on the next write. It now
          allows the two transient states the sequence really has, public with
          no assets yet (uncommitted) and private with assets not yet withdrawn,
          and keeps the direction that could mislead: public implies stamped,
          and assets imply stamped. Satisfies AC-21, part of AC-19
    - [x] The serial queue (spec task 3): `createSerialQueue` now sits in
          `app/projects/store.ts` around `updateProject` and `deleteProject`,
          and is gone from `app/render/useProjectRenders.ts`. `updateProject`
          bumps `revision` only when `name` or `renders` is among the changes.
          **A second correction to the plan**: "delete the queue, leave guard 3
          in place" is not possible as written, because guard 3 is a read
          followed by a write and the render hook's queue was what held the two
          together. `updateProject` now also accepts a function of the stored
          record returning changes, or `null` to abandon, so the check and the
          write happen inside one turn of the store's own queue. Guard 3 is
          strictly more correct than it was, and there is still one door.
          Satisfies AC-20, AC-19, part of AC-13 and AC-17
    - [x] Prove the platform facts (spec task 1). Scratch `/kv-probe/*` routes
          were deployed and run by hand, and all three facts came back clean:
          `me.puter.kv` exposes what the index needs, and a listed page holds
          key order across a cursor boundary. The scratch block has been
          removed from `worker/roomify.js`, which is byte for byte the file it
          was before. The cursor is **opaque**, not positional: a key deleted
          from page one left page two unaffected, so `AC-16`'s positional
          fallback is not needed. All three results are recorded in spec 0011's
          Follow-up. Unblocks AC-16
  - [x] The thin public thread: the hosted subdomain, `POST /publish`, the client
        publish action, and `GET /feed` reaching a signed out browser (AC-3,
        AC-4, AC-6 to AC-8, AC-11 to AC-13, AC-15 to AC-18, AC-22). **Proven
        against a real published project**, not only against an empty store: a
        project published from a browser produced a live entry the anonymous
        feed returns, and both hosted copies fetch with no auth at all, the
        render as `image/png` at 1,960,689 bytes and the plan as `image/jpeg` at
        35,172 bytes. Store C, the subdomain, the cross identity copy and the
        entry are all real
    - [x] A second platform gate before spec task 4, the same scratch shape as
          the kv probe: `/hosting-probe/*` routes in `worker/roomify.js`, now
          removed. Every fact came back clean. `me.puter` has both `hosting` and
          `fs`, so the app identity creates and owns the subdomain itself and no
          person in a browser is needed. The app root is `~/AppData/<appId>` and
          **only relative paths reach it**, which cost the probe its first run
          and which store C's paths now have to respect. A subdomain created by
          `me` serves what `me` wrote, publicly and with no auth, so
          HeyPuter/puter#2295 does not bite this design. Ownership was read from
          `hosting.list()` only, never `get()`. And the cross identity copy, a
          46,168 byte JPEG read as the caller and written as the app, came back
          byte for byte from its public URL first try, which closes 0002's open
          follow up as well. Written up in 0011's Follow-up. Unblocks AC-6 to
          AC-8, AC-11
    - [x] The worker half: spec tasks 4, 5 and 7, all in `worker/roomify.js`.
          `ensureHosting` creates and owns `architecture-vis-public` itself, so
          there is no manual step left anywhere. `POST /publish` re reads the
          record as the caller, refuses a record that does not already say
          public and one with no complete render, copies the plan and every
          finished render across identities, **re reads the record a second time
          before writing anything**, then sets the entry and then the pointer.
          `GET /feed` is anonymous and reads one bounded page through the app's
          own store. Deployed and driven by `curl`: the anonymous feed answers
          `200 {"entries":[],"cursor":null}` with no session at all, a limit of
          999 answers `400 badRequest`, and a publish with no session answers
          `401 signedOut`. Satisfies AC-6 to AC-8, AC-11 to AC-13, AC-15,
          AC-16, AC-18
    - [x] The client half: spec task 6 and the `/community` route.
          `app/publish/` holds the failure vocabulary, the worker call with its
          response parsed rather than trusted, and the three step action, intent
          write, worker, commit, with the commit dropping a response whose
          `publishedRevision` is older than what is stored. `app/feed/` holds
          the anonymous read and the card, and `Community` is in the navbar for
          everyone, signed in or not. `useProjectRenders` now returns `apply`,
          so a publish hands the newer record back to the one copy the sheet
          already has rather than starting a second. Satisfies AC-14, AC-17,
          AC-3, AC-4, AC-12, and the client half of AC-22
    - [x] A temporary Make public button carried this thread at its review point,
          since task 10 owns the real toggle and task 9 owns unpublish. **It has
          since been replaced** by `app/publish/VisibilityControl.tsx` and no
          longer exists. What survives from it is the state word reading from
          the record instead of the hardcoded `Private` it used to be
    - [x] **Five corrections to spec 0011.** Four were found by building it and
          the fifth in review. None
          changes what the feature does and each contradicts something the spec
          says, so they need folding back into 0011 by `/architect` rather than
          living only here:
      1. **The feed read cannot go through `withPuter`.** 0011 says the client
         reaches all four routes through `puter.workers.exec()` behind
         `withPuter`, carrying `x-puter-no-auth` when the reader is signed out.
         That cannot work: `withPuter` rejects with `PuterGateError` when no
         token is held, so it refuses before the header is ever sent, and AC-3
         is precisely the signed out case. `app/feed/store.ts` uses a plain
         `fetch` with that header on every call instead. Nothing is lost:
         `workers.exec` exists to attach a session and this route deliberately
         has none. No SDK import is involved, so the rule
         `app/platform/AGENTS.md` actually owns is untouched
      2. **Two queues, not one.** 0011 asks that the publish and unpublish
         worker calls go through the same per project queue as every record
         write. That deadlocks on the first press rather than racing:
         `updateProject` enters that queue itself, so a sequence held inside one
         of its turns can never reach the position it is waiting for.
         `app/publish/queue.ts` holds a whole publish sequence and the record
         queue still holds every individual write. The invariant 0011 wanted, a
         publish and an unpublish of one project never overlapping in a tab,
         holds; the single writer rule is untouched, since nothing in that
         module writes a record
      3. **The public subdomain serves `public/`, not the app root.** 0011's
         data model reads store C's paths as relative to the app root with the
         subdomain served from the root itself. Binding it one level down
         produces the identical public URL and keeps everything else the app
         account ever writes out of a directory served to the world. The URL
         shape the record stores, and everything `checkPublicAssets` checks
         about it, is unchanged
      4. **A fifth state the spec did not name: `withdrawing`.** 0011's state
         transitions name the uncommitted state, where the record reads public
         and no copy was committed, and stop there. Its mirror is just as real
         and arrives the same way: an unpublish writes `visibility` first and
         clears `publishedAt` and `publicAssets` only once the worker confirms,
         so a failure in between leaves a record reading private with its public
         copies possibly still up. Two things had to change for it.
         `publicState` reports it rather than folding it into `private`, because
         a project shown as private whose only control says `Make public` offers
         exactly the wrong direction, and the repair now carries which way it
         goes. And `deleteProject` refused only on `visibility === "public"`,
         which would have let precisely that record be deleted, taking with it
         the only thing that knows where its entry and its hosted files are. It
         now refuses whenever anything public is outstanding
      5. **`publishedRevision` comes from the first read, not the second.**
         0011's derivation table says it is "the record's `revision` at the
         moment the worker read it back", which is the second read, and the
         build followed it. That is wrong, and the spec contradicts itself two
         tables earlier where the same field is "the `revision` the live public
         copy was built from". The copy is built from the FIRST read: its paths
         and its `models` both come from `record`. So a content write landing in
         another tab between the copy and the second read stamped N+1 onto
         revision N's images, and since `publicState` reads equal revisions as
         `live`, the owner was shown a current public copy, with no republish
         offered, over stale hosted bytes. It now stamps `record.revision`, and
         the response carries the entry's own value so the record and the feed
         cannot disagree. Under claiming is safe where over claiming is not: if
         nothing changed the stamp is exact, and if something did the project
         reads `stale` and copies again. That is the only available answer,
         because a write landing DURING the copy can leave it holding some of
         each revision and no read can detect it: `renderOutPath` is
         deterministic, so a regenerated render overwrites its path rather than
         taking a new one
  - [x] Withdrawal and the single public project page (AC-5, AC-9, AC-18), spec
        tasks 8 and 9. `POST /unpublish` is idempotent and has no "not
        published" error, deletes the pointer before the entry, mirroring
        publish's entry before pointer, and removes the whole store C directory
        by deriving it from the project id alone, so no manifest is kept
        anywhere. `GET /feed/project/:projectId` reads the pointer key, the only
        way an anonymous route can find an entry, since `kv.list`'s pattern is
        prefix only. Confirmed live: the route resolves a real published project
        by id, and answers one identical bare 404, with an empty body rather
        than the router's own `Path not found`, for both a well formed id that
        is not in the feed and a malformed one. `/community/:projectId` renders
        it for anybody, signed in or not
  - [x] The owner's controls and the states (AC-10, AC-19, AC-22 to AC-25), spec
        tasks 10 to 12
    - [x] The visibility toggle, in `app/publish/VisibilityControl.tsx`. Going
          public asks once and names what happens; going private takes effect
          immediately (AC-25). The confirmation is **an inline two step**, a
          sentence and `Share it` / `Cancel` in place on the sheet, decided with
          the engineer rather than assumed: the design system has no overlay, no
          scrim colour and no focus trap in it, and a dialog would have meant
          adding all three for one question. Focus moves to the confirming
          button when the question opens, and the sentence is its
          `aria-describedby`, so it is announced with it
    - [x] Freshness as a pure function in `app/publish/rules.ts` (AC-19). It is
          one comparison of two integers, `revision` against
          `publicAssets.publishedRevision`, and no timestamp is compared with
          another timestamp anywhere in the file, which is the whole of AC-19
    - [x] The automatic republish (AC-22, AC-10), and it is wired the way the
          spec insisted rather than at the call sites. `app/projects/store.ts`
          announces every successful write from inside its own queued turn
          through `app/projects/afterWrite.ts`, and `useAutoRepublish` listens
          above every screen, so whatever changes a public project brings its
          public copy back into step. **A listener is never awaited**: it runs
          inside the store's queued turn and waiting for one would be waiting
          for a position in the queue that turn still holds, which deadlocks
          rather than races. One refinement to the rule as written: a content
          write that leaves no complete render is skipped, because taken
          literally the rule would republish the write that moves a
          regenerating render to `running`, which the worker would correctly
          refuse with `noRender` and which would put a failure sentence in front
          of somebody who did nothing wrong. The write that finishes the render
          is itself a content change and republishes then
    - [x] The empty feed, signed in and signed out (AC-23), and the one plain
          page a withdrawn, private or never real project gets (AC-24), which
          says the same thing and carries the same way onward for all three,
          because telling them apart would tell an anonymous visitor which
          private projects exist
    - [x] One cleanup on the way out: `feedWhereKey` is gone from
          `app/projects/record.ts`. It was exported, imported nowhere in `app/`,
          and duplicated a string the worker derives for itself, which is the
          exact drift the comment block around it argues against. The key is
          unchanged and still lives in `worker/roomify.js`; only the app side
          mirror is gone, and the reasoning it carried stays in that comment
- [ ] Verify it: /check verify feature 9, AC-3 to AC-25. The worker half is
      already proven live by `curl` against a really published project, and
      every check above passes: typecheck, lint, format, contrast and a real
      build. What is genuinely unwalked is the browser: the confirmation and its
      keyboard path, the two empty feed invitations, the out of date state and
      its retry, unpublish from the uncommitted state, and the two tab races
      spec 0011's Critical test scenarios name

### 10. Export · in-progress

A way to download a generated render for use outside the app, a presentation, a
portfolio, a client deck. "Full resolution" means the stored bytes untouched,
nothing resized or re-encoded, rather than anything upscaled.

The sentence that used to sit here was wrong and is worth recording as wrong,
because believing it leads straight to a mechanism that cannot work. It said
this was straightforward once the render had a permanent public URL from feature
5's storage approach. Feature 5 decided the opposite: a path is the durable
identifier, and a URL is minted on demand and allowed to expire. The permanent
public URL exists only for a project feature 9 has published, so anything built
on it would cover published projects and silently fail for every private one.
Export starts from the private path instead.

**Done when:** a finished render on the project page can be saved to disk under
the project's own name, byte for byte the file the worker wrote, with the three
states and three failure sentences the spec pins down, and `npm run verify` plus
a real browser walk both pass.

**Spec: [0012](docs/specs/0012-download-a-render/index.md).** The decision was
the mechanism, and browsers settled it rather than taste: the `download`
attribute is honoured only for same origin URLs, and every URL this app can
produce for a stored file is on a Puter origin, so an anchor pointed at one
opens the image in a tab and names it whatever the server says. So the render is
read with `puter.fs.read`, which returns a blob, and that blob is saved through
an object URL, which is same origin by construction. It is a pure read: no
schema change, no worker call, no write, so `revision` never moves, and the
feature ships independently of feature 9 still being in progress. A cross check
on a second model closed five gaps before the spec was accepted, all of them
values an acceptance criterion needed whose source the spec never named, and
caught a live inconsistency on the way: `AuthControl.tsx` already sets
`aria-disabled` on the sign in button while busy, and `app.css` has only ever
styled `[disabled]`, so that button has never dimmed.

- [x] Decide the approach (spec)
- [ ] Build it: `/develop` feature 10, the eight tasks of spec 0012's build plan
  - [ ] The thin thread, proven in a real browser before anything is thickened:
        `app/export/` with `DownloadRender.tsx`, the SDK read, and the save.
        Tasks 1, AC-1 and AC-2
  - [ ] The filename and the failure vocabulary: `rules.ts` with its own slug
        rule rather than `sanitisePlanName`, and `failures.ts` plus `store.ts`
        with the `stat` first rule that tells the three codes apart. Tasks 2 and
        3, AC-3 and AC-7 to AC-9
  - [ ] The three states, and the design system amendment they need: busy,
        unavailable, and absent, plus spec 0004's disabled selector extended to
        match `aria-disabled`. Tasks 4 to 6, AC-4, AC-5, AC-6, AC-13
  - [ ] The accessibility pass, and confirming the feature is inert everywhere
        else. Tasks 7 and 8, AC-10 to AC-12
- [ ] Verify it: `/check verify` feature 10, the walkthrough in
      `docs/specs/0012-download-a-render/verify.md`. The gate runs first: if the
      saved file opens in a tab instead of landing in Downloads, nothing after it
      is worth building

No `/test` box on this feature, same as every other one here: `CLAUDE.md` rules
out a test runner, and `verify.md` is the walkthrough instead.

## Slice 5: Identity & polish

### 11. The AV mark, a display typeface & real buttons · in-progress

The four screens that exist all work and none of them looks like anybody
designed it. The typeface is whatever came with the template, the brand in the
navbar is the literal word `Roomify` in a heading role, signing in is a real
button while signing out is a piece of text, and the hero copy is a first draft
that names a different product than the new copy does. This feature settles all
of that at once: a drawn AV mark, Chakra Petch on everything except running
prose, the new hero copy, a bordered button variant so sign out and sign in are
the same kind of thing, and tighter spacing across the navbar, home, gallery and
project page.

Deliberately not in it: pricing, a community navigation item, or anything else
from the marketing-site direction. Those are revisited once feature 9 actually
exists. Nothing about spec 0004's look changes either, same six colours, same
single accent, still flat with no shadow, no gradient and no pill.

**Done when:** every screen is set in the new typeface through the token layer,
the navbar carries the mark and two real buttons, the hero shows the new copy,
and `npm run verify` plus a browser walk both pass with the flat system intact.

**Spec: [0010](docs/specs/0010-visual-refresh-mark-type-buttons/index.md).**
The decision was where the change is allowed to live. Feature 4's ESLint rules
make a `className` incapable of carrying a family, a size, a weight or tracking,
so a typeface can only enter through the token layer, which rules out styling
the screens directly and makes a second parallel visual layer pure cost. So
spec 0004 is amended in place: a seventh type role, `type-label`, which is what
buttons and navigation links take so running prose can stay on Inter while every
other piece of text moves to Chakra Petch; a third button variant, `.btn-outline`,
bordered and set in ink so sign out reads as a button without pointing the
product's one accent at its least important action; and a family axis on the
roles. Sizes and the spacing ladder do not move, only tracking and weight, retuned
for a squared face. The rename to AV is a presentation rename only: the Puter
worker and app identity stay `architecture-vis-roomify`, because app and worker
names are global across all of Puter and that one is a reservation this project
holds. A cross check on a second model closed seven gaps before the spec was
accepted, including the hero copy being required verbatim by an acceptance
criterion that never quoted it.

- [x] Design it (spec)
- [x] Build it: /develop feature 11
  - [x] The shared layer: `--font-display` and the Chakra Petch request, the
        `type-label` role, the family and the retuned tracking and weight on the
        five display roles, `.btn-outline` with all six states, the shared
        metrics selector split so `.notice` keeps the body role, and the ESLint
        messages moved from six roles to seven, covers AC-4 to AC-8 and AC-17
  - [x] The navbar: the `Logo` component and its fixed box with the letter
        placeholder, the landmark relabelled, `Sign in with Puter` on
        `.btn-accent` and `Sign out` on `.btn-outline`, centre alignment and the
        padding step, covers AC-3, AC-9, AC-10, AC-12
  - [x] The rename across `app/`: prose, the three document titles, the meta
        description and the two identifiers, with the deploy script and worker
        deliberately untouched and commented to say why, covers AC-1, AC-2
  - [x] The screens: the new hero copy and its measures, the gallery masthead
        with its count line and the card rhythm, and the project page by type
        and spacing only, covers AC-11, AC-13, AC-14, AC-15
- [ ] Verify it: /check verify feature 11

Same as features 1, 3 and 4, there is no `/test` box: `CLAUDE.md` rules out a
test runner and browser automation, so verification is the manual walkthrough.

Code: `app/app.css` (the type layer, `.btn-outline`, `.logo`), a new
`app/shell/Logo.tsx`, `app/shell/Navbar.tsx`, `app/auth/AuthControl.tsx`,
`app/routes/*`, `app/gallery/rules.ts` and `ProjectCard.tsx`, plus
`eslint.config.js` and the rename across `app/`.

Four things the build settled that the spec could not.

The family axis reopened the closed set from a direction spec 0004 had already
seen coming. Tailwind v4 turns every `--font-*` theme key into a `font-<name>`
utility automatically, which is exactly the trap the type roles dodged by
staying out of the `--text-*` namespace, and a family cannot dodge it: `--font-*`
is where Tailwind reads a stack from. So `--font-display` shipped with a tenth
design rule beside it, closing `font-sans`, `font-mono` and `font-display` in a
`className`.

AC-17's own test scenario was false before this feature touched anything. It
asks for a planted `shadow-md` to fail lint, and it did not: the shadow guard
only ever caught a shadow carrying a colour (`shadow-[#000]`, `shadow-red-500`),
so the plain form every shadow actually arrives in went straight through. Two
rules closed it, shadow and gradient, and the planted violation of each kind now
fails. That was spec 0004's hole, inherited, not one this feature opened.

The navigation links had to give up `type-meta`. With `.nav-link` carrying the
control role from an unlayered rule, a `type-*` role on the same element is half
overridden and half not, which is a mongrel rather than a role. So the navbar's
`Projects` link and the home strip's `See all` moved off tracked caps and onto
the label role, sentence case. AC-6 asks for exactly this; it is worth writing
down because it changes two visible pieces of text no acceptance criterion
quotes.

Then three amendments, at the engineer's direction, after the first build
landed. All three are written up properly in spec 0010's `## Amendments`, with
the reasoning in its `rationale.md`; the short version is here.

The mark shipped. It arrived as `assets/AV_logo_nobackground.png`, a transparent
raster rather than the vector the spec assumed, so it is cropped to its own edges
and painted as a CSS mask in `currentColor` rather than placed as an image: the
mark is ink from the palette, it takes clay on hover, and no near-black of its
own enters the navbar. `assets/` is the source art and is neither served nor
imported; the shipped derivative is `app/shell/av-mark.png`.

The home hero is centred, block and text, and it is the only screen in the app
that is. Left anchored inside a centred column it left the right half of a wide
display empty. The recent strip below it, the gallery masthead and the project
sheet all keep the left edge.

The navbar sticks to the top of the viewport, on `bg-bone` so the page cannot
scroll through it, and the mark now has the wordmark `AV` beside it in
`type-label`: a drawn monogram for a product nobody knows yet is a shape before
it is two letters. The wordmark is also the link's accessible name now, so the
`aria-label` is gone.

`.plan-card` is a named exception to the flat rule and to the accent rule: a two
layer shadow mixed from ink, and a circular badge behind the upload mark filled
with clay at 10% over the surface tone. It is the one thing in the app a person
is asked to drop a file onto, and flat it read as an empty box. Scoped to two
class names in `app/app.css`, with the ESLint rule that fails `shadow-md` in a
`className` deliberately left in place, so a second card wanting a shadow has to
come back and argue for it.

## Not doing right now

Kept here so the plan stays honest about what's deliberately left out.

- Any render model beyond Gemini, or any render style beyond the top-down
  geometry-matching one spec 0007 pinned.
- Commenting, liking, or any social feature on the community feed beyond
  browsing public projects.
- An admin or moderation page for public content.
- Downloading from the public project page, so an anonymous visitor with a
  shared link gets a named file rather than a right click. Deferred from spec
  0012: a visitor has no Puter session, so it cannot reuse feature 10's SDK
  read and would be a genuinely different mechanism built on the hosted URL,
  with its own CORS question to answer. Revisit once feature 9 is verified.
- A public API for the community feed.
- Multiple floor plans per project, or re-uploading a corrected plan into an
  existing project.
- Regenerating a render that already succeeded. The state machine permits it
  (`complete` → `pending`, spec 0002) and spec 0006 deliberately left it out, so
  this is one transition away whenever it's wanted. It belongs with the project
  page once feature 7 exists, not bolted onto the first render loop.
- Deleting or renaming a project, and searching or filtering the gallery. All
  three were weighed for feature 7 and left out to keep it read-only. Rename is
  the cheapest, `updateProject` already takes it. Delete is the one with a real
  open question: whether the hosted floor plan and render files in Puter storage
  go with the record or are left orphaned. That is its own decision, from spec 0008.
- The marketing-site navigation direction: a `Pricing` item, a `Community`
  item, or anything else that turns the navbar into a site menu. Ruled out of
  feature 11 explicitly rather than forgotten. A `Community` item in particular
  should not exist before the thing it links to does, which is feature 9. Worth
  revisiting once that ships.
- Privacy policy and terms pages.
- Analytics or session-replay tooling. Nobody's asked for this yet.
- Dark mode. Declined in spec 0004 rather than left as an unexamined gap. The
  palette is a near-monochrome bone and ivory look chosen so the uploaded floor
  plan and the render are the only saturated things on screen, and a dark
  inversion is a second full palette to design, measure for contrast and hold in
  every component's six states. `color-scheme: light` stays and no `dark:`
  variant appears in the tree. If it is ever wanted, it is its own feature, not a
  variant bolted onto this one.
- Continuous integration. Deferred from spec 0003: the pre-commit hook and
  `npm run verify` are the enforcement, which means it is all local and a
  `--no-verify` commit bypasses it silently. Worth revisiting when more than one
  person commits here, or at the first bypass that reaches `main`.
