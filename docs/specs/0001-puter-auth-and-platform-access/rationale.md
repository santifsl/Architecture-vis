# 0001 · Rationale: gate Puter behind an explicit auth fact resolved once at boot

**Date**: 2026-08-25

Why this decision was made, and what it was weighed against. The build spec
itself is in `index.md`.

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
