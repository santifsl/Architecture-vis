# Verify: project records and public feed index · spec 0002 · updated 2026-08-27

_Steps derived from spec 0002's acceptance criteria. `/check verify` runs these._

Only the owner side of the spec is buildable right now (build plan tasks 1 to
3). The public half, tasks 4 to 11, belongs to feature 9, so **AC-3 to AC-10 and
AC-12 have no steps here**: they need a deployed worker and the hosted
subdomain, neither of which exists yet. They get their steps when feature 9 is
built.

There is no test runner on this project, on purpose. Everything below is done by
hand against a real dev server, a real browser, and the real Puter store.

## Commands

- [ ] `npm run check` → typecheck passes and the SDK import scan reports that
      only `app/platform/puter.ts` imports the SDK → AC-11
- [ ] `npm run build` → a clean SPA build → AC-11

## UI / manual

Run these from the browser console on a signed in dev server, importing from
`~/projects/store`. The store is the owner's own Puter account, so everything
below writes to your real store; delete what you create afterwards.

- [ ] `createProject` with one model, then `listProjects` → the project comes
      back, with no worker call in the network tab and no second store read
      → AC-1
- [ ] `createProject` three times, then `listProjects` → newest first, ordered
      with no sort field beyond the id → AC-1
- [ ] `createProject` requesting both models → `renders` has a `claude` and a
      `gemini` entry, both `pending`, each with its own status, url, and
      errorCode → AC-2
- [ ] `updateProject` moving only the Claude render to `running`, then to
      `failed` → the Gemini render's status, url, and errorCode are untouched
      → AC-2
- [ ] `updateProject` moving a `pending` render straight to `complete` → refused
      as an illegal transition, with a plain sentence and no exception → AC-2,
      AC-14
- [ ] `createProject` with an 81 character name → refused with a plain sentence
      → AC-11
- [ ] `updateProject` setting `visibility: "public"` while leaving `publishedAt`
      null → refused; nothing about the project reads as published → AC-13
- [ ] `updateProject` setting a `publicAssets` URL that is not an https
      `.puter.site` URL → refused → AC-11
- [ ] Sign out, then call `listProjects` → the signed out sentence, no Puter
      sign in popup appears, and no raw exception reaches the console as an
      unhandled rejection → AC-14
- [ ] Go offline in devtools, then call `readProject` on a real id → the
      unreachable sentence and a retry, never a raw error → AC-14
- [ ] Hand-edit one `project:` key in the Puter store to a broken shape, then
      `listProjects` → that one project is skipped and reported in `unreadable`,
      and the rest of the gallery still lists → AC-1, AC-14

## Value sourcing

One step per row of the spec's Value sourcing table that this half owns. The
rows sourced from the worker are feature 9's.

- [ ] `id` is generated client side and never accepted from a caller →
      `createProject` has no way to pass one, and two ids generated in the same
      millisecond differ → AC-1
- [ ] `owner` comes from the root loader's resolved user → `createProject`
      stores the username it was handed, and nothing reads a username off a
      form or a URL → AC-1
- [ ] `floorPlan.path` / `.url` come from feature 5's `puter.fs` write result,
      not composed in the browser → check once feature 5 exists
- [ ] gallery ordering comes from `Project.id` → create projects across a clock
      change or in two tabs and confirm the order still matches creation time
      → AC-1

## Acceptance-criteria coverage

- AC-1 covered by the list, ordering, offline, and broken-record steps
- AC-2 covered by the two-model, independence, and illegal-transition steps
- AC-11 covered by `npm run check`, the name length step, and the URL shape step
- AC-13 covered by the visibility disagreement step
- AC-14 covered by the signed out, offline, illegal transition, and broken
  record steps
- AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-12: feature 9, tasks 4
  to 11. No steps here yet.
