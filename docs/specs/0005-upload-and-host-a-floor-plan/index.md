# 0005. Upload and host a floor plan

**Date**: 2026-08-28
**Status**: In Progress

## Summary

Someone picks a floor plan image, it goes into their own Puter storage, and the
rest of the app gets a stable way to point at it. The scope said `puter.fs`
returns a permanent public URL. It does not: the write returns no URL at all,
and the only anonymous URL the SDK offers expires, by default in a day. So this
feature stores the file **path**, which never expires, and mints a short lived
view URL whenever a screen actually needs to show the image. Feature 5 writes no
project record and touches no database; it hands back a hosted plan and stops
there, and feature 6 creates the project.

## Requirements

**User stories**:

- As someone with a floor plan, I want to drop it onto the home screen and see
  it appear, so that I know it really uploaded before I spend a render on it.
- As someone who picked the wrong file, I want to be told which rule it broke
  and what to do instead, so that I can fix it without guessing.
- As someone who is not signed in yet, I want picking a file to start the sign
  in rather than throw my choice away, so that I do not do the same work twice.
- As someone browsing my gallery months later, I want my floor plans to still
  display, so that a project does not quietly rot into a broken image.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: A signed in person can choose a `PNG`, `JPEG`, or `WebP` of at most
  10 MB, by file picker or by drag and drop, and it is written into their own
  Puter filesystem. The call returns the stored path.
- **AC-2**: The stored path is `plans/<id>-<sanitised-name>.<ext>`, where `<id>`
  is a fresh time sortable id. Two uploads of the same filename never collide,
  and `dedupeName` is not used, so the path written is exactly the path asked
  for and never one the server renamed. The extension comes from the validated
  type by a fixed map, `image/png` to `.png`, `image/jpeg` to `.jpg`,
  `image/webp` to `.webp`, never from the supplied filename. The sanitised name
  lowercases, replaces every run of characters outside `[a-z0-9]` with a single
  `-`, trims leading and trailing `-`, caps the result at 40 characters, and
  falls back to `plan` when nothing survives, so an emoji only filename still
  produces a legal path.
- **AC-3**: No read URL is ever stored. `FloorPlan` carries `path` only. A URL
  is minted on demand and nothing persists it, not in `puter.kv`, not in
  `localStorage`, not in a project record.
- **AC-4**: A view URL is minted with `getReadURL(path, "1h")` and cached in
  memory, keyed by path, for the life of the page. The cache holds the in
  flight **promise**, not the resolved string, so two callers asking for the
  same uncached path in the same tick make one network call between them, which
  is the case feature 7's gallery will actually produce. An entry is treated as
  stale after 50 minutes, a deliberate 10 minute margin inside the real expiry
  so a URL handed out is never about to die. An entry is purged when its file is
  deleted or replaced. A reload mints again.
- **AC-5**: A file that is the wrong type or over 10 MB is rejected **before**
  `puter.fs` is called, and the person sees a plain sentence naming the rule it
  broke and what to do instead. The rejected file never reaches the network.
- **AC-6**: Before any write, available space is read with `puter.fs.space()`.
  If the file will not fit, the upload is refused in our own words and `write`
  is never called, so Puter's own usage dialog does not appear.
- **AC-7**: If a write still fails because space ran out between the check and
  the write, the person sees our own sentence. Puter's own dialog may appear on
  that path and cannot be suppressed; this is a recorded limit, not a defect.
- **AC-8**: While uploading, the card shows real progress driven by `write`'s
  `progress` callback, drawn as the spec 0004 busy hairline with its width bound
  to the reported fraction. No spinner and no second hue appears. Under
  `prefers-reduced-motion` the bar still updates but does not animate between
  values.
- **AC-9**: After a successful write, the preview `img` loads from a minted read
  URL, not from a local object URL. A write that reported success but did not
  land shows a broken preview here rather than passing silently to feature 6.
  The image's `alt` is the filename the person picked, so a failed load is still
  described to a screen reader rather than being a silent gap.
- **AC-10**: Replace picks and validates the new file **first**, and only once
  it has passed validation and the space check is the previous file deleted and
  the new one written. Ordering it this way means a cancelled pick or a rejected
  file leaves the existing plan untouched, rather than deleting what the person
  had and leaving them with nothing. If the delete fails the upload still
  proceeds and the person is not told, because a stray file is not their
  problem. A delete of a path that is already gone counts as success, since the
  goal state is that the file is not there.
- **AC-11**: A signed out visitor sees the real upload card. Choosing a file
  raises the existing sign in flow, the chosen file is held, and the upload
  starts on its own once the auth state resolves. Cancelling sign in leaves the
  file held and the card idle, with nothing uploaded.
- **AC-12**: The card meets the accessibility baseline: a real
  `<input type="file">` is the primary control and is reachable and operable by
  keyboard alone, focus is visible on every control, and drag and drop is an
  enhancement that is never the only way in.
- **AC-13**: No raw exception, provider error, HTTP status, or SDK error code
  reaches the screen. Every failure is one of a fixed set of plain sentences.
- **AC-14**: Feature 5 writes nothing to `puter.kv`. No project record is
  created or updated. The only thing it produces is a `FloorPlan` value.
- **AC-15**: The upload card is a single component instance that renders in the
  same place whether or not anyone is signed in. It is never swapped for another
  subtree, and never wrapped in a guard that unmounts it, because the held file
  in AC-11 lives in its state and a remount would silently discard it.
- **AC-16**: While the space check, the upload, or a delete is running, the drop
  zone and the file input accept nothing. A second pick or a second drop in
  those states is ignored, so no upload can start on top of another.
- **AC-17**: If the card unmounts while a write is in flight, the write is
  cancelled rather than left running. The handle comes from `write`'s `init`
  callback, which is handed the underlying `XMLHttpRequest` whose `abort` the
  SDK overrides to cancel the signed upload. It is **not** `write`'s `abort`
  option, which this spec first named in error: that one is a notification fired
  after a cancellation completes, typed `(operationId: string) => void`, so it
  reports a cancellation and cannot cause one. Corrected during the build. A
  partial file may still remain, which is recorded as a known leak.
- **AC-18**: Signing out clears the card and the URL cache. The preview, the
  hosted plan, any held file, and every minted URL in memory are dropped the
  moment the auth fact stops being signed in, and a write still in flight is
  cancelled and abandoned without writing a notice. Added during the build,
  after review: neither sign-out path reloads the page, so without this the card
  keeps rendering a preview whose `src` is an anonymous read URL that needs no
  session and stays live for the rest of its hour, and the next person on a
  shared browser inherits it. This covers a deliberate sign out and Puter ending
  the session itself, since both arrive as the same change in the auth fact.

## Decision

**Chosen option**: Option 2: store the path, mint view URLs on demand.

A hosted floor plan is identified by its `puter.fs` path, which never expires,
and any screen that needs to display it mints a one hour read URL at render
time and caches it in memory for the session.

**Implementation skills**: `react-router` (bundled with this project,
`.agents/skills/react-router/`) · `frontend-design`
(`anthropics/claude-plugins-official`,
`.claude/plugins/cache/claude-plugins-official/frontend-design/`)

## Feature design

**Data model sketch**:

This feature changes one shipped type and adds no persisted entity of its own.

| Type               | Field                    | Required | Change                                                                      |
| ------------------ | ------------------------ | -------- | --------------------------------------------------------------------------- |
| `FloorPlan`        | `path`                   | yes      | unchanged, the `puter.fs` path                                              |
| `FloorPlan`        | ~~`url`~~                | removed  | **breaking**, spec 0002 declared it; it cannot be stored because it expires |
| `PlanUrlCache`     | `path → {url, mintedAt}` | n/a      | in memory only, module scope, never persisted, dies with the page           |
| `UploadState` (UI) | see below                | n/a      | component state, never stored                                               |

`PublicAssets.floorPlanUrl` is **not** touched. That is the permanent hosted
copy the worker writes at publish time, and spec 0002 is right about it.

**State transitions**:

The upload card's state machine. `held` is the state that makes AC-11 work.

```
idle ──pick/drop──> validating ──reject──> idle (with a sentence)
                         │
                         ├──ok, signed out──> held ──sign in ok──> checkingSpace
                         │                      └──sign in cancelled──> held (idle card)
                         └──ok, signed in ───────────────────────────> checkingSpace

checkingSpace ──will not fit──> idle (with a sentence)
              └──fits────────> uploading(0..1) ──ok──> hosted
                                      └──fail──> idle (with a sentence)

hosted ──replace──> validating(new)   (the SAME validating state above)
                         ├──reject/cancel──> hosted  (existing plan untouched)
                         └──ok──> checkingSpace ──fits──> deleting(old)
                                                              │
                                                 ──> uploading(0..1) ──> hosted
```

Three rules the machine depends on:

- **The busy states are inert to input.** `checkingSpace`, `uploading` and
  `deleting` accept no pick and no drop (AC-16). Without that, a second drop
  onto the zone mid upload starts a parallel write and the two race to be the
  `hosted` result.
- **Replace validates before it destroys.** The old file is deleted only after
  the new one passes validation and the space check, so a cancelled picker or a
  rejected file returns to `hosted` with the existing plan intact (AC-10).
  Deleting first would mean someone who picks a `.tiff` by mistake loses the
  plan they already had.
- **Unmounting mid write aborts it** (AC-17), so navigating away does not leave
  a write running against a component that is gone.

**API surface**:

There is no HTTP surface. This is a client only SPA and the feature is a module,
so the surface is its exported functions. All of them go through `withPuter`.

| Function                            | Inputs                                                 | Key outputs                           | Auth       | Key errors                                                     |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------- | ---------- | -------------------------------------------------------------- |
| `validatePlanFile(file)`            | `file: File`                                           | `{ok: true}` or `{ok: false, reason}` | none, pure | `wrongType`, `tooLarge`, `notAnImage`                          |
| `uploadFloorPlan(file, onProgress)` | `file: File`, `onProgress: (fraction: number) => void` | `UploadResult<FloorPlan>`             | signed in  | `signedOut`, `noSpace`, `unreachable`, `writeFailed`           |
| `readPlanUrl(path)`                 | `path: string`                                         | `UploadResult<string>`                | signed in  | `signedOut`, `unreachable`, `missing`                          |
| `deletePlan(path)`                  | `path: string`                                         | `UploadResult<void>`                  | signed in  | `signedOut`, `unreachable`; a path already gone is **success** |
| `usePlanUpload()`                   | none                                                   | `{state, pick, notice}`               | n/a        | n/a, it surfaces the above as state                            |

`pick(file: File)` is the single entry point for both the first upload and a
Replace. There is deliberately no separate `replace(file)`: the only difference
is whether the machine is in `idle` or `hosted` when the file arrives, and
modelling it once is what stops the two flows drifting apart. The card's Replace
control opens the same file input.

`uploadFloorPlan` is an event handler path, not a React Router `clientAction`.
A `clientAction` receives a resolved `FormData` and gives no access to the
underlying `XMLHttpRequest`, so the `progress` callback AC-8 needs would be
unreachable through it.

**Value sourcing**:

| Action           | Value produced / displayed         | Source                                                                           |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| upload           | the stored `path`                  | built here: `plans/` + a fresh id from `newProjectId()` + a sanitised filename   |
| upload           | the file extension in the path     | derived from the validated MIME type, never from the user supplied filename      |
| upload           | the sanitised name in the path     | derived from `File.name`, lowercased, non `[a-z0-9.]` collapsed to `-`           |
| upload           | progress fraction                  | `write`'s `progress(operationId, fraction)` callback                             |
| upload           | available bytes                    | `puter.fs.space()`, read immediately before the write                            |
| upload           | the owner the plan belongs to      | implicit, it is the caller's own filesystem; no owner value is produced here     |
| preview          | the `img src`                      | `getReadURL(path, "1h")`, minted on demand, cached by path in memory             |
| preview          | the displayed filename             | `File.name` as picked, held in component state; never re read from the path      |
| validate         | the max size                       | decided here, 10 MB, a module constant                                           |
| validate         | the allowed types                  | decided here, `image/png`, `image/jpeg`, `image/webp`, a module constant         |
| validate         | "is this really an image"          | `createImageBitmap(file)` resolving, not the browser reported MIME alone         |
| any failure      | the sentence shown                 | a fixed `Record<UploadFailure, string>` in this feature, never a provider string |
| sign in mid flow | the held `File`                    | component state across the popup; guaranteed by AC-15, the card is one instance  |
| preview          | the `img alt`                      | the picked `File.name`, held in component state                                  |
| upload           | the file extension                 | a fixed MIME to extension map in this feature, never the supplied filename       |
| replace          | the path to delete                 | the `hosted` state's own `path`, never re derived from a filename                |
| any read         | whether a cached URL is still good | `mintedAt` on the cache entry, stale at 50 minutes against a 60 minute expiry    |

**Key invariants**:

- `app/upload/` is the only place in `app/` that calls `puter.fs` for a plan.
  Everything else asks this module for a path or a URL.
- A `FloorPlan` value never carries a URL, and no URL is written to `puter.kv`.
  A stored URL is a stale URL.
- `puter.fs.write` is never called without a `puter.fs.space()` check
  immediately before it.
- The URL cache lives at module scope and is never persisted. It holds a minted
  URL for less than its own one hour expiry, so a served URL is always live.
- A rejected file never touches the network.
- Nothing in this feature writes to `puter.kv`.
- The upload card is one component instance, mounted in the same place signed in
  and signed out. Anything that would swap or guard it breaks the held file.
- The URL cache stores a promise per path, so a cache miss can be in flight
  rather than only resolved or absent.
- No two writes are ever in flight from this card at once. The guard is a ref
  claimed synchronously, not the rendered phase: two events in one tick both read
  the phase from before the first `setPhase` and both get through.
- Nothing minted for one person outlives their session. Signing out empties the
  cache and resets the card.

**Security model**:

Plans are written into the signed in person's own Puter filesystem, so Puter's
own account boundary is the authorization model and there is no sharing, no ACL,
and no cross user read path in this feature. A minted read URL bypasses
authentication by design, which is why it is short lived: an hour is long enough
for a browsing session and short enough that a URL copied out of devtools dies
quickly. Floor plans stay private until feature 9 publishes a project, which is
a separate, deliberate act that copies images into an app owned hosted
directory. No regulated data class is in scope: a floor plan is not PII under
any standard this project is subject to, though it is plainly personal, which is
the reason the default is private and the URLs are short.

**Configuration required**:

None. This feature adds no environment variable, no credential, and no service
account. `VITE_PUTER_WORKER_URL` is already required at startup and is not used
here.

**Critical test scenarios**:

- Happy path: sign in, drop a 2 MB PNG, watch the bar move, and see the preview
  load from a minted URL, verifies **AC-1**, **AC-8**, **AC-9**.
- Failure case: fill the Puter account near its limit, then upload a file that
  will not fit, and confirm the refusal is ours and `write` was never called,
  verifies **AC-6**, **AC-13**.
- Failure case: a 12 MB file and a `.tiff` file are both refused with no network
  request, verifies **AC-5**.
- Auth/permission: signed out, pick a file, sign in, and confirm the held file
  uploads on its own with no second pick, verifies **AC-11**.
- Regression: confirm no read URL appears anywhere in a stored value, verifies
  **AC-3**.

## Build plan

_All eight tasks built 2026-08-28. `npm run verify` green. Behaviour still
owes the manual walkthrough in [verify.md](verify.md)._

Slice 1 is the project's thin end to end thread, and this feature is its first
leg. So the order below runs the thread inward to outward: the pure rules first,
then the one real network path, then the screen. The pure layer is what makes
the rest checkable without a browser, which matters on a project with no test
runner.

1. Drop `url` from `FloorPlan`, in **both** places that define it as a contract:
   the type in `app/projects/record.ts`, and `parseFloorPlan` in
   `app/projects/invariants.ts`, which today requires `url` to be a non empty
   string and returns `null` without it. Missing the second one is not a type
   error, it is a runtime one: `parseProject` would reject every record, so
   `readProject` reports every project unreadable and `listProjects` silently
   skips them all, and the gallery would simply be empty. `PublicAssets.floorPlanUrl`
   is a different field and is not touched. No stored data has to be migrated,
   because feature 6 is unbuilt and no project record exists yet. Update
   `docs/specs/0002-project-records-and-public-feed-index/` to record the change,
   satisfies **AC-3**.
2. The pure layer in `app/upload/plan.ts`: the allowed types and size, the
   `validatePlanFile` decision function, the MIME to extension map, the filename
   sanitiser with its run collapsing, trimming, 40 character cap and `plan`
   fallback, and the `planPath()` builder. No I/O, so every rule here is
   checkable by hand against a table of awkward filenames, satisfies **AC-2**,
   **AC-5**.
3. The failure vocabulary in `app/upload/failures.ts`: the `UploadFailure` union
   and its one sentence per case, matching the shape `app/projects/store.ts`
   already uses so the two read alike, satisfies **AC-13**.
4. The storage module in `app/upload/store.ts` over `withPuter`: the
   `fs.space()` pre check, `write` with `createMissingParents`, the `progress`
   callback and the `abort` handle, `deletePlan` treating an already missing path
   as success, and `readPlanUrl` over a module scope cache that stores the in
   flight promise per path, treats an entry stale at 50 minutes, and purges on
   delete. Nothing throws at a caller, satisfies **AC-1**, **AC-4**, **AC-6**,
   **AC-7**, **AC-10**.
5. The `usePlanUpload` hook holding the state machine above: the `held` state
   that survives the sign in popup wired to the existing `useSignIn`, the single
   `pick` entry point shared by first upload and Replace, the busy states made
   inert to further picks, and the abort on unmount, satisfies **AC-11**,
   **AC-16**, **AC-17**.
6. The upload card component, built to feature 4's structural reference (icon,
   heading, file type note, drop zone, hairline border, no grid pattern) and
   spec 0004's tokens. Includes the determinate progress hairline with its
   reduced motion behaviour, and the preview whose `alt` is the picked filename,
   satisfies **AC-8**, **AC-9**.
7. Accessibility and keyboard pass on the card: the real file input as the
   primary control, focus visible, drag and drop as an enhancement only,
   satisfies **AC-12**.
8. Place the card on the home route in the hero position, replacing the current
   placeholder. It renders in the same position signed in and signed out, and is
   not wrapped in `RequireUser`, which would unmount it and discard the held
   file. Confirm nothing writes to `puter.kv`, satisfies **AC-14**, **AC-15**.

## Consequences

**Positive**:

- A stored floor plan cannot rot. The path is permanent, so a project opened in
  a year still resolves, which is exactly the failure the scope was worried
  about when it warned against blob URLs.
- The quota dialog, which is Puter owned UI we cannot style or suppress, is
  avoided in the ordinary case rather than merely apologised for.
- Feature 6 inherits a decided, tested upload path and a `FloorPlan` value, so
  the render leg of the thread starts from something real.
- The pure layer means most of this feature is checkable without a browser,
  which suits a project that deliberately has no test runner.

**Negative / tradeoffs**:

- It breaks shipped, running code, not just a type. `FloorPlan.url` is required
  by `parseFloorPlan` in `app/projects/invariants.ts`, so removing the field
  without changing the parser would make every project unreadable rather than
  produce a compile error. The change is cheap only because feature 6 is unbuilt
  and no record exists yet to migrate. It is still a real correction to an
  `Accepted` spec, and spec 0002 has to say so.
- Every image display costs a network call on a cold cache. The gallery in
  feature 7 will show twelve at once, so that is twelve calls on first paint.
  The cache makes it once per path per session, but the first paint still pays.
- Abandoned uploads leak. Someone who uploads and walks away leaves bytes in
  their own Puter storage with nothing pointing at them. Replace is cleaned up
  because it is the one case we can see. An upload aborted by unmounting may
  also leave a partial file, which we do not clean either. Both are in the
  person's own drive rather than ours, which is why this is accepted rather than
  solved.
- The one hour expiry is a guess, not a measurement. It is short enough to be
  safe and long enough for a session, but nobody has observed a real session
  length yet.

**Neutral**:

- `puter.fs.write` defaults `createMissingParents` to `false`, so the `plans/`
  directory has to be created explicitly. Easy to miss and it fails on the very
  first upload of a fresh account, which is the least convenient time.
- The progress callback reports a fraction per operation, not bytes, so the bar
  is honest but coarse for a small file that finishes in one chunk.
- This is the first feature to put a genuinely long running operation on screen,
  so it is the first real consumer of spec 0004's busy state.

## Follow-up

- [ ] Orphaned uploads have no sweep. Worth revisiting once feature 7 can list
      projects, since the gallery is the first place a person could plausibly be
      shown "you have unused uploads" without a background job.
- [ ] The one hour URL expiry and the memory cache are both untested guesses.
      Revisit after feature 7 renders a real gallery, which is the first screen
      that mints many URLs at once.
- [ ] Feature 6 must read the plan inside the worker by path through
      `user.puter`, not by URL, or it reintroduces exactly the expiry problem
      this spec removes. Confirm when feature 6 is architected.
- [ ] `frontend-design` is installed and shapes every UI feature but is still
      not referenced in root `CLAUDE.md`'s tool list. It is project wide, so it
      belongs there. Carried over from spec 0004's follow up, still open.
- [ ] Puter's own usage limit dialog is unsuppressable on the storage refusal
      path. If Puter later exposes an opt out, take it, and delete the note in
      AC-7.

## Rationale

Reasoning, the options weighed, and the SDK findings that overturned the
scope's premise: see [rationale.md](rationale.md).
