# Verify: project records and public feed index · spec 0002 · updated 2026-08-27

_Steps derived from spec 0002's acceptance criteria. `/check verify` runs these._

Only the owner side of the spec is buildable right now (build plan tasks 1 to
3). The public half, tasks 4 to 11, belongs to feature 9, so **AC-3 to AC-8,
AC-10 and AC-12 have no steps here**: they need a deployed worker and the hosted
subdomain, neither of which exists yet. They get their steps when feature 9 is
built. AC-9 is the one exception, and only in part: the owner side store can
already refuse a delete that would strand public copies, so that refusal is
checked below, while the actual withdrawal stays feature 9's.

There is no test runner on this project, on purpose. Everything below is done by
hand against a real dev server, a real browser, and the real Puter store.

## Commands

- [x] `npm run check` → typecheck passes and the SDK import scan reports that
      only `app/platform/puter.ts` imports the SDK → AC-11
      _Superseded by `npm run verify` (spec 0003), which covers both._
- [x] `npm run build` → a clean SPA build → AC-11

## UI / manual

Run these from the browser console on a signed in dev server, importing from
`~/projects/store`. The store is the owner's own Puter account, so everything
below writes to your real store; delete what you create afterwards.

_`/check verify` on 2026-08-27 first drove all thirteen steps below through the
real `store.ts`, `invariants.ts` and `record.ts` code with an in memory stand in
for `app/platform/puter.ts` (harness kept out of the repo, in the session
scratchpad). That settled the record logic, the refusals, and the plain
sentences, but not the Puter facing half. On the same day all thirteen were then
walked by hand in a browser against a signed in dev server and the real Puter
store, including the real `puter.kv`, the real network tab, the real signed out
path with no popup, and a hand corrupted `project:` key. Every step behaved as
written, so the boxes below are ticked. All test data was deleted afterwards:
`listProjects()` returns `projects: []` and `unreadable: 0`._

- [x] `createProject` with one model, then `listProjects` → the project comes
      back, with no worker call in the network tab and no second store read
      → AC-1
- [x] `createProject` three times, then `listProjects` → newest first, ordered
      with no sort field beyond the id → AC-1
- [x] `createProject` requesting both models → `renders` has a `claude` and a
      `gemini` entry, both `pending`, each with its own status, url, and
      errorCode → AC-2
- [x] `updateProject` moving only the Claude render to `running`, then to
      `failed` → the Gemini render's status, url, and errorCode are untouched
      → AC-2
- [x] `updateProject` moving a `pending` render straight to `complete` → refused
      as an illegal transition, with a plain sentence and no exception → AC-2,
      AC-14
- [x] `createProject` with an 81 character name → refused with a plain sentence
      → AC-11
- [x] `updateProject` setting `visibility: "public"` while leaving `publishedAt`
      null → refused; nothing about the project reads as published → AC-13
- [x] `updateProject` setting a `publicAssets` URL that is not an https
      `.puter.site` URL → refused → AC-11
- [x] Sign out, then call `listProjects` → the signed out sentence, no Puter
      sign in popup appears, and no raw exception reaches the console as an
      unhandled rejection → AC-14
- [x] Go offline in devtools, then call `readProject` on a real id → the
      unreachable sentence and a retry, never a raw error → AC-14
- [x] Hand-edit one `project:` key in the Puter store to a broken shape, then
      `listProjects` → that one project is skipped and reported in `unreadable`,
      and the rest of the gallery still lists → AC-1, AC-14
- [x] `deleteProject` on that same broken key → refused, the record is still in
      the store afterwards, and the sentence is the unreadable one rather than
      the "make it private first" one → AC-9, AC-14
- [x] `deleteProject` on a private, readable project → it goes, so failing
      closed on the two unsafe cases did not close the ordinary one → AC-9

## Value sourcing

One step per row of the spec's Value sourcing table that this half owns. The
rows sourced from the worker are feature 9's.

- [x] `id` is generated client side and never accepted from a caller →
      `createProject` has no way to pass one, and two ids generated in the same
      millisecond differ → AC-1
- [x] `owner` comes from the root loader's resolved user → `createProject`
      stores the username it was handed, and nothing reads a username off a
      form or a URL → AC-1
- [ ] `floorPlan.path` / `.url` come from feature 5's `puter.fs` write result,
      not composed in the browser → check once feature 5 exists
- [x] gallery ordering comes from `Project.id` → confirmed on 2026-08-27 with
      multiple sequential creates, order matched creation time with no sort
      field beyond the id. The harder variants of this row, a clock change and
      two tabs, were not walked; the id is time sortable by construction, so
      they would only catch a clock going backwards → AC-1

## Acceptance-criteria coverage

- AC-1 covered by the list, ordering, offline, and broken-record steps
- AC-2 covered by the two-model, independence, and illegal-transition steps
- AC-11 covered by `npm run check`, the name length step, and the URL shape step
- AC-13 covered by the visibility disagreement step
- AC-14 covered by the signed out, offline, illegal transition, and broken
  record steps
- AC-9's owner side half, refusing a delete that could strand public copies, is
  covered by the two `deleteProject` steps. Its other half, actually withdrawing
  the entry and the hosted files, is feature 9's.
- AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-12: feature 9, tasks 4
  to 11. No steps here yet.
