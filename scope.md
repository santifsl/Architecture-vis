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

| #   | Feature                                        | Phase      | Status      |
| --- | ---------------------------------------------- | ---------- | ----------- |
| 1   | Connecting to Puter                            | Foundation | done        |
| 2   | Coding standards & tooling                     | Foundation | done        |
| 3   | Data model                                     | Foundation | done        |
| 4   | Design & look                                  | Foundation | done        |
| 5   | Upload & host a floor plan                     | Slice 1    | not started |
| 6   | Create a project & generate the 3D render      | Slice 1    | not started |
| 7   | App shell & project gallery                    | Slice 2    | not started |
| 8   | Side-by-side comparison view                   | Slice 3    | not started |
| 9   | Public/private visibility & the community feed | Slice 4    | not started |
| 10  | Export                                         | Slice 4    | not started |

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
  generic clock-and-author line: which model rendered it (Claude, Gemini, or
  both), or a small before/after thumbnail pair.

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
      rather than a look. **Closed 2026-08-28 with 34 of 47 steps run and passing
      and 13 waived.** Everything a command can decide was exercised and recorded
      in `verify.md`, including both contrast reverts, all twelve planted lint
      violations, and the guard audit showing no `disabled={` left in any JSX. The
      13 waived steps are the rest of the browser walk: the visual states, the
      keyboard pass, and the nine screen review. They were not run, and they stay
      unticked in `verify.md` rather than being claimed. This feature is `done` on
      the engineer's call, not because that walk passed. The one step that was
      pulled back out of the waiver and actually done is the double-fire check,
      which Santiago ran by hand: exactly one sign in call across a second click,
      `Enter` and `Space`. That was the right one to insist on, because it is the
      only one whose failure is invisible. `aria-disabled` does not block a click,
      so a regressed guard fires sign in two or four times and nothing on screen
      looks wrong. `createSingleFlight` holds it, now confirmed by observation

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
