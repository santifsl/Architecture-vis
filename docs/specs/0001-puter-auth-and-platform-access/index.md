# 0001. Gate Puter behind an explicit auth fact resolved once at boot

**Date**: 2026-08-25
**Status**: Accepted

The decision history (context, the options weighed, the reasoning, and the
sources) lives beside this file in `rationale.md`. The hand walkthrough that
proves the acceptance criteria lives in `verify.md`.

## Summary

Roomify signs people in through Puter's own account popup, and never lets Puter
raise that popup by itself. At startup the app reads the answer Puter has already
worked out in the background about who the current user really is, holds that
single answer in the root route's data, and every screen reads it from there
instead of asking again. Reading the background answer rather than asking fresh
is the whole trick: asking fresh is what makes Puter throw up a login window at
someone whose session has merely expired. Puter's SDK arrives as the
`@heyputer/puter.js` npm package rather than a script tag, because the package
ships real TypeScript declarations and this project bans `any`. The same gate
that guards auth is the only way the rest of the app reaches `puter.fs`,
`puter.kv`, and `puter.workers`, so features 5, 6, and 7 inherit it instead of
each inventing their own access.

## Requirements

**User stories**:

- As a visitor, I want to browse Roomify without being interrupted by a login
  window I did not ask for, so that I can see what the tool does before
  committing to an account.
- As a signed in person, I want the app to know who I am the moment it loads, so
  that my gallery and my navigation are never wrong or flickering.
- As a signed in person, I want a session that ends mid use to be explained
  plainly rather than silently swallowing my clicks.
- As a developer, I want one typed way to reach Puter, so that features 5, 6, and
  7 do not each decide access for themselves.

**Acceptance criteria**:

- **AC-1**: On first load the app resolves the real current user before any
  screen renders, without ever raising a sign in popup. A token the server
  rejects results in a signed out interface, never a signed in one. Any
  non definitive answer (offline, a 500, a CORS failure) also resolves to signed
  out, so the app never shows a signed in interface it cannot back up.
- **AC-2**: Nothing the app does at boot or on navigation causes Puter's own sign
  in popup to appear, for a signed out visitor or for one holding an expired
  token. The popup appears only as the direct result of a person activating a
  sign in control, or as Puter's own recovery during a call that person's own
  action started (see AC-6).
- **AC-3**: Signing in updates every part of the app that displays auth state,
  with no page reload.
- **AC-4**: Signing out returns the app to the signed out state with no reload,
  and no data belonging to the previous user remains on screen.
- **AC-5**: When the browser blocks the sign in popup, a plain sentence explains
  what happened and offers a retry. When the person closes the popup themselves,
  the app returns to signed out silently, with no error shown.
- **AC-6**: When Puter invalidates the session mid use, a plain banner states
  that the session ended and offers sign in. The current page is not discarded
  and the person is not navigated away.
- **AC-7**: A route that requires sign in renders a sign in prompt in place at
  its own URL. After signing in, the real content appears at that same URL with
  no redirect.
- **AC-8**: If `VITE_PUTER_WORKER_URL` is missing at startup, the app renders a
  readable screen naming the variable and pointing at `.env.example`, rather than
  a blank page, a console trace, or a raw exception.
- **AC-9**: `npm run build` succeeds with `ssr: false`, and no Puter call runs
  during the build time root render.
- **AC-10**: `puter.fs`, `puter.kv`, and `puter.workers` are reachable only
  through the same typed accessor that enforces the gate, carrying no feature
  logic of their own.
- **AC-11**: Only the access module imports `@heyputer/puter.js`, and a violation
  fails a check rather than relying on someone noticing it in review.

## Decision

**Chosen option**: Option 3: explicit gate, verified once in the root
`clientLoader`.

Roomify resolves the real Puter user once in the root route's `clientLoader`,
exposes it as root loader data that every screen reads, drives all sign in from a
deliberate user action, and reaches every other Puter module through the same
typed accessor.

`puter.onAuthStateChanged` is still used, but as a safety net rather than the
source of truth: when the SDK's network layer drops a dead token on its own, the
listener triggers a revalidation so the router's copy cannot go stale.

**Implementation skills**: `react-router` (bundled in this repo,
`.agents/skills/react-router/`, with `references/framework-mode.md` as the
applicable mode) · `frontend-design` (Anthropic plugin, required by CLAUDE.md for
any UI work, and this feature does build visible chrome: the sign in control, the
session banner, the boot fallback, and the environment error screen)

## Feature design

**Data model sketch**:

Roomify persists nothing of its own here. Puter owns the token and its storage
entirely, and the project records that feature 3 designs are out of scope for this
spec. The model below is the in memory auth fact, held in root loader data.

```ts
type RoomifyUser = {
  readonly uuid: string;      // Puter User.uuid, stable account identifier
  readonly username: string;  // Puter User.username, the only display name Puter gives
};

type AuthState =
  | { readonly status: "signedOut"; readonly reason?: "sessionEnded" }
  | { readonly status: "signedIn"; readonly user: RoomifyUser };
```

There is deliberately no `loading` variant: `HydrateFallback` covers the boot
window, so root loader data is only ever one of the two real states. Puter's own
`User` type carries roughly fifteen further optional fields (`is_temp`,
`paid_storage`, `feature_flags`, and so on); narrowing at the boundary keeps an
over wide type out of the rest of the app. `uuid` is the key any later feature
should store as a project's owner, never `username`, which is display text.

**State transitions**:

```
signedOut ──[person activates sign in, popup succeeds]──▶ signedIn
signedIn  ──[person activates sign out]────────────────▶ signedOut
signedIn  ──[puter.auth.reauth_required event]─────────▶ signedOut (reason: "sessionEnded")
signedOut ──[successful sign in]───────────────────────▶ signedIn (reason cleared)
```

The `sessionEnded` reason exists only to drive the banner. A popup that is
blocked or closed causes no transition at all; the state stays `signedOut`.

The reason cannot be recovered by re running the boot check, because a fresh
check on a dead token returns a plain signed out with nothing distinguishing it
from a deliberate sign out. So the reauth handler sets a **one shot module level
flag**, and the loader reads it and clears it in the same pass. This is a
transient signal that exists only between the event firing and the next loader
run, not a second copy of auth state, and the invariants below are worded to
permit exactly that and nothing more.

**API surface**:

This feature exposes no HTTP endpoints. Its surface is the module boundary that
the rest of the app is allowed to touch.

| Function | Signature | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `resolveAuthState` | `() => Promise<AuthState>` | none | `AuthState` | none, this is the check | never rejects and never prompts; every failure resolves to `signedOut` |
| `signIn` | `() => Promise<SignInOutcome>` | none | `{ readonly ok: true } \| { readonly ok: false; readonly failure: SignInFailure }` | must be called from a user activation | `popup_blocked` surfaced, `auth_window_closed` swallowed to `signedOut` |
| `signOut` | `() => void` | none | void | none | none, Puter's `signOut` is synchronous and cannot fail |
| `requireUser` | `(state: AuthState) => { readonly ok: true; readonly user: RoomifyUser } \| { readonly ok: false }` | current `AuthState` | a discriminated result | signed in only | none, it throws nothing; the route renders the prompt on `ok: false` |
| `withPuter` | `<T>(fn: (p: Puter) => Promise<T>) => Promise<T>` | a function taking the SDK | its result | signed in only | rejects with the gate error when signed out, and never lets Puter prompt |
| `puterEnv` | `() => { workerUrl: string }` | none | validated config | none | throws at startup when unset, caught by the boot screen |

`signIn` returns a discriminated result rather than the resulting `AuthState`.
This was corrected during the build: both `popup_blocked` and `auth_window_closed`
land on `signedOut`, so an `AuthState` return cannot tell them apart, and AC-5
needs exactly that distinction (a blocked popup earns a plain sentence and a
retry, a closed one is the cancel it is). The resulting user still comes from one
place only, the root `clientLoader` re-running after `revalidator.revalidate()`,
so returning the outcome instead of the state adds no second path to the user.

`withPuter` is the single doorway to `puter.fs`, `puter.kv`, and
`puter.workers`. Nothing else in the app imports the SDK directly, and AC-11
makes that a lint failure rather than a review habit.

`requireUser` deliberately returns a result instead of throwing. A thrown
sentinel would have to be caught by a route `ErrorBoundary`, which replaces the
entire route subtree and would take the navbar and layout down with it, losing
most of what AC-7's in place prompt is for.

One honest limitation. `withPuter` checks `AuthState` before it calls, so a token
that dies **while a call is in flight** is not covered: the underlying `puter.fs`
or `puter.kv` request hits the same interactive `resolveReauth` policy and may
raise Puter's popup before the banner appears. Neither `puter.fs` nor `puter.kv`
exposes a per call `interactiveReauth` option to prevent it. AC-2 is therefore
scoped to boot and navigation, and this case is treated as Puter recovering a
session for somebody actively working, which is defensible, with the banner
covering a cancelled recovery. Follow-up tracks confirming whether a
non interactive option exists.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| boot check | is there a token at all | `puter.authToken`, checked first so a visitor with no token costs no request |
| boot check | is there a real signed in user | `await puter.whoamiCache_`, the promise the SDK starts at load, falling back to the `puter.whoami` value. Never `getUser()` or `whoami()`, both of which prompt on an expired token, and never `isSignedIn()`, which never asks the server |
| boot check | the signed out answer on failure | `null` from `cacheWhoami_`, which already returns `null` for a bad token and for a network failure alike, so failing closed needs no extra branch |
| boot check | `RoomifyUser.uuid` | `User.uuid` from that cached response |
| boot check | `RoomifyUser.username` | `User.username` from that cached response |
| sign in | the user shown after signing in | the root `clientLoader` re running after `revalidator.revalidate()`, not `SignInResult.username`, so one code path produces the user in both cases |
| sign in failure | which failure occurred | the rejection's `error` field, `"popup_blocked"` or `"auth_window_closed"` |
| session banner | `reason: "sessionEnded"` | the one shot module flag set by the `puter.auth.reauth_required` handler and cleared by the loader that reads it. Not re derivable from a fresh check, which is why the flag exists |
| route guard | whether this route may render | `AuthState.status` read from root loader data, never a fresh Puter call |
| boot screen | the missing variable's name | `import.meta.env.VITE_PUTER_WORKER_URL`, validated once at startup |
| every Puter call | the SDK instance | the `withPuter` accessor, which is the only module importing `@heyputer/puter.js` |

**Key invariants**:

- Exactly one module imports `@heyputer/puter.js`. Every other file reaches Puter
  through `withPuter`, enforced by lint per AC-11.
- The boot path never calls `getUser()` or `whoami()`. Both raise Puter's popup on
  an expired token. Boot reads `puter.whoamiCache_` only. `getUser()` remains fine
  **after** a deliberate user action, where a prompt is acceptable.
- `isSignedIn()` is never used as the answer to "is this person signed in". It
  may be used only as a cheap negative pre check before an action that would
  otherwise prompt.
- `resolveAuthState` never rejects and never prompts. Every failure path, 401 or
  otherwise, resolves to `signedOut`.
- No Puter access at module scope or in a render body. Only inside
  `clientLoader`, an effect, or an event handler. This is what keeps the build
  time root render safe.
- Root loader data is the only source of auth state. No component holds its own
  copy and no second store mirrors it. The single exception is the one shot
  `sessionEnded` flag, which is a transient signal consumed and cleared by the
  next loader run, never read as auth state in its own right.
- `HydrateFallback` must not render an `<Outlet/>`. React Router forbids it,
  because child routes running their own `clientLoader` cannot be guaranteed to
  have ancestor data yet. The boot fallback is therefore a standalone screen, not
  the app layout.
- `clientLoader.hydrate = true` is set explicitly on the root route. With no
  server `loader` alongside it the flag is arguably redundant, but it states the
  intent that this loader runs during initial hydration and it is harmless if
  already implied.

**Security model**:

Roomify never sees a credential. Puter's popup runs on Puter's own origin and
handles the password, any second factor, and recovery entirely; the app receives
only a token the SDK stores and attaches. There is nothing to protect on our side
and no secret to keep out of the client bundle, because Puter meters model calls
against the signed in user rather than against a key we hold. That is also why
`VITE_PUTER_WORKER_URL` is safe to ship in a client bundle: it is a public worker
address, not a credential.

The personal data handled here is a `uuid` and a `username`. No regulated data
category (payment, health, government identity) is touched, so no compliance
scope applies to this feature and no audit log is required. Feature 9 will make
projects publicly visible, and the visibility rules for that belong to its spec,
not this one.

Authorisation at this layer is a single rule: a signed in person acts only as
themselves. There are no roles, and ownership checks on projects belong to
feature 3's records.

**Configuration required**:

- `VITE_PUTER_WORKER_URL`: the deployed Puter worker that calls Claude and
  Gemini. Validated once at startup so a missing value fails immediately with a
  readable screen (AC-8) rather than at the first render request. Already
  documented in `.env.example`.

**Critical test scenarios**:

Verified by hand against a running dev server and a real browser, per CLAUDE.md's
standing decision that this project adds no test runner and no browser
automation.

Status, as of 2026-08-27: the three boot-and-sign-in scenarios below were walked
by hand in a real browser before PR #1 merged, covering the milestone 2 review
point. The dead-token case settled to signed out with no popup, which is the
result this design turns on. Tasks 5 to 7 are built, and their scenarios were
walked and passed on 2026-08-26, with the shared sign-in cases walked on
2026-08-27 once the interaction moved into `signInStore`; all of it is recorded
case by case in `verify.md`. Build tasks 8 and 9 landed on 2026-08-27 and their
commands pass; what is still open is the browser walk for the configuration
screen, the offline boot case, and the individual checks `verify.md` leaves
unticked with a reason beside each.

- **Verified.** Happy path: load the app signed out, activate sign in, complete Puter's popup,
  and confirm the navbar shows the username with no reload. Verifies **AC-2**,
  **AC-3**.
- **Verified.** Boot with a real session: reload while signed in and confirm the interface never
  shows a signed out state first. Verifies **AC-1**.
- **Verified.** Boot with a dead token: corrupt the stored Puter token in devtools, reload, and
  confirm two things, that the app settles on signed out rather than a signed in
  shell, **and that no login popup appears at any point**. This is the single most
  important scenario in this spec. It is the case `isSignedIn()` reports wrongly
  and the case `getUser()` answers correctly but with a popup, so it is the one
  that proves the whole boot mechanism. Verifies **AC-1**, **AC-2**. Walked by
  hand and passed: the app settled on signed out and no popup appeared.
- Boot offline: disconnect the network while holding a valid token, reload, and
  confirm the app settles on signed out with no hang and no raw error. Verifies
  **AC-1**.
- **Verified.** Failure case: block popups for the site, activate sign in, and confirm a plain
  sentence and a working retry appear. Then allow popups, activate sign in, close
  the popup manually, and confirm the app returns to signed out with no error
  shown. Verifies **AC-5**.
- **Verified.** Failure case: trigger a reauth condition and confirm the banner appears while
  the current page survives. Verifies **AC-6**.
- **Verified.** Auth and permission: visit a guarded route signed out, confirm a sign in prompt
  renders at that URL, sign in, and confirm the real content appears at the same
  URL with no redirect. Verifies **AC-7**.
- Configuration: unset `VITE_PUTER_WORKER_URL`, start the dev server, and confirm
  a readable screen naming the variable rather than a blank page. Verifies
  **AC-8**.
- Build: run `npm run build` and confirm it succeeds and that no Puter call runs
  during the build time root render. Verifies **AC-9**.

## Build plan

scope.md sets the delivery strategy in its own words: build a thin working slice
first, then thicken it piece by piece. That is a tracer bullet approach, so tasks
1 to 4 below are one end to end thread (SDK installed, real user resolved at
boot, real username on screen) that can be run and seen working before any of the
error handling, guarding, or environment work is written. Nothing before task 4
is worth reviewing on its own, and everything after it thickens a thread that
already runs.

1. Install `@heyputer/puter.js` and create the single access module that owns the
   import, exposing `withPuter` and the narrowing to `RoomifyUser`. No behaviour
   yet. Satisfies **AC-10**.
2. Add `resolveAuthState`: guard on `puter.authToken`, await
   `puter.whoamiCache_`, fall back to the `puter.whoami` value, and resolve every
   failure to `signedOut`. Never call `getUser()` or `whoami()` here. Satisfies
   **AC-1**.
3. Wire the root route: `clientLoader` calling `resolveAuthState`,
   `clientLoader.hydrate = true`, and a standalone `HydrateFallback` with no
   `<Outlet/>`. Satisfies **AC-1**, **AC-9**.
4. Add a minimal sign in and sign out control reading root loader data and
   calling `revalidator.revalidate()`. **The thread now runs end to end and is
   worth actually looking at in a browser.** Satisfies **AC-2**, **AC-3**,
   **AC-4**.
5. Handle the two `signIn` rejections: surface `popup_blocked` with a plain
   sentence and a retry, swallow `auth_window_closed` back to `signedOut`.
   Satisfies **AC-5**.
6. Subscribe to `puter.auth.reauth_required` and `onAuthStateChanged`. The
   handler sets the one shot `sessionEnded` flag and revalidates; the loader
   reads and clears it into `AuthState.reason`, and the banner renders from that.
   Satisfies **AC-6**.
7. Add the `requireUser` helper returning a discriminated result, and the in
   place sign in prompt a guarded route renders on `ok: false`. Satisfies
   **AC-7**.
8. **Built.** Add startup validation of `VITE_PUTER_WORKER_URL` and the readable
   boot error screen. Satisfies **AC-8**. `app/platform/env.ts` owns the check
   and `app/platform/ConfigScreen.tsx` is the screen; the root `clientLoader`
   checks configuration before it resolves auth and returns the failure as data
   rather than throwing, so the screen renders normally instead of through
   `ErrorBoundary`. One correction found while building: the check reads
   `import.meta.env.VITE_PUTER_WORKER_URL` written out in full rather than
   through a computed key, because Vite only substitutes the literal form. A
   computed read works in dev and then reports the variable missing on every
   production build.
9. **Built.** Enforce the single import rule. Satisfies **AC-11**. It landed as
   `scripts/check-sdk-import.mjs` (`npm run check:imports`) rather than a bare
   grep, because a grep also matches this project's own prose about the SDK and
   returns nothing usable as an exit code. The script matches static imports,
   re-exports, and dynamic `import()`, and was proven against a planted
   violation of each kind. The ESLint `no-restricted-imports` rule is enrolled
   on feature 2, which is what installs linting.
10. **Partly done.** Typecheck and a real production build pass, both with the
    variable set and with it unset, and the prerendered `index.html` contains
    the boot screen and no Puter call. Lint does not exist yet: feature 2
    installs it, so `npm run check` runs typecheck plus the import check for
    now. The manual browser walk is still owed; `verify.md` lists what is left.
    Satisfies **AC-9**.

Task 4 is the review point. If the thread does not work there, the plan is wrong
and should be fixed before tasks 5 to 8 are built on top of it. Passed: walked in
a real browser before PR #1 merged, so tasks 5 to 10 can build on it as planned.

## Consequences

**Positive**:

- One place answers "who is signed in", which is exactly what scope.md asked for,
  and it is the place React Router already provides for browser side boot data.
- A stale or revoked token is handled correctly by default rather than by a
  special case, because the boot check is a real server answer, and it is handled
  without a popup because that check is the SDK's non interactive one.
- The boot check adds no latency. It awaits a request the SDK already issued at
  load, so `HydrateFallback` covers work that was happening anyway.
- Features 5, 6, and 7 inherit both the gate and the typed accessor, so none of
  them re decides platform access.
- Strict TypeScript holds with no hand written declarations, since the package
  ships generated ones.

**Negative / tradeoffs**:

- The boot check depends on `puter.whoamiCache_`, an internal property typed only
  as `any`. An SDK upgrade could remove it with no breaking change notice, so
  upgrades need a deliberate check and the version is pinned. This is the single
  most fragile point in the design.
- First paint still waits for that in flight request to resolve. It costs no
  extra round trip, but `HydrateFallback` is a real screen feature 4 now owns
  rather than a spinner.
- A token that dies **while a Puter call is in flight** can still surface Puter's
  own popup, because no per call non interactive option is exposed on `puter.fs`
  or `puter.kv`. AC-2 is scoped around this rather than pretending it is solved.
- `withPuter` adds a layer of indirection around every storage, database, and
  worker call for the life of the project.
- Declining temporary accounts means every visitor must create a real Puter
  account before seeing a single render, which is a genuine funnel cost for a tool
  whose appeal is visual and immediate.
- The app now depends on a specific SDK version rather than always getting
  Puter's latest, so upgrades become a deliberate task. Given how fast Puter
  moves, this will need attention.

**Neutral**:

- `@heyputer/puter.js` becomes a real dependency, so `package.json` and the lock
  file now pin the platform SDK.
- Several behaviours this design rests on are documented nowhere except the
  package's own source. The reauth policy in particular was established by
  reading `src/lib/networkUtils.js`, not the type declarations and certainly not
  the website. The installed source is the reference on any future change.
- Feature 2 gains a task it did not have: the ESLint rule that enforces AC-11.
- The project gains its first `docs/specs/` entry, alongside the hand written
  `CLAUDE.md` and `scope.md` at the root, which is the split CLAUDE.md already
  called for.

## Follow-up

- [ ] Feature 3 must resolve how a signed out visitor reads public projects at
      all, per the premise note. `puter.kv` is scoped per user per app, so the
      community feed probably cannot be a KV read performed as the visitor.
      Investigate a hosted public index (`puter.hosting`, or a public `puter.fs`
      URL) before feature 9 is built.
- [ ] Write a project local `.agents/skills/puter/` skill mirroring the bundled
      `react-router` one, using the installed package's generated declarations at
      `node_modules/@heyputer/puter.js/types/` as its reference. The registry's
      only Puter skill (`sebfranklin/franklin-skills@puterjs`) was reviewed and
      declined: it teaches the CDN global this spec rejects, and its auth section
      omits every behaviour that shaped this design. Record the decline so it is
      not offered again.
- [ ] The single import invariant and the `isSignedIn()` prohibition belong in a
      nested context file for the Puter access area, not in root `CLAUDE.md`,
      since they only matter when working in that directory.
- [ ] CLAUDE.md's `## Context files` section is still empty and should point at
      that nested file once it exists.
- [ ] Pin the `@heyputer/puter.js` version and add `puter.whoamiCache_` to an
      upgrade checklist. It is internal, typed `any`, and the boot check depends
      on it. Verify it still exists and still passes `interactiveReauth: false`
      on every SDK bump. If it disappears, the fallback degrades to signed out,
      which is safe but wrong for signed in people, so this needs catching.
- [ ] Check whether `puter.fs`, `puter.kv`, or `puter.workers` accept a per call
      non interactive reauth option. If one exists, `withPuter` should pass it and
      AC-2 can go back to being absolute rather than scoped to boot and
      navigation.
- [ ] Add the ESLint `no-restricted-imports` rule for `@heyputer/puter.js` as a
      task on feature 2, which is what installs linting. Until then AC-11 rests
      on the grep check in build task 9.
- [ ] Confirm by hand whether Puter's popup can complete inside an embedded
      browser or a strict tracking prevention setting. It is a third party popup
      flow, so a browser that blocks it wholesale would need a fallback, and
      nothing in the docs says what happens there.
- [ ] Decide whether `getMonthlyUsage()` should surface anywhere in the product.
      Model calls are metered against the signed in person's own Puter account,
      so someone can run out of allowance mid render, and feature 6 has no plan
      for that today.
