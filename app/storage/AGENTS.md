# Storage

## Overview

View URLs for privately stored Puter files, minted on demand and cached for the
life of the page. It exists because a path is the durable identifier and a URL is
not: `getReadURL` expires, so a URL stored beside a path would go stale on a
timer and show up as a gallery of broken images a day later, a long way from its
cause.

## Key files

| File                        | Owns                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| `urls.ts`                   | The mint, the promise cache, `forgetStoredUrl` and `forgetAllStoredUrls` |
| `useStoredUrl.ts`           | The React half: `url`, `failed`, and `retry`                             |
| `useForgetUrlsOnSignOut.ts` | Empties the cache on sign out, mounted by `ConfiguredApp` in `root.tsx`  |

## Conventions

- Nothing here is ever persisted. The cache is module scope and must not outlive
  the page, because it holds URLs that read a private file with no
  authentication.
- The cached value is the in flight **promise**, not the resolved string. A
  project page asks for renders at once and a gallery asks for many, so several
  callers want the same uncached path in the same tick; caching the resolved
  value would make them all miss and all mint.
- A failed mint is never cached, so one flaky network moment cannot leave an
  image broken for the rest of the session.
- Every failure carries a `retry`, per CLAUDE.md's rule that a failure is always
  a sentence **and** an action.

## Gotchas

- **`URL_LIFETIME` is 1h and `CACHE_LIFETIME_MS` is 50 minutes, and the gap is
  the point.** Serving an entry right up to its expiry would let a URL reach an
  `<img>` a second before it died, and the failure would look like a broken image
  rather than an expired link.
- **The failure eviction only removes its own entry.** A file deleted mid mint
  purges the cache, and a later caller can have minted a fresh URL into the same
  key by then; deleting unconditionally would throw that good entry away.
- **The purge on sign out belongs in the root layout, not a feature.** It used to
  be called from `usePlanUpload`, which is mounted on the home screen only, so
  signing out from `/project/:id` left the cache full. On a shared browser the
  next account opening the same path within the cache lifetime would have been
  handed the previous account's floor plan or render.
- **`useStoredUrl`'s `failed` flag must stay resettable.** It was once written
  only to `true`, with the resetting effect keyed on `[path]` alone, so a path
  that never changes (which is every path here) meant one failure lasted the life
  of the component. The reset lives in an event handler and bumps an attempt
  counter in the effect deps, rather than being a synchronous `setState` in an
  effect body.

## Related specs

- [0005 Upload and host a floor plan](../../docs/specs/0005-upload-and-host-a-floor-plan/index.md), where the mint started
- [0006 Create a project and render](../../docs/specs/0006-create-a-project-and-render/index.md), build task 4, where it moved here

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
