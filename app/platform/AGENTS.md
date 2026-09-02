# Platform

## Overview

The boundary between AV and Puter. Two jobs, both small and both load
bearing: `puter.ts` is the only module in `app/` allowed to import the Puter
SDK, and `env.ts` owns the startup check that fails fast on a missing
environment variable. No feature logic lives here, only narrowing, gating, and
non interactive reads.

## Key files

| File               | Owns                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `puter.ts`         | The sole `@heyputer/puter.js` import, `withPuter`, the narrowed `AvUser`, sign in and sign out, session event subscriptions |
| `env.ts`           | `checkPuterEnv` and `puterEnv`, the `VITE_PUTER_WORKER_URL` requirement                                                     |
| `ConfigScreen.tsx` | The readable screen shown when a required variable is missing                                                               |

## Conventions

- Every `puter.fs`, `puter.kv`, and `puter.workers` call in the app goes through
  `withPuter`. It rejects with `PuterGateError` when no token is held, so a
  gated call can never be what triggers Puter's implicit sign in flow.
- ESLint enforces the single import, not care. `no-restricted-imports` plus a
  `no-restricted-syntax` selector for the dynamic `import()` form, with a per
  file override for `puter.ts` itself. `scripts/deploy-worker.mjs` has its own
  override because it imports the Node entry point (`src/init.cjs`), which takes
  a token instead of reading one out of a browser.
- SDK values cross into the app as `unknown` and are proven, never asserted.
  `toAvUser` narrows rather than casts.
- Failures resolve to a result, they do not throw. `openSignIn` returns a
  failure code so a blocked popup is an ordinary outcome.

## Gotchas

- **Never call `getUser()` or `whoami()` on the boot path.** Both route a 401
  through a reauth policy whose `interactive` flag defaults to true, so both
  raise Puter's login popup on an expired token. `readCurrentUser` awaits
  `puter.whoamiCache_` instead, the promise the SDK already started at load with
  `interactiveReauth: false`, which is why the boot check costs no extra round
  trip.
- **`isSignedIn()` is never the answer to "is this person signed in".** It only
  probes local storage and never asks the server. It is used solely as a cheap
  negative pre check in front of a call that would otherwise prompt.
- **`whoamiCache_` is SDK internal** (trailing underscore, typed `any`). The
  chained fallback to `puter.whoami` is what keeps an SDK upgrade that removes
  it degrading to signed out rather than crashing.
- **Read every env variable as a written out literal.** Vite only substitutes
  `import.meta.env.VITE_NAME` spelled in full; a dynamic `import.meta.env[name]`
  works in dev and then reads `undefined` in a production build, which would
  report every variable missing on the deployed site. Adding a variable means
  adding a line to the `switch` in `read`.
- `withPuter` does not cover a token that dies **while a call is in flight**.
  Neither `puter.fs` nor `puter.kv` exposes a per call non interactive option,
  which is why spec 0001's AC-2 is scoped to boot and navigation.

## Related specs

- [0001 Puter auth and platform access](../../docs/specs/0001-puter-auth-and-platform-access/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
