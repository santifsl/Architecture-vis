# 0002. Own the project record in the owner's KV, derive the public feed in the worker

**Date**: 2026-08-27
**Status**: Accepted for the owner half, feature 3, which is built and verified.
The public half, feature 9, has six open design problems found in review; see
*Open problems raised in review* under Follow-up. It is not accepted yet.

The decision history (context, what was weighed, the reasoning, and everything
that was actually verified against the SDK and live hosts) lives beside this
file in [`rationale.md`](rationale.md).

## Summary

A project lives in its owner's own Puter key value store, and that copy is the
truth. Publishing pushes a small snapshot of it into a second store that only
the Puter worker can write, and a signed out visitor reads that store through
plain unauthenticated HTTP requests to the worker. Public images are copied into
one app owned hosted directory so they load at a real `*.puter.site` address for
someone with no account. This exists because Puter's key value store is scoped
per user per app, so an anonymous visitor holds no credential that could read
anybody's records: the feed has to be served by something that holds a
credential of its own, and the worker is the only such thing in this stack.

## Requirements

**User stories**:

- As a visitor with no account, I want to browse the community feed and open any
  project in it, so that I can see what the tool produces before signing up.
- As a signed in person, I want my own gallery to work from my own account
  alone, so that it never depends on a shared service being up.
- As a project owner, I want to make a project public and take it back down
  again, and have taking it down actually withdraw the images.
- As a project owner, I want each model's render tracked on its own, so a failed
  Gemini render never hides a finished Claude one.
- As a developer, I want one decided record shape, so features 5, 6, 7, 9 and 10
  are not each inventing their own.

**Acceptance criteria**:

- **AC-1**: A project is stored in its owner's own `puter.kv` under
  `project:<projectId>`, and the personal gallery lists projects with a single
  prefix list against that store. No worker call and no second store is involved
  in reading a signed in person's own projects.
- **AC-2**: Every model a project requested has its own render state, and each
  moves through its own statuses independently. One model failing never changes
  the other's status, URL, or error code.
- **AC-3**: A visitor with no Puter session loads the community feed
  successfully, newest first, and no sign in popup appears at any point.
- **AC-4**: The images on a public feed card load for that signed out visitor
  from the app owned `*.puter.site` host, with no credential attached to the
  request.
- **AC-5**: A signed out visitor can open one public project at its own URL and
  see the same view the owner sees, minus the edit and regenerate controls.
- **AC-6**: Publishing is refused, with a plain sentence and no raw error, until
  at least one of the project's models has a complete render.
- **AC-7**: The feed entry the worker writes is built only from what the worker
  reads back out of the caller's own store through `user.puter`. A request whose
  body claims a different name, different images, or a different author cannot
  change what lands in the feed.
- **AC-8**: Two publishes arriving at the same moment both end up in the feed.
  Neither silently overwrites the other.
- **AC-9**: Unpublishing a project, or deleting a public one, removes its feed
  entry and deletes its hosted public image copies, so the public image URLs stop
  resolving.
- **AC-10**: Renaming a public project, or a second model's render completing on
  one, updates that project's feed entry rather than leaving a stale snapshot.
- **AC-11**: The publish path validates the shape and size of what it writes
  (name length, URL shape, the 1 KB key and 400 KB value ceilings) and refuses
  anything malformed with a plain sentence.
- **AC-12**: Every feed read is bounded. The feed route requests one chunk at a
  time and never lists the whole index in one call.
- **AC-13**: Nothing about a private project reaches the store an anonymous
  reader can see. Only projects whose visibility is `public` have an entry or a
  hosted image copy.
- **AC-14**: Any failure on any of these paths, including a worker that is down,
  shows a plain human sentence and a retry action, never a raw exception or a
  provider message.

## Decision

**Chosen option**: Option 1: a worker endpoint over a central KV index.

The owner's own `puter.kv` is the system of record for a project. Publishing
sends the project id to the Puter worker, which re reads the project through
`user.puter`, copies its images into one app owned hosted directory, and writes a
small denormalized entry into a chunked feed index held in the worker owner's own
KV through `me.puter`. Anonymous visitors read that index and single public
projects over plain unauthenticated HTTP against the worker.

**Implementation skills**: `react-router` (`.agents/skills/react-router/`, for
the SPA route and `clientLoader` shape of the public feed routes)

## Rationale

Reasoning, the options weighed, and the verification record: see
[`rationale.md`](rationale.md).

## Feature design

**Data model sketch**

Three stores. Store A is the truth, store B is derived from it, store C holds
bytes.

*Store A: the owner's own `puter.kv`, scoped per user per app.*

| Key | Value |
| --- | --- |
| `project:<projectId>` | `Project` |

`Project`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | yes | so a later shape change is detectable, not guessed |
| `id` | `string` | yes, primary key | time sortable: a base36 millisecond timestamp, a `-`, then 8 random base36 characters drawn from `crypto.getRandomValues`. Sorts by creation time on its own, and two devices publishing in the same millisecond do not collide |
| `name` | `string` | yes | 1 to 80 characters after trimming |
| `owner` | `string` | yes | Puter username, denormalized so a snapshot needs no second lookup |
| `floorPlan` | `{ path: string, url: string }` | yes | the `puter.fs` path and the owner readable URL from feature 5 |
| `models` | `readonly ModelId[]` | yes | what was requested, at least one, `ModelId` is `"claude" \| "gemini"` |
| `renders` | `Readonly<Record<ModelId, RenderState>>` | yes | one entry per requested model, no entry for a model not requested |
| `visibility` | `"private" \| "public"` | yes | defaults to `private` |
| `publishedAt` | `number \| null` | yes | epoch milliseconds, `null` while private |
| `publicAssets` | `PublicAssets \| null` | yes | `null` while private |
| `createdAt` | `number` | yes | epoch milliseconds |
| `updatedAt` | `number` | yes | epoch milliseconds |

`RenderState` (embedded, one per requested model)

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `"pending" \| "running" \| "complete" \| "failed"` | drives the per model progress in the gallery |
| `path` | `string \| null` | `puter.fs` path, set on `complete` |
| `url` | `string \| null` | owner readable URL, set on `complete` |
| `errorCode` | `string \| null` | a short internal code, never a provider message |
| `startedAt` | `number \| null` | |
| `finishedAt` | `number \| null` | |

`PublicAssets` (embedded, written by the client from the publish response)

| Field | Type | Notes |
| --- | --- | --- |
| `floorPlanUrl` | `string` | the `*.puter.site` copy |
| `renderUrls` | `Readonly<Partial<Record<ModelId, string>>>` | one per model that had a complete render at publish time |

*Store B: the app account's `puter.kv`, reachable only as `me.puter` inside the
worker. Derived from store A, and repaired per owner by a republish.*

| Key | Value | Notes |
| --- | --- | --- |
| `feed:page:<nnnn>` | `{ chunk: number, entries: FeedEntry[] }` | up to 50 entries, newest first within the chunk. Chunks are **appended**: `0000` is the oldest and `feed:meta.newestChunk` names the newest, so a roll never rewrites an existing chunk |
| `feed:where:<projectId>` | `number` | which chunk holds this entry. Read before an insert to update in place instead of duplicating, and read on unpublish to find the entry without scanning |
| `feed:meta` | `{ newestChunk: number, totalPublished: number }` | one read tells the feed route where to start and how far it can page |
| `feed:lock` | `{ token: string, expiresAt: number }` | a fenced lock, see *Locking* below |
| `feed:cleanup:<projectId>` | `{ paths: string[] }` | store C files an unpublish failed to delete, retried by the next publish or unpublish |

`FeedEntry`: `schemaVersion`, `projectId`, `name`, `author`, `models` (only
those with a complete render), `renderUrls`, `floorPlanUrl`, `publishedAt`.

**Locking.** `kv.incr` gives a counter, not a mutex: a worker that stalls past a
plain expiry can wake up and overwrite a publish that finished while it was gone,
which is exactly what AC-8 forbids. So the lock is fenced. A publisher generates
a random token and `kv.set`s `feed:lock` to `{ token, expiresAt: now + 10s }`
only when the key is absent or its `expiresAt` has passed. It re reads the key
and confirms its own token is still there before each write in the sequence, and
abandons its work rather than writing if the token has changed. It releases by
deleting the key only when the token still matches. A publisher that finds the
lock held retries 5 times about 200 ms apart, then gives up with the `503` and
the plain retry sentence AC-14 requires.

**Write order on publish** (the sequence the lock protects): copy every store C
file first and abandon on any failure · take the lock · read `feed:meta` · read
`feed:where:<projectId>`, and read the newest chunk, and if an entry for this
project exists in either, update it in place rather than inserting · otherwise
prepend to the newest chunk, appending a new chunk and bumping
`feed:meta.newestChunk` when it is full · write `feed:where` · write `feed:meta`
· release. Removing an entry splices it out of its chunk. Chunks are never re
sorted and never compacted across chunks, so a chunk can hold fewer than 50
entries, which is harmless because paging is driven by the chunk index rather
than by counts.

*Store C: the app account's hosted directory*, published once with
`puter.hosting.create`. Files at `/<projectId>/floor-plan.<ext>` and
`/<projectId>/<model>.<ext>`, served anonymously at
`https://<subdomain>.puter.site/...`. This is the only place a signed out
visitor's browser loads image bytes from.

**Relationships**: `Project` 1 to 0..1 `FeedEntry`, only while public ·
`FeedEntry` many to 1 `feed:page` chunk · `Project` 1 to many `RenderState`,
embedded, at most 2 · `FeedEntry` 1 to many store C files.

**State transitions**

Per model render: `pending` → `running` → `complete`, or `pending` → `running` →
`failed`. A retry moves `failed` → `pending`. No other transition is legal, and
`complete` is terminal until a deliberate regenerate.

Project visibility: `private` → `public` on a publish the worker accepted, and
`public` → `private` on unpublish or on delete. A publish is only attempted when
at least one render is `complete` (AC-6).

**API surface** (the worker, at `VITE_PUTER_WORKER_URL`)

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/feed` | GET | `chunk:number` (opt, defaults to `feed:meta.newestChunk`) | `entries: FeedEntry[]`, `chunk`, `hasMore:boolean` | none, anonymous | 400 bad chunk, 503 index unavailable |
| `/feed/project/:projectId` | GET | `projectId:string` (req) | one `FeedEntry` | none, anonymous | 404, returned identically for a project that is private, unknown, or withdrawn, so the route never reveals that a private project exists |
| `/publish` | POST | `projectId:string` (req) | `publicAssets`, `publishedAt` | Puter session required | 401 no session, 404 no such project for this caller, 409 no complete render, 422 malformed record, 503 lock unavailable |
| `/unpublish` | POST | `projectId:string` (req) | `{ ok: true }` | Puter session required | 401 no session, 404 not published |

The client reaches all four through `puter.workers.exec()` behind `withPuter`
from spec 0001. The two `GET` routes are sent with the `x-puter-no-auth` header
when the reader is signed out, which is what makes them genuinely anonymous.

**Value sourcing**

| Action | Value produced / displayed | Source |
|---|---|---|
| create project | `id` | generated client side, base36 `Date.now()` plus a random suffix |
| create project | `owner` | the resolved user from spec 0001's root loader, never typed or posted |
| create project | `floorPlan.path` / `.url` | the `puter.fs` write result from feature 5 |
| render | `renders[model].url` / `.path` | the worker's render result from feature 6 |
| render | `renders[model].errorCode` | mapped from the provider failure to a short internal code inside the worker, so no provider text can reach a screen |
| publish | `FeedEntry.author` | the caller's username from `user.puter` inside the worker, never the request body |
| publish | `FeedEntry.publishedAt` | the worker's own clock at the moment the entry is written |
| publish | `FeedEntry.models` | derived: the keys of `renders` whose status is `complete` at read back time |
| publish | `FeedEntry.renderUrls` / `floorPlanUrl` | the store C paths the worker just wrote, composed onto the configured subdomain |
| publish | target chunk | `feed:meta.newestChunk`, with a new chunk appended when that one holds 50 entries |
| publish | whether this is an insert or an update in place | `feed:where:<projectId>`, plus a scan of the newest chunk, so a double publish cannot make two entries |
| publish | the lock token | generated per attempt from `crypto.randomUUID()`, compared before every write and on release |
| unpublish | which chunk holds the entry | `feed:where:<projectId>` |
| feed read | `hasMore` | derived: `chunk > 0`, since chunk `0000` is the oldest |
| owner's project view | whether the public copy is stale | derived: `visibility` is `public` and `updatedAt > publishedAt`, which is what shows the plain "public copy is out of date" state and its retry |
| feed card | which models rendered it | `FeedEntry.models`, which is what feature 4's meta line shows instead of a generic author and clock line |
| gallery | ordering | `Project.id`, which sorts by creation time on its own |

**Key invariants**

- A `FeedEntry` exists for a project if and only if that project's `visibility`
  is `public` and at least one of its renders is `complete`.
- Store B holds nothing that is not already in store A, and is never the
  authority for anything. Each entry is repairable by its own owner republishing;
  no central sweep exists, because the worker cannot enumerate other people's
  stores.
- `renders` has exactly one key per entry in `models`, and no others.
- `publishedAt` is non null exactly when `visibility` is `public`, and the same
  for `publicAssets`.
- A key is at most 1 KB and a value at most 400 KB, so a chunk of 50 entries has
  to stay comfortably inside that; entries hold URLs and short strings only,
  never image data.
- Only the worker ever writes store B or store C. No client code has a path to
  either.
- A project has at most one `FeedEntry` across the whole index, enforced on
  insert by `feed:where` plus a scan of the newest chunk.
- A `FeedEntry` is only ever written after every one of its store C files has
  been copied successfully, so an entry never points at a URL that does not
  resolve.
- A project record is only ever deleted when its `visibility` is known and is
  `private`. A public record is refused until it is unpublished, and a record
  this build cannot parse is refused too, because its visibility is unknown and
  deleting it could strand a feed entry and its hosted copies with no record
  left that names them. Both refusals are plain sentences, and they are
  deliberately different sentences: one asks for an unpublish, the other reports
  a record that needs looking at.
- Every URL in `publicAssets` and in a `FeedEntry` begins with
  `https://<PUBLIC_SUBDOMAIN>.puter.site/`, which is what "valid URL shape"
  means in AC-11. Anything else is refused.

**Security model**

- A person's own projects live in their own account's store. No other person and
  no anonymous reader can reach them, because Puter scopes that store per user
  per app and cross app access needs an explicit grant the visitor cannot give.
- Anonymous readers get exactly two routes, both read only, both serving only
  data that a signed in owner deliberately published.
- Both write routes require a session. The worker treats the request body as
  carrying one trusted value, the project id, and rebuilds everything else from
  what it reads through `user.puter`. A caller therefore cannot publish a project
  that is not theirs, cannot claim someone else's authorship, and cannot inject a
  name or an image URL of their choosing.
- Publishing copies image bytes into an app owned directory that is world
  readable by design. Unpublish deletes those copies, so withdrawal is real
  rather than a flag.
- No regulated data is in scope. The only personal data in the public store is
  the publisher's own Puter username, which they publish deliberately.

**Configuration required**

- No new client environment variable. The client already has
  `VITE_PUTER_WORKER_URL` from spec 0001, and public image URLs are read off the
  record rather than composed in the browser.
- Worker side constant `PUBLIC_SUBDOMAIN`: the `*.puter.site` subdomain the
  worker writes public copies into. It is not a secret.
- **Prerequisite, a person has to do this once**: create that subdomain in the
  app's Puter account with `puter.hosting.create(subdomain, dirPath)` before the
  publish path can work, and put the name in the worker's constant.

**Critical test scenarios** (verify by hand, per CLAUDE.md; no test runner)

- Happy path: publish a project with one complete render, then load `/community`
  in a browser with no Puter session at all (a private window is enough) and see
  the card, its image, and its model label. Verifies **AC-3**, **AC-4**,
  **AC-12**.
- Happy path: open that project's own URL in the same signed out window.
  Verifies **AC-5**.
- Failure case: `curl -X POST` the `/publish` route with a body naming another
  account's project id and a made up name, and confirm nothing enters the feed.
  Verifies **AC-7**.
- Failure case: publish a project whose only render is still `pending` and
  confirm a plain refusal, not an exception. Verifies **AC-6**, **AC-14**.
- Failure case: fire two publishes of two different projects at the same instant
  from two tabs and confirm both cards appear. Verifies **AC-8**.
- Failure case: publish the same project twice in quick succession and confirm
  exactly one card exists for it. Verifies **AC-8**, **AC-10**.
- Failure case: rename a public project and confirm the feed card changes;
  simulate a failing republish and confirm the owner sees the plain "public copy
  is out of date" state with a retry. Verifies **AC-10**, **AC-14**.
- Failure case: unpublish, then `curl` the public image URL and confirm it no
  longer resolves. Verifies **AC-9**.
- Auth and permission: load the feed with the worker deliberately misconfigured
  and confirm a plain sentence plus a retry, while the personal gallery still
  loads for a signed in person. Verifies **AC-1**, **AC-14**.

## Build plan

The project's approach is a thin end to end thread first (`scope.md`: one floor
plan actually reaching a model and coming back as a hosted render, before any
part is made fuller). So this spec's work is deliberately split. Tasks 1 to 3
are feature 3 proper and land before feature 5 writes anything. Tasks 4 to 11 are
the public half, and belong with feature 9 rather than being built now against
nothing.

**Feature 3, now:** built, `app/projects/`.

1. [x] Write the record types in one place: `Project`, `RenderState`, `ModelId`,
   `PublicAssets`, `FeedEntry`, all `readonly`, no `any`, plus the time sortable
   id generator and the key builders (`project:<id>`, `feed:page:<nnnn>`,
   `feed:where:<id>`). Satisfies **AC-2**, part of **AC-11**.
2. [x] Write the owner side store module over `withPuter` from spec 0001: create,
   read, list by prefix, update, delete, with the shape validated on the way in
   and out and a plain failure message on the way out. Satisfies **AC-1**,
   **AC-11**, **AC-14**.
3. [x] Write the invariant checks as plain functions the store module calls
   (`renders` matches `models`, `publishedAt` agrees with `visibility`, name
   length, value size before a write). Satisfies **AC-11**, **AC-13**.

**Feature 9, when the public half is built:**

4. Create the hosted subdomain in the app account and add the worker constant.
   Prerequisite for **AC-4**.
5. Add the anonymous `GET /feed` route to the worker, reading chunks through
   `me.puter`, defaulting to `feed:meta.newestChunk` and paging downward.
   Satisfies **AC-3**, **AC-12**.
6. Add `GET /feed/project/:projectId`, with the single indistinguishable `404`.
   Satisfies **AC-5**.
7. Write the fenced lock helper on its own: acquire with a token, verify before
   each write, release only on a token match, bounded retry then `503`.
   Satisfies **AC-8**.
8. Add `POST /publish` in the write order given above: re read through
   `user.puter`, refuse without a complete render, copy every store C file and
   abandon on a partial copy, then under the lock either update the existing
   entry in place or insert, appending a chunk when the newest is full, and write
   `feed:where` and `feed:meta`. Retry any `feed:cleanup` left by an earlier
   unpublish while it holds the lock. Satisfies **AC-6**, **AC-7**, **AC-8**,
   **AC-10**, **AC-11**, **AC-13**.
9. Add `POST /unpublish`: under the lock, remove the entry through `feed:where`
   and update `feed:meta` first, then delete the store C copies, recording any
   file it could not delete in `feed:cleanup:<projectId>`. Satisfies **AC-9**.
10. Call publish again from every path that mutates a public project (rename, a
    render completing, a regenerate), and show the owner a plain "public copy is
    out of date" state with a retry whenever `updatedAt > publishedAt` on a
    public project, so a failed background republish is visible rather than
    silent. Satisfies **AC-10**, **AC-14**.
11. Build the two public SPA routes with `clientLoader`, 24 cards a screen over
    50 entry chunks, a load more control that is reachable by keyboard, and a
    plain failure state with a retry. Satisfies **AC-3**, **AC-5**, **AC-12**,
    **AC-14**.

## Consequences

**Positive**:

- Feature 9's promise is now backed by a channel that was actually verified to
  serve anonymous readers, rather than assumed to.
- A signed in person's own gallery depends on their own account and nothing
  else, so a worker outage degrades the product instead of breaking it.
- Features 5, 6, 7, 9 and 10 all inherit one decided record shape.
- Ownership is checked in the one place that can check it, so the public feed
  cannot be filled with forged or borrowed content.

**Negative / tradeoffs**:

- Derived state exists and can drift. A publish that half fails leaves a feed
  entry disagreeing with the owner record until a republish. The owner sees that
  as the "public copy is out of date" state, so it is visible to the one person
  who can fix it, but nothing detects it centrally.
- Repair is per owner, not central. The worker cannot enumerate every user's
  store, so there is no administrative rebuild that sweeps the whole index. What
  makes drift recoverable is that publish is idempotent and updates an entry in
  place, so an owner republishing repairs their own entries and nobody else's.
  Store B is therefore durable state that has to be looked after, not a cache
  that can be thrown away.
- The worker is a single point of failure for everything public, and public feed
  traffic and public image storage bill to the app owner's account rather than to
  each user.
- Publish is a multi step operation (copy bytes, take a lock, rewrite a chunk,
  write two pointers) and Puter's key value store has no multi key transaction,
  so a worker that dies midway leaves the four keys briefly disagreeing. The
  ordering above is chosen so every such state is either invisible or repaired by
  the next publish: files before the entry, so no card points at a missing image;
  the entry before the pointers, so a lost `feed:where` is caught by the newest
  chunk scan; the entry before the files on delete, so a leftover file has no
  card pointing at it.
- The public feed and public project pages are client rendered, so a crawler or
  a link preview sees an empty shell. This is accepted deliberately: nothing in
  scope asks for search traffic, and spec 0001's static SPA choice is reversible
  if that changes.
- Image bytes pass through the worker on publish, which caps how large a
  publishable render can sensibly be.

**Neutral**:

- The static file variant of the feed (a `feed.json` on the hosted subdomain)
  stays available as a pure read optimization later, since the worker is already
  the only writer.
- A flatter shape (one key per published project, listed by prefix and sorted at
  read time) was raised independently in the cross check as a way to drop the
  lock and the chunk arithmetic entirely. It was weighed and turned down in
  favour of bounded reads and exact ordering, and the fenced lock plus the write
  ordering above removes most of what made chunking risky. Worth revisiting only
  if the lock proves troublesome in practice.

## Follow-up

- [ ] Verify by hand, once feature 6 deploys a real worker: a `curl` to the
      worker with no session at all reaches a route and returns data. This is
      currently believed from `src/modules/Workers.js:127` and the docs, not
      proven, and AC-3 rests on it.
- [ ] Verify by hand, same moment: a worker can read a file through
      `user.puter.fs` and write it through `me.puter.fs`. The publish image copy
      in task 8 rests on this and it has not been proven either.
- [ ] Confirm the chunk size of 50 stays inside the 400 KB value ceiling once a
      real `FeedEntry` exists, and lower it if a real entry is larger than
      estimated.
- [ ] Confirm there is genuinely no way for the worker to enumerate other users'
      records. The per owner repair story rests on that being true, and it was
      reasoned from how the store is scoped rather than tested.
- [ ] Feature 6's worker spec does not exist yet. When it is written, it has to
      adopt the four routes above rather than inventing a parallel surface.
- [ ] Decide, in feature 9, what the feed shows when it is empty and what a
      single project page shows for an id that was public and no longer is.
- [ ] `scope.md` feature 3 should link this spec, and its open question note can
      be replaced by that link.

### Open problems raised in review, 2026-08-27

A review of this spec found six things wrong with the publish design. All six
sit in the public half, feature 9, which is not built, so none of them is a bug
in shipped code today. None is answered here on purpose: each is a real design
fork, and this project decides those with `/architect`, not in passing. **Feature
9 does not start until these are settled.**

- [ ] **The fenced lock cannot be built as written.** *Locking* above has a
      publisher `kv.set` the lock "only when the key is absent or its
      `expiresAt` has passed", and delete it "only when the token still
      matches". Both are read-then-write. The pinned SDK's `puter.kv` has no
      conditional write and no compare-and-swap: `set` is unconditional, and the
      only atomic primitives are `incr` and `decr` (`node_modules/@heyputer/
      puter.js/types/modules/kv/index.d.ts`). Two publishers can both read the
      key as absent and both set it, each believing it holds the lock, and the
      token fencing does not help because both wrote. The lock needs rebuilding
      on a primitive that actually exists, most likely `incr`, which this spec
      dismissed as "a counter, not a mutex" without noticing it is the only
      atomic thing on offer.
- [ ] **Publication commits through the client, which may never come back.**
      `PublicAssets` is "written by the client from the publish response", so if
      the browser closes, or the store A write fails, after the worker committed
      store B and C, the project is live in the feed while its own record still
      reads private. That contradicts AC-13. Needs a compensating commit
      protocol across the three stores, one that does not treat the client's
      response handler as the authority.
- [ ] **A failed publish leaks publicly readable images.** *Write order on
      publish* copies every store C file first and abandons on any failure.
      Abandoning leaves those copies live at a guessable `*.puter.site` URL with
      no feed entry and no record pointing at them, which AC-13 forbids. Either
      stage them somewhere not publicly readable, or track every copied path
      durably and delete all of them whenever the lock, the feed writes, or the
      worker aborts. `feed:cleanup:<projectId>` covers unpublish, not this.
- [ ] **Republishing breaks newest-first ordering.** An entry updated in place
      keeps its old chunk while `publishedAt` becomes the worker's clock at the
      moment of the rewrite, so a freshly republished project sits at an old
      position with a new timestamp. Either keep the original `publishedAt` on
      an in-place update, or splice the entry out of its old chunk, reinsert it
      into the newest one, and update `feed:where:<projectId>`.
- [ ] **The staleness check compares two different clocks.** The owner's project
      view derives "the public copy is out of date" from `updatedAt >
      publishedAt`, but `updatedAt` is the browser's clock and `publishedAt` is
      the worker's. A slow browser clock hides a genuinely stale copy; a fast
      one shows a fresh copy as permanently stale. This wants one shared,
      server issued revision or mutation number that both the owner store update
      and the publish write and compare.
- [ ] **`updateProject` is not safe against two renders finishing at once.**
      The code says so deliberately, reasoning that the store is one person's
      and every write is driven by that person acting. Feature 6 breaks that
      reasoning: it fires both models at once, so two completions land in the
      same tab and interleave read-modify-write, and the second one to write
      wins with a stale copy of the first one's render. That is exactly the
      independence AC-2 promises. Merging `renders` per model, done since,
      narrows the window but does not close it. With no compare-and-swap in the
      SDK, the buildable answer is probably serializing writes per project in
      the client, but that is feature 6's decision to make and take.
