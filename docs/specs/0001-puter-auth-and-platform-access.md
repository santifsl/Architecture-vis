# 0001. Gate Puter behind an explicit auth fact resolved once at boot

**Date**: 2026-08-25
**Status**: In Progress

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

## Context

> ⚠️ Premise note: feature 9 promises a community feed that anyone can browse
> with no account, but every Puter call carries the signed in user's token and
> `puter.kv` is scoped per user per app. That is why `puter.perms` exists at all:
> one app reaching another app's data for a user needs an explicit grant. A
> visitor with no token is not a reader with reduced permissions, they are a
> caller with no credentials, so there is no obvious path by which they read
> anybody's KV records. This does not change the decision here (the explicit gate
> is right either way, and it is what keeps a signed out visitor from being
> ambushed by a popup) but feature 3 will hit it directly when it designs "how
> the feed finds public projects". Resolve it there before feature 9 is built.
> The likely escape hatch is that a public feed index is a **hosted artifact**
> (`puter.hosting`, or a file with a public `puter.fs` URL) that anonymous
> visitors fetch over plain HTTP, rather than a KV read performed as the visitor.
> Treat that as the thing to verify, not as settled.

Roomify has no backend. Puter is auth, permanent file storage, the key value
database, and the worker that calls Claude and Gemini, all reached from the
browser. So "is someone signed in" is not one screen's concern, it is the
precondition for nearly every capability the product has, and scope.md is
explicit that it must be a fact the navbar, the gallery, and the create project
flow can trust without re checking it in five places.

Three properties of the actual SDK shape this, and two of them are not in
Puter's published documentation. They were read from the generated type
declarations in `@heyputer/puter.js` 2.6.2.

First, `puter.auth.isSignedIn()` is synchronous and only reports whether a token
exists in storage. It never asks the server. A token that has been revoked, has
expired, or was minted against a different origin still reads `true`. Anything
that treats it as the answer will confidently render a signed in interface for
somebody who is not signed in.

Second, Puter authenticates implicitly. The `signIn` declaration states plainly
that a `puter.*` call finding no token triggers the sign in flow on its own. So
a single stray `puter.kv.get()` anywhere in the app opens a login window at a
moment nobody asked for one. On a product whose feed is meant to be public, that
is not a small annoyance.

The implicit path is worse than the declaration suggests, and this is the force
that most shapes the design. Reading the SDK source rather than the docstrings:
both `puter.auth.getUser()` and `puter.auth.whoami()` route a 401 through a
shared `resolveReauth` policy whose `interactive` parameter defaults to `true`,
and neither opts out. On a stale or revoked token that policy calls
`triggerReauth()`, which drives the login popup. A visitor with **no** token is
safe, because both throw `401` locally before any request is made. But a visitor
returning with an **expired** session is exactly the person a naive boot check
ambushes, and they are also the single most likely kind of returning visitor.

Exactly one path is built to be safe here. `cacheWhoami_()` passes
`interactiveReauth: false`, returns `null` on a bad token or a network failure,
and its own comment gives the reason: it runs on every page load without the user
asking, so a stale token must not raise sign in UI. The SDK already starts it at
load and parks the promise on `puter.whoamiCache_`. That property is internal,
which is a real cost, and it is weighed in the Rationale.

Third, the delivery constraint. The app is a static SPA (`ssr: false`), and
React Router still renders the root route at build time in Node to produce
`index.html`. A root `loader` therefore runs at build time and is useless for
asking who is signed in. Only `clientLoader` runs in the browser, and any Puter
access during the build time render would break the build.

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

## Options considered

### Option 1: Let Puter authenticate implicitly

Write no gating code at all. Call `puter.kv` or `puter.fs` wherever needed and
let Puter raise its sign in popup whenever a call finds no token.

**Pros**:

- Almost no code. The SDK already does the whole job.
- Impossible to forget a gate, because there is no gate to forget.

**Cons**:

- A visitor who merely loads a page that touches Puter gets a login window they
  did not request, which directly breaks feature 9's no account browsing.
- The sign in moment is decided by whichever call happens to run first, so it is
  effectively unpredictable and moves as the code changes.
- Nothing establishes a trustworthy auth fact, so screens still each end up
  asking, which is the exact problem scope.md names.

### Option 2: Trust `isSignedIn()` optimistically, correct afterwards

Gate on the synchronous boolean, paint immediately, and repair the interface once
the real user resolves in the background.

**Pros**:

- Fastest possible first paint, with no boot round trip.
- The check is synchronous, so it composes trivially anywhere.

**Cons**:

- The boolean does not mean what it appears to mean. A stale or revoked token
  renders a signed in navbar and a gallery shell that then snap back, which is
  worst exactly where this product shows most of its state.
- The repair path is a second code path that only runs in the failure case, so it
  is the least exercised and most likely to rot.

### Option 3: Explicit gate, verified once in the root `clientLoader` (chosen)

Resolve the real user in the root route's `clientLoader` by awaiting the
non interactive check the SDK already started, cover that moment with
`HydrateFallback`, and expose the result as root loader data that every screen
reads. Sign in and sign out are deliberate actions that revalidate that data.
Every Puter call sits behind the resulting gate.

**Pros**:

- One source of truth, resolved once, in the one place React Router provides for
  browser side boot data.
- No unbidden popup is possible at boot, because the check used is the SDK's own
  non interactive one.
- Uses the router's own data flow, so there is no parallel store to drift.
- Correct by construction for a stale token, since the check is a real server
  answer rather than a storage probe.
- Costs no extra round trip, because the SDK already starts this request at load
  and the loader only awaits a promise that is already in flight.

**Cons**:

- Depends on `puter.whoamiCache_`, an internal property, so an SDK upgrade could
  remove it without it being a documented breaking change.
- Every new Puter call has to be routed through the accessor, which needs a lint
  rule to hold (AC-11).

### Option 4: A module store driven by `onAuthStateChanged`

Hold auth state in a small immutable store subscribed to
`puter.onAuthStateChanged`, read through `useSyncExternalStore`.

**Pros**:

- The subscribe and unsubscribe signature matches `useSyncExternalStore` exactly,
  so the wiring is unusually clean.
- Reacts instantly to a token change with no refetch.

**Cons**:

- Runs alongside the router's own data flow, so the same fact lives in two places
  and can disagree during a navigation.
- Boot still needs a separate resolution step, so it does not actually remove the
  `clientLoader`, it adds to it.

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

## Rationale

Using an internal property is a real compromise and deserves stating plainly.
`puter.whoamiCache_` carries a trailing underscore, is marked `@internal`, and is
typed only as `any`, so nothing stops an SDK upgrade removing it quietly. It is
still the right call, because the alternatives are worse in ways that matter
more: the published methods (`getUser`, `whoami`) provably raise a login popup on
an expired token, and a token presence check cannot tell a live session from a
revoked one. The mitigations are cheap and specific: pin the SDK version, chain a
fallback so a missing property degrades to signed out rather than crashing, and
treat this as an upgrade checklist item. A boot check that is merely wrong on
upgrade is recoverable; one that ambushes returning visitors with a popup is a
defect nobody will report, they will just leave.

The three forces in Context each rule out an option on their own. Implicit
authentication (Option 1) is disqualified by feature 9's public feed, because the
one thing it guarantees is a popup nobody asked for. `isSignedIn()` not asking
the server disqualifies Option 2, because the fast path it buys is paid for with
a wrong interface in precisely the case that matters, and a repair path that
almost never runs. Between the two honest options, the root `clientLoader`
(Option 3) beats the module store (Option 4) not because the store is badly built
but because it does not remove any work: boot still needs resolving, so the store
is added alongside the loader rather than instead of it, and two copies of one
fact is the thing scope.md asked to avoid.

The npm package over the CDN script tag follows from the project's own rules
rather than preference. CLAUDE.md bans `any`, and the CDN delivers an untyped
global that would have to be described by a hand written declaration file kept in
sync with a fast moving SDK by hand. The package ships generated declarations
derived from the source, pins a reviewable version, and was verified to import
cleanly under Node (`env` resolves to `nodejs`, nothing touches `window`), which
is what makes it safe for the build time root render. That the published tutorials
all show the script tag is a documentation convention, not a technical constraint.

Declining temporary accounts is a product judgement, not a technical one. Puter
will happily mint one via `signIn({ attempt_temp_user_creation: true })`, and for
a visual tool the softer funnel is genuinely tempting. But a Roomify project owns
hosted files and a permanent public URL, and a personal gallery and a community
feed both assume a durable owner. A temporary account that evaporates leaves
hosted renders with no one to attribute or delete them, which is a data problem,
not a signup problem.

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

- Happy path: load the app signed out, activate sign in, complete Puter's popup,
  and confirm the navbar shows the username with no reload. Verifies **AC-2**,
  **AC-3**.
- Boot with a real session: reload while signed in and confirm the interface never
  shows a signed out state first. Verifies **AC-1**.
- Boot with a dead token: corrupt the stored Puter token in devtools, reload, and
  confirm two things, that the app settles on signed out rather than a signed in
  shell, **and that no login popup appears at any point**. This is the single most
  important scenario in this spec. It is the case `isSignedIn()` reports wrongly
  and the case `getUser()` answers correctly but with a popup, so it is the one
  that proves the whole boot mechanism. Verifies **AC-1**, **AC-2**.
- Boot offline: disconnect the network while holding a valid token, reload, and
  confirm the app settles on signed out with no hang and no raw error. Verifies
  **AC-1**.
- Failure case: block popups for the site, activate sign in, and confirm a plain
  sentence and a working retry appear. Then allow popups, activate sign in, close
  the popup manually, and confirm the app returns to signed out with no error
  shown. Verifies **AC-5**.
- Failure case: trigger a reauth condition and confirm the banner appears while
  the current page survives. Verifies **AC-6**.
- Auth and permission: visit a guarded route signed out, confirm a sign in prompt
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
8. Add startup validation of `VITE_PUTER_WORKER_URL` and the readable boot error
   screen. Satisfies **AC-8**.
9. Enforce the single import rule. Add the check now as a grep over `app/` for
   `@heyputer/puter.js` outside the access module, and enroll the ESLint
   `no-restricted-imports` rule as a task on feature 2, which is what installs
   linting. Satisfies **AC-11**.
10. Run typecheck, lint, and a real production build, and walk the manual
    scenarios above in a browser. Satisfies **AC-9**.

Task 4 is the review point. If the thread does not work there, the plan is wrong
and should be fixed before tasks 5 to 8 are built on top of it.

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

## References

**Project sources**:

- `CLAUDE.md`: strict TypeScript with no `any`, the ban on showing a raw
  exception, the requirement to fail fast on a missing `VITE_PUTER_WORKER_URL`,
  the accessibility baseline, and the standing decision to add no test runner.
- `scope.md`: feature 1's framing (decide the auth shape once, then wire the rest
  alongside it), the static SPA deployment section, and the thin slice first build
  approach that orders the build plan.
- `.agents/skills/react-router/references/framework-mode.md`: the bundled skill
  identifying this app as framework mode.
- `node_modules/react-router/docs/how-to/spa.md`: that a root `loader` in SPA
  mode runs at build time, and that `clientLoader` plus `HydrateFallback` is the
  browser side alternative.
- `node_modules/react-router/docs/explanation/hydration.md`: that `HydrateFallback`
  cannot render an `<Outlet/>`.
- `node_modules/@heyputer/puter.js/types/modules/Auth.d.ts` (version 2.6.2): the
  authoritative shape of `signIn`, `isSignedIn`, `getUser`, `whoami`, the `User`
  fields, and both `signIn` rejection codes.
- `node_modules/@heyputer/puter.js/types/index.d.ts` (version 2.6.2):
  `onAuthStateChanged`, the `puter.auth.reauth_required` event, `cacheWhoami_`,
  and `dropStaleAuthToken`.
- `node_modules/@heyputer/puter.js/src/lib/networkUtils.js` (version 2.6.2): the
  `resolveReauth` policy, its `interactive = true` default, and
  `resolveBackgroundReauth`. This is the file that establishes that `getUser()`
  and `whoami()` both prompt on an expired token, and it is stated nowhere else.
- `node_modules/@heyputer/puter.js/src/lib/utils.js` and
  `src/modules/Auth.js` (version 2.6.2): that both the XHR and `fetchUrl` paths
  share that one policy, and that neither `getUser` nor `whoami` opts out of it.
- `node_modules/@heyputer/puter.js/src/index.js` (version 2.6.2): that
  `cacheWhoami_()` passes `interactiveReauth: false`, returns `null` on failure,
  and is started at load with its promise parked on `puter.whoamiCache_`.

**Practices & standards**:

- Use the platform's own authentication rather than building one. Puter is
  already the backend, so its auth is the aligned choice and no credential
  handling enters this codebase.
- Resolve a session once at a boundary and pass it down, rather than re checking
  it at each consumer.
- Narrow an external type at the boundary instead of passing a wide vendor type
  through an application.
- Treat a deliberate cancel as a cancel, not an error.

**Links** (web verified during this session):

- Puter Auth API reference: https://docs.puter.com/Auth/
- Puter authentication guide: https://developer.puter.com/auth/
- Puter getting started, covering both the npm package and the CDN script tag:
  https://docs.puter.com/getting-started/
