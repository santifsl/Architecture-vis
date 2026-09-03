# 0011. A flat feed index, an intent first publish, and a revision counter

**Date**: 2026-09-02
**Status**: In Progress

**Amends [0002](../0002-project-records-and-public-feed-index/index.md).** That
spec decided the three store model and it stands. This one answers the six open
design problems its review raised, all of which sit in the public half, and it
replaces four things 0002 designed: the chunked feed index, the fenced lock, the
publish write order, and the staleness rule. Everything else in 0002 is
unchanged and still governs, including the record shape, the security model, and
`AC-1` through `AC-14`.

The decision history, what was weighed, and the platform reading behind it live
beside this file in [`rationale.md`](rationale.md).

## Summary

Making a project public no longer needs a lock, a chunk, or a clock. Each
published project gets its own key in the worker's store, named so that plain
key order is newest first, and the feed reads a page at a time with the key value
store's own cursor. Publishing writes the owner's own record first, so a browser
that closes halfway leaves a project that says it is public and visibly out of
date, which its owner can fix with one press, rather than a project that is live
in the feed while its own record says private. And "the public copy is out of
date" stops comparing two different clocks: the record carries a revision number
that both sides read from the same place.

## Requirements

**User stories** (in addition to 0002's, which stand):

- As a project owner, I want a publish that dies halfway to leave something I can
  see and fix, rather than something silently wrong.
- As a project owner, I want to know honestly whether what the public sees
  matches what I have, without that answer depending on my computer's clock.
- As a visitor, I want the feed to be in a sensible order and to stay in that
  order while I read it.
- As a developer, I want one door for every write to a project record, so a
  render finishing during a rename cannot lose either.

**Inherited acceptance criteria.** `AC-3` through `AC-14` are defined verbatim in
[0002's Requirements](../0002-project-records-and-public-feed-index/index.md#requirements)
and are the contract for the public half. They are unchanged. In short, so a
build need not open 0002 for the gist:

| ID      | In short                                                                          |
| ------- | --------------------------------------------------------------------------------- |
| `AC-3`  | A signed out visitor loads the feed, newest first, with no sign in popup          |
| `AC-4`  | Feed images load for that visitor from the app owned `*.puter.site` host          |
| `AC-5`  | A signed out visitor opens one public project at its own URL                      |
| `AC-6`  | Publishing is refused, plainly, until at least one render is complete             |
| `AC-7`  | The feed entry is built only from what the worker reads back through `user.puter` |
| `AC-8`  | Two publishes at the same moment both land, neither overwrites the other          |
| `AC-9`  | Unpublish or delete removes the entry and the hosted image copies                 |
| `AC-10` | Renaming a public project updates its entry rather than leaving a stale snapshot  |
| `AC-11` | The publish path validates shape and size and refuses anything malformed          |
| `AC-12` | Every feed read is bounded, one page at a time                                    |
| `AC-13` | Nothing about a private project reaches the store an anonymous reader can see     |
| `AC-14` | Every failure is a plain sentence and a retry, never a raw exception              |

**New acceptance criteria** (this spec's own contract, numbered on from 0002):

- **AC-15**: No coordination key exists. Publishing and unpublishing take no lock,
  and no code path reads a key and then writes it back inside the worker's store.
- **AC-16**: The feed reads newest first across a page boundary. Reading page one,
  then page two with the cursor page one returned, yields entries in strictly
  descending `publishedAt` order with no entry repeated or skipped. This holds
  over an index that is not changing under the reader; whether it also holds when
  an entry is deleted mid paging depends on whether the store's cursor is opaque
  or positional, which build task 1 settles. If it turns out positional, this
  criterion is met over a static index and a card skipped by a concurrent
  unpublish is accepted.
- **AC-17**: The owner's record says `public` before the worker is called. If the
  browser closes at any point after that, the project reads `public` in its own
  gallery and shows the out of date state with a retry. At no moment is a project
  live in the feed while its own record reads `private`.
- **AC-18**: Public image copies live at paths derived from the project id alone.
  A second publish overwrites the same paths, and an unpublish deletes them by
  deriving the same paths, with no manifest kept anywhere.
- **AC-19**: Staleness is the comparison of two integers and no clock. A browser
  whose clock is an hour wrong in either direction shows exactly the same
  freshness state as a correct one.
- **AC-20**: Every write to a project record, from any feature, is serialised per
  project id. Two renders finishing at the same moment, or a render finishing
  during a rename, both land, and neither is written over with a stale copy.
- **AC-21**: A stored schema version 2 record opens and reads as version 3 with
  `revision` of `0`. No project disappears from its owner's gallery because of
  this change.
- **AC-22**: Any successful content change to a public project republishes without
  being asked, **except one that leaves the project with no complete render**,
  which is skipped rather than sent. A republish that fails leaves the out of date
  state and a retry, and never a silent divergence. The exception is not a
  loophole: `AC-6` says the worker refuses a publish with no complete render, so
  such a write would be correctly refused and the person would be shown a failure
  sentence for doing nothing wrong. The project is already showing as out of date
  meanwhile, and the write that finishes the render is itself a content change,
  so it republishes then.
- **AC-23**: A feed with nothing in it shows an invitation, and which invitation
  depends on whether the reader is signed in.
- **AC-24**: A public project URL that is withdrawn, private, or was never real
  shows one identical plain page with a way onward to the feed, and nothing that
  distinguishes the three cases.
- **AC-25**: Making a project public asks for confirmation once, naming what
  happens. Making it private takes effect immediately with no confirmation.

## Decision

**Chosen option**: Option 1: a flat, cursor paginated index with an intent first
publish and a content revision counter.

Store B holds one key per published project, named `feed:entry:<sortKey>:<id>`
where `sortKey` is an inverted `publishedAt`, so plain key order is newest first
and `puter.kv.list` with a `limit` and a `cursor` is the whole pagination story.
Publishing is a single `kv.set` of that one key and unpublishing a single
`kv.del`, so there is nothing to read and write back and therefore no lock. The
client writes `visibility` on its own record before calling the worker, so the
owner's record is a durable statement of intent and every crash leaves the
repairable state. Freshness is a `revision` integer on the record, compared
against the revision the feed entry was built from, so no clock is involved.

**Implementation skills**: `react-router-framework-mode`
(`remix-run/agent-skills`, `.agents/skills/react-router-framework-mode/`, for the
`clientLoader` and pending UI shape of the two public routes) ·
`react-router` (`.agents/skills/react-router/`, for the SPA route config)

## Rationale

Reasoning, the options weighed, and the platform reading: see
[`rationale.md`](rationale.md).

## Feature design

### Data model

**Store A, the owner's own `puter.kv`.** `Project` gains one field and bumps its
schema version. Everything else in 0002's table stands.

| Field           | Type     | Required | Notes                                                                                                                    |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | `3`      | yes      | was `2`. A stored `2` is read and upgraded rather than refused, see the Migration plan                                   |
| `revision`      | `number` | yes      | starts at `0`. Counts **content** changes only, meaning a change to `name` or to `renders`. Never negative, never resets |

`publicAssets` gains one field:

| Field               | Type     | Notes                                              |
| ------------------- | -------- | -------------------------------------------------- |
| `publishedRevision` | `number` | the `revision` the live public copy was built from |
| `floorPlanUrl`      | `string` | unchanged from 0002                                |
| `renderUrls`        | map      | unchanged from 0002                                |

`publishedAt` changes meaning slightly and is now written by the **client**, once,
at the moment of intent, and never rewritten. It is the feed's sort position and
the date a card shows. It is never compared against another clock, which is what
makes a client clock acceptable for it.

**Store B, the worker owned `puter.kv`.** Two key patterns. Three of 0002's five
keys are gone.

| Key                                | Value       | Notes                                                                                                                     |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `feed:entry:<sortKey>:<projectId>` | `FeedEntry` | `sortKey` makes plain key order newest first, see Value sourcing                                                          |
| `feed:where:<projectId>`           | `string`    | the `sortKey` of that project's entry. The only way the anonymous single project route can find a key, see the note below |

**Why `feed:where` survives.** An earlier draft deleted it, reasoning that the
key is recomputable from the record's own `publishedAt`. That is true for
`/publish` and `/unpublish`, which run with a session and re read the record, and
false for `GET /feed/project/:projectId`, which is anonymous and holds only a
project id. Nor can it scan for one: `puter.kv`'s `pattern` is documented as
prefix only, with a trailing `*` as the wildcard, so `feed:entry:*:<projectId>`
matches nothing. The pointer is a whole key `set` and a whole key `del`, so it
does not bring the lock back.

Deleted from 0002, with the reason: `feed:page:<nnnn>` (no chunks any more) ·
`feed:meta` (`hasMore` is the cursor, and no screen shows a total) · `feed:lock`
(nothing is read and written back) · `feed:cleanup:<projectId>` (deterministic
paths make cleanup derivable).

`FeedEntry` gains `publishedRevision` and otherwise keeps 0002's shape:
`schemaVersion`, `projectId`, `name`, `author`, `models`, `renderUrls`,
`floorPlanUrl`, `publishedAt`, `publishedRevision`.

**Store C, the app account's hosted directory.** Unchanged from 0002, with its
paths now named as a hard invariant rather than a convention:
`/<projectId>/floor-plan.<ext>` and `/<projectId>/<model>.<ext>`. **Those paths
are relative to the app root, not to `/`**, which the task 4 probe established
the hard way; see Follow-up. The leading slash reads as the root of the served
subdomain, which is what a public URL sees, and it is written app relative in
`me.puter.fs`.

**The subdomain is bound to a `public/` directory one level down, not to the app
root.** This spec first served the app root itself. The build narrowed it, and
the URL a record stores is identical either way, because the subdomain's root is
whatever directory it is bound to: files land at `public/<projectId>/<name>.<ext>`
in `me.puter.fs` and are served at `https://<PUBLIC_SUBDOMAIN>.puter.site/<projectId>/<name>.<ext>`
exactly as written above. What changes is exposure: everything else the app
account ever writes under `~/AppData/<appId>` stays out of a directory that is
served to the world. Nothing the client checks about the URL shape moves.

**Relationships**: `Project` 1 to 0..1 `FeedEntry`, only while public · `Project`
1 to many `RenderState`, embedded, currently at most one · `FeedEntry` 1 to many
store C files, all under one directory named by the project id.

### State transitions

Per model render: unchanged from 0002 and 0007.

Project visibility gains a named middle state, which is a state of the data
rather than a new field:

- `private` → `public`, the client's intent write. `publishedAt` is stamped,
  `publicAssets` is still `null`.
- **published but uncommitted**: `visibility` is `public` and `publicAssets` is
  `null`. Shown to the owner as out of date with a retry. This is the state a
  crashed publish leaves, and it is the whole reason the intent write comes first.
- **live**: `visibility` is `public`, `publicAssets` is set, and
  `revision === publicAssets.publishedRevision`.
- **stale**: `visibility` is `public`, `publicAssets` is set, and
  `revision !== publicAssets.publishedRevision`. Shown as out of date, republished
  automatically, retryable by hand.
- `public` → `private`, on unpublish. `visibility` goes first and `publishedAt`
  and `publicAssets` are cleared only after the worker confirms, because the
  worker needs `publishedAt` to derive the key it is deleting. Unpublishing from
  the uncommitted state is legal and is how an owner abandons a publish that will
  not complete, which is why `/unpublish` is idempotent rather than refusing when
  it finds no entry.
- **withdrawing**: `visibility` is `private` and `publishedAt` or `publicAssets`
  is still set. **This spec named four states and the build found a fifth**, and
  it is the exact mirror of `uncommitted`: the state a crashed unpublish leaves,
  because the visibility write goes first there too. It cannot be folded into
  `private`. A record in it reads private while its public copies are still up,
  and shown as plain `private` the only control offered would be `Make public`,
  which is precisely the wrong direction for somebody whose withdrawal did not
  finish. So it gets its own repair sentence and its own direction, `unpublish`,
  and the word beside the name still reads `Private` because that is what the
  record honestly says.

`app/publish/rules.ts` holds all five as one pure function of the record, which
is what keeps the sheet, the badge and the repair reading the same state.

### API surface

The worker, at `VITE_PUTER_WORKER_URL`. Two routes replace 0002's paging
contract; the two write routes keep their shape and change their bodies.

| Endpoint                   | Method | Key inputs                                  | Key outputs                              | Auth            | Key errors                                                                               |
| -------------------------- | ------ | ------------------------------------------- | ---------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| `/feed`                    | GET    | `cursor:string` (opt), `limit:number` (opt) | `entries: FeedEntry[]`, `cursor?`        | none, anonymous | 400 bad cursor or limit, 503 index unreachable                                           |
| `/feed/project/:projectId` | GET    | `projectId:string` (req)                    | one `FeedEntry`                          | none, anonymous | 404, identical for withdrawn, private, and unknown                                       |
| `/publish`                 | POST   | `projectId:string` (req)                    | `publicAssets` incl. `publishedRevision` | Puter session   | 401 no session, 404 no such project, 409 not public or no complete render, 422 malformed |
| `/unpublish`               | POST   | `projectId:string` (req)                    | `{ ok: true }`, always                   | Puter session   | 401 no session, 404 no such project for this caller                                      |

`503 lock unavailable` is gone from `/publish`; there is no lock to be unavailable.
`409` gains a second cause: the worker refuses a publish for a record whose own
`visibility` is not yet `public`, which is how the intent first order is enforced
in the one place that can enforce it. `/publish` also re reads that record a
second time, immediately before its `kv.set`, and abandons if the visibility has
changed since the copy started; see the note under Key invariants.

`/unpublish` is **idempotent** and has no "not published" error. It deletes what
it can derive and answers `{ ok: true }` whether or not anything was there. That
is what lets an owner abandon a publish stuck in the uncommitted state, where no
entry was ever written, instead of being offered only a retry.

`GET /feed/project/:projectId` reads `feed:where:<projectId>` to get the
`sortKey`, then reads the entry. A missing pointer, a missing entry, and a
project that never existed all answer the same `404` with no body.

The two write routes are reached through `puter.workers.exec()` behind
`withPuter` from spec 0001. **The two anonymous `GET` routes are not, and cannot
be.** This spec originally wrote all four that way, carrying `x-puter-no-auth`
when the reader is signed out, and that is not implementable: `withPuter` rejects
with `PuterGateError` when no token is held, which is exactly right everywhere
else in the app and exactly wrong here, because `AC-3` is the signed out visitor
and a signed out visitor holds no token by definition. The gate refuses before
the header is ever sent.

So `app/feed/store.ts` reads the two public routes with a plain `fetch` against
`VITE_PUTER_WORKER_URL`, carrying `x-puter-no-auth` on every call, signed in or
signed out alike. Nothing is lost by that. `workers.exec` exists to attach a
session, and these routes deliberately have none: the worker serves them out of
its own store through `me.puter` and never looks at `user`. Attaching a session
would buy nothing and would mean a signed in reader and a signed out one taking
two different paths to the same public data. The rule `app/platform/AGENTS.md`
actually owns, that only `puter.ts` imports the SDK, is untouched, because a
`fetch` imports nothing.

### Value sourcing

| Action              | Value produced / displayed             | Source                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any write           | `revision`                             | `updateProject` increments the stored value, but only when `name` or `renders` is among the changes. A `visibility`, `publishedAt` or `publicAssets` write leaves it alone                                                                                                                                            |
| publish, intent     | `publishedAt`                          | the client's own clock, written once at the intent write and never rewritten. Safe as a client clock because it is only ever a sort position and a displayed date                                                                                                                                                     |
| publish             | the store B key's `sortKey`            | derived in the worker: `(10 ** 13 - publishedAt)` as a base 10 string left padded to 13 characters, so a larger `publishedAt` sorts earlier                                                                                                                                                                           |
| publish             | `publishedAt` used to build that key   | read off the record through `user.puter`, never the request body, so `AC-7` still holds                                                                                                                                                                                                                               |
| publish             | `publishedRevision`                    | the record's `revision` at the moment the worker read it back                                                                                                                                                                                                                                                         |
| publish             | `FeedEntry.author`, `models`           | as 0002: the caller's username and the complete renders, both from the record read through `user.puter`                                                                                                                                                                                                               |
| publish             | store C paths                          | derived from `projectId` and the source file extension alone, never from a request body and never random                                                                                                                                                                                                              |
| unpublish           | which key to delete                    | recomputed from the record's own `publishedAt` and `id`, read through `user.puter` before the client clears them. If the record is already cleared, `feed:where:<projectId>` answers instead                                                                                                                          |
| single project read | which key holds the entry              | `feed:where:<projectId>`. There is no other source: the route is anonymous, and `kv.list`'s `pattern` is prefix only so no scan can find it                                                                                                                                                                           |
| republish           | when it fires                          | announced from inside `updateProject`'s queued task, after a successful write whose changes included `name` or `renders`, when the stored `visibility` is `public` **and at least one render is complete**. Not from a call site, so neither the rename path nor the render path can be wired and the other forgotten |
| publish, commit     | whether this response may be written   | the incoming `publishedRevision` compared against the stored `publicAssets.publishedRevision`. A lower one is a slower republish answering late and is dropped, the same compare before write shape as render guard 3                                                                                                 |
| feed read           | `hasMore`                              | the presence of a `cursor` in the `kv.list` page. No count is stored and none is requested                                                                                                                                                                                                                            |
| feed read           | the next page                          | the `cursor` the previous page returned, held in route state, never an offset                                                                                                                                                                                                                                         |
| owner's view        | whether the public copy is out of date | `visibility === "public"` and (`publicAssets === null` or `revision !== publicAssets.publishedRevision`). No timestamp on either side                                                                                                                                                                                 |
| project sheet       | the public link to show                | `publicAssets.floorPlanUrl`'s origin plus the project id, or nothing at all while `publicAssets` is `null`                                                                                                                                                                                                            |
| empty feed          | which invitation to show               | the resolved user from spec 0001's root loader, the same fact every other screen asks                                                                                                                                                                                                                                 |
| withdrawn page      | what to render                         | the single `404` from `/feed/project/:projectId`, which carries no reason by design                                                                                                                                                                                                                                   |

### Key invariants

- **No key in store B is ever read and then written back.** Every write is a whole
  key `set` or a whole key `del`. This is what replaces the lock, and it is the
  invariant to check first if anyone is ever tempted to add a counter or a list.
  It holds per key and per call, and it is deliberately not a claim that the whole
  publish sequence is atomic; the next two invariants are what carry that weight.
- **Publish and unpublish for one project never overlap in one tab.** Without
  this a slow publish's `kv.set` can land after an unpublish's `kv.del` and leave
  a live card for a project whose own record reads private, which nobody can then
  repair. **This spec first said both sequences go through the same per project
  serial queue as every record write, and that is not implementable: it
  deadlocks, on the first press.** A publish sequence writes the record, so held
  inside one of the record queue's turns it would wait for a queue position that
  cannot come free until it returns.

  So there are two queues and they compose rather than compete.
  `app/publish/queue.ts` holds a whole publish or unpublish SEQUENCE, intent
  write, worker call and commit together, which is the thing that must not
  interleave. The record queue in `app/projects/store.ts` is unchanged and still
  holds every individual write. The single writer rule below is untouched: the
  publish queue writes no record itself, it only decides who may run a sequence
  next, and every write inside that sequence still lands through the one shared
  queue.

- **The worker re reads the record immediately before its `kv.set`.** Copying
  store C files takes time, and the visibility can change during it. The second
  read makes the window one round trip wide instead of the whole copy, and closes
  the two tab case as far as it can be closed without a lock.
- **A publish response is only committed if it is not older than what is stored.**
  Two republishes can complete out of order, and the older one landing last would
  leave the record reading fresh while the public copy shows the earlier content.
  The commit compares `publishedRevision` and drops the lower one.
- `revision` counts content only. A `visibility`, `publishedAt` or `publicAssets`
  write must not bump it, or committing a publish would immediately invalidate the
  publish it just committed.
- A `FeedEntry` exists if and only if the owner's record reads `public` **and**
  `publicAssets` is not `null`. The uncommitted state is the one legal
  disagreement, it points the safe way, and it is visible to the owner.
- Store C paths are a pure function of `projectId` and the file extension. Nothing
  random, nothing timestamped, nothing recorded.
- **`deleteProject` refuses while anything public is outstanding**, meaning the
  record reads `public` **or** it still carries `publishedAt` or `publicAssets`.
  0002 already refused a public project; the wider test is what `withdrawing`
  forces, because a record deleted in that state strands a feed entry and a
  directory of hosted files with nothing left pointing at them, and the worker
  cannot enumerate anyone's store to find them again. So the test is whether any
  public copy is outstanding, not what the visibility field alone says. The
  refusal is a plain sentence asking for the withdrawal to be finished first,
  never an exception.
- Every write to a project record goes through the per project serial queue in
  `app/projects/store.ts`. That is still the only door into the store, and the
  publish queue above is not a second one: it serialises sequences, never writes,
  and every write it makes goes through the same shared queue as any other.
- `publishedAt` is written once. A republish never touches it, which is what keeps
  a renamed project in its original feed position.
- All of 0002's invariants that this spec does not name still hold, in particular
  the 1 KB key and 400 KB value ceilings, the `https://<PUBLIC_SUBDOMAIN>.puter.site/`
  URL shape, and the single writer rule.

### Security model

Unchanged from 0002 in every respect, with two notes this spec adds.

- The intent first order does not widen anything. The worker still refuses to
  publish a project it cannot read as the caller, and it now additionally refuses
  one whose own record does not already say `public`, which is one more check
  rather than one fewer.
- The publicly readable window on a half finished publish is real and is now
  bounded to a project whose owner has already asked for it to be public. Nothing
  belonging to a project that is still `private` is ever copied.
- No moderation exists. Any signed in person can put a render into the shared
  feed and only its owner can withdraw it. This is deliberate, see Consequences.
- No regulated data is in scope.

### Configuration required

No new client environment variable, and **no manual setup step**. The worker
side `PUBLIC_SUBDOMAIN` constant from 0002 is still required and is still the one
thing a person edits.

Both this spec and 0002 said a person had to create that subdomain once by hand
with `puter.hosting.create` in a browser. **That is now known to be false.** The
task 4 hosting probe, on 2026-09-02, found `hosting` on the injected `me.puter`,
created a subdomain from inside the worker over the app's own directory, and
fetched a worker written file from the resulting public URL with no auth. The
worker ensures its own subdomain, so nothing here is owed to a person before
publishing can work. The full evidence is in Follow-up, and 0002's own
`Configuration required` is superseded on this point.

### Critical test scenarios

Verified by hand, per `CLAUDE.md`. No test runner, no browser automation.

- Platform check, before anything else is built: a `curl` to a scratch worker
  route confirming that `me.puter.kv` exposes `list` with `limit` and `cursor`,
  that a page of keys comes back in key order across a cursor boundary, and
  whether deleting a key between two pages skips an entry. Blocks **AC-16**.
- Failure case: publish a project, and unpublish it from a second tab while the
  publish is still copying files. Confirm no card is left behind for a project
  whose record reads private. Verifies **AC-13**, **AC-17**.
- Failure case: cause two republishes to complete out of order and confirm the
  older response is dropped rather than written. Verifies **AC-19**, **AC-22**.
- Failure case: get a project into the uncommitted state, then make it private
  instead of retrying, and confirm it goes private cleanly. Verifies **AC-17**.
- Happy path: publish a project with one complete render, then load `/community`
  in a private window with no session and see the card, its image, and its model
  label. Verifies **AC-3**, **AC-4**, **AC-12**.
- Happy path: publish enough projects to need two pages, page through, and check
  the order is strictly newest first with nothing repeated at the seam. Verifies
  **AC-16**.
- Failure case: publish, then kill the tab between the worker returning and the
  client committing `publicAssets`. Reload the gallery and confirm the project
  reads public and out of date with a working retry, and that the feed shows it.
  Verifies **AC-17**, **AC-22**.
- Failure case: fire two publishes of two different projects at the same instant
  from two tabs and confirm both cards appear, with no lock involved. Verifies
  **AC-8**, **AC-15**.
- Failure case: publish the same project twice in quick succession and confirm
  exactly one card exists and it did not move position. Verifies **AC-8**,
  **AC-10**.
- Failure case: rename a public project, confirm the card changes and stays where
  it was in the feed. Then set the machine clock an hour fast and confirm the
  freshness state is identical. Verifies **AC-10**, **AC-19**.
- Failure case: start a render, and rename the project while it is running.
  Confirm both the new name and the finished render survive. Verifies **AC-20**.
- Failure case: unpublish, then `curl` the public image URLs and confirm they no
  longer resolve, and that no file is left in the project's directory. Verifies
  **AC-9**, **AC-18**.
- Migration: open a gallery holding a record written before this change and
  confirm every project still appears. Verifies **AC-21**.
- Empty and withdrawn: load `/community` with nothing published, signed in and
  signed out, and open a withdrawn project's URL. Verifies **AC-23**, **AC-24**.
- Auth and permission: `curl -X POST /publish` with another account's project id,
  and separately with an id whose record still reads `private`, and confirm
  nothing enters the feed either time. Verifies **AC-7**, **AC-13**.
- Confirmation: make a project public and confirm it asks once; make it private
  and confirm it does not. Verifies **AC-25**.

## Build plan

The project's approach is a thin end to end thread first, then thicken
(`scope.md`). Tasks 1 and 2 are the ground everything rests on and cannot be
skipped. Tasks 3 to 6 are the thinnest public thread: one project reaching the
feed and loading for a signed out browser. Tasks 7 to 12 thicken it.

**Ground**

1. Prove the platform facts by hand before writing anything on top of them: that
   the worker's injected `me.puter` exposes `kv.set`, `kv.del` and `kv.list` with
   `limit` and `cursor`; that a listed page comes back in key order across a
   cursor boundary; and whether the cursor is opaque or positional, checked by
   deleting a key between fetching page one and page two and seeing whether an
   entry is skipped. A scratch route on the deployed worker and a `curl` is
   enough. If key order does not hold, stop and route back to `/architect` rather
   than improvising, because the whole index shape rests on it. If the cursor is
   positional, record that and keep `AC-16`'s stated fallback. Blocks **AC-16**.
2. Schema 3 in `app/projects/`: add `revision` to `Project` and
   `publishedRevision` to `PublicAssets` in `record.ts`, teach `parseProject` to
   accept a version 2 record and return it as version 3 with `revision` of `0`
   and `publicAssets` of `null`, and extend `checkProject` for the new invariants
   (revision is a non negative integer, `publishedRevision` present exactly when
   `publicAssets` is). Clearing `publicAssets` on upgrade is deliberate: feature 9
   has never shipped, so no version 2 record can legitimately carry one, and
   forcing a clean republish beats trusting a field that cannot exist. Change the
   type and its parser in the same commit, per `app/projects/AGENTS.md`. Satisfies
   **AC-21**, part of **AC-19**.
3. Move the serial queue: put `createSerialQueue` behind `updateProject` and
   `deleteProject` in `app/projects/store.ts`, keyed by project id, and delete the
   queue from `app/render/useProjectRenders.ts`, leaving guard 3 in place. Make
   `updateProject` increment `revision` only when `name` or `renders` is among the
   changes. The publish and unpublish actions built in tasks 6 and 9 go through
   this same queue, so a publish and an unpublish for one project cannot overlap.
   Satisfies **AC-20**, **AC-19**, part of **AC-13** and **AC-17**.

**The thin public thread**

4. Have the worker ensure its own hosted subdomain, and add the
   `PUBLIC_SUBDOMAIN` worker constant. **This was written as a manual
   prerequisite and the task 4 probe proved it does not have to be one**:
   `me.puter` exposes `hosting`, so the worker creates the subdomain over its own
   app relative directory itself, and the identity that owns the files is the
   identity that owns the subdomain over them. So this is code, not a checklist
   item: on the publish path, ensure the directory exists and, if
   `hosting.list()` does not already show `PUBLIC_SUBDOMAIN`, create it over the
   app relative `public/` directory rather than the app root, per the data model.
   `list()` and never `get()`, because a name resolving is not a name you own, per
   `worker/AGENTS.md`. Idempotent, so it costs one list on a path that is already
   doing real work. Prerequisite for **AC-4**.
5. Add `POST /publish` to the worker: re read the record through `user.puter`,
   refuse a record that does not already say `public` or has no complete render,
   copy every store C file to its derived path, **re read the record a second
   time and abandon if the visibility changed while copying**, then one `kv.set`
   of the entry key, then one `kv.set` of `feed:where:<projectId>`, then answer
   with `publicAssets`. Entry before pointer, so an orphaned pointer resolves to
   a `404` rather than a card pointing at nothing. Satisfies **AC-6**, **AC-7**,
   **AC-8**, **AC-11**, **AC-13**, **AC-15**, **AC-18**.
6. Add the client publish action, through the **publish** queue in
   `app/publish/queue.ts` and not the record queue from task 3, which deadlocks
   (see Key invariants): the intent write first, then the worker call, then the
   `publicAssets` commit, which drops a response whose `publishedRevision` is
   lower than the stored one. Each of those writes still lands through task 3's
   shared queue. A plain sentence and a retry on every failure. Satisfies
   **AC-17**, **AC-22**, **AC-14**.
7. Add the anonymous `GET /feed` route reading through `me.puter` with
   `kv.list({ pattern, limit, cursor, returnValues: true })`, and build the
   `/community` SPA route with a `clientLoader`, 24 cards a screen, and a load
   more control reachable by keyboard. Satisfies **AC-3**, **AC-4**, **AC-12**,
   **AC-16**, **AC-14**.

**Thickening**

8. Add `GET /feed/project/:projectId`: read `feed:where:<projectId>` for the
   `sortKey`, then the entry, with one indistinguishable `404` for a missing
   pointer, a missing entry, and an unknown id. Then the public project SPA route
   that renders it. Satisfies **AC-5**.
9. Add `POST /unpublish`, idempotent and with no "not published" error: derive
   the key from the record's own `publishedAt`, or from `feed:where` if the
   record no longer carries one, then `kv.del` the pointer, `kv.del` the entry,
   and delete the store C directory. Pointer before entry, mirroring publish.
   Then the client half, through the same publish queue as task 6: the
   `visibility` write first, and `publishedAt` and `publicAssets` cleared only
   after the worker confirms. It must work from the uncommitted state, which is
   how a stuck publish is abandoned, and a crash between those two writes is what
   leaves the `withdrawing` state. Satisfies **AC-9**, **AC-18**, **AC-17**.
10. Add the visibility toggle to the project sheet, with a confirmation on going
    public that names what happens and none on going private. Satisfies **AC-25**.
11. Add the freshness rule as a pure function in the projects feature, the out of
    date state with its retry on the project sheet, and the automatic republish
    fired from a subscription to the store's own write announcement, after a
    successful content write to a public project that still has a complete
    render. Driven by the store, not by the call sites, so the rename path and
    the render path cannot be wired one without the other. Skip the write that
    leaves nothing complete, per **AC-22**'s exception.
    Satisfies **AC-19**, **AC-22**, **AC-10**, **AC-14**.
12. Build the empty feed invitation, signed in and signed out, and the plain
    "not public" page with its link onward. Satisfies **AC-23**, **AC-24**.

## Migration plan

**Strategy**: feature flagged is not needed; this is a tolerant read plus a lazy
write, which is the safe sequence for a store with no schema and no downtime.

**Phases**:

1. Ship task 2 on its own: `parseProject` accepts both versions and returns
   version 3. Nothing writes version 3 yet, so a rollback is a plain revert.
2. Ordinary writes begin producing version 3 records, because `putProject`
   writes whatever `SCHEMA_VERSION` now says. Records upgrade one at a time as
   people use the app; nothing is backfilled and nothing needs to be, since the
   store cannot be enumerated across owners anyway.
3. The tolerant branch in `parseProject` stays indefinitely. It is one named
   branch in one function, and removing it later would strand exactly the records
   that were never touched again.

Store B needs no migration. It has never been written, because feature 9 has
never been built, so the chunked keys 0002 described do not exist anywhere.

**Rollback**: revert the commit. A version 3 record written before the revert
reads as unreadable to the old build, which is the existing behaviour for a
newer record and shows the existing sentence, so the failure is visible rather
than silent. Nothing is lost.

**Risks**: the one real risk is task 1's platform check failing after later tasks
are already built on it, which is why it is task 1 and why it blocks rather than
warns.

## Consequences

**Positive**:

- Three of store B's five keys stop existing, and with them the lock, the chunk
  arithmetic, the splice on unpublish, and the cleanup key. The most intricate
  part of 0002 is deleted rather than fixed, and what remains is two keys that are
  only ever written whole.
- Two of the six open problems are answered by removal rather than by design.
  There is no lock to get wrong, and no manifest to keep in step.
- A crashed publish now has exactly one failure state, it points the safe way,
  and it is visible to the one person who can fix it.
- Freshness becomes an integer comparison, so it is checkable by reading two
  numbers rather than by reasoning about two clocks.
- One write queue for every feature means the next feature that writes a project
  inherits the guarantee instead of having to remember it.

**Negative / tradeoffs**:

- The whole index shape rests on `puter.kv.list` returning keys in key order
  across a cursor boundary, which is not documented in the pinned SDK. Task 1
  exists to prove it, and if it fails the fallback is a real redesign, not a
  tweak.
- A publish that dies after copying files leaves publicly readable images for a
  project whose record says public and whose feed entry does not exist. The
  window is bounded and the owner asked for it, but it is a genuine exposure that
  the staged copy option would have narrowed.
- `publishedAt` is now a client clock. A machine an hour fast puts its project an
  hour early in the feed. Accepted because it is only ever a sort position, never
  a comparison, but it does mean feed order is not strictly the order things
  actually happened.
- `revision` counting only content is a subtle rule with a real bug behind it,
  and it lives in `updateProject` where a future change could break it without
  anything failing loudly until a project is permanently stale.
- **"No lock is needed" is true per key and not true across the sequence, and
  this is the honest limit of the design.** A publish and an unpublish of one
  project fired from two different tabs within the publish's file copying time
  can still, in principle, leave a live card for a project whose record reads
  private, which nobody can repair because the worker cannot enumerate anyone's
  store. The queue closes it in one tab and the worker's second read narrows it
  to one round trip across two. It is not closed, it is bounded, and closing it
  properly would mean a lease around the whole sequence, which is machinery this
  project has already had to fix twice in the render loop.
- The pointer key is a second write per publish and a second delete per unpublish,
  and the two can disagree if the worker dies between them. The orderings chosen
  make both disagreements harmless (an orphaned pointer reads as a `404`, an
  orphaned entry is unreachable by the single project route and disappears from
  the feed on the next unpublish), but there are now two keys to keep in step
  where the first draft had one.
- **There are two queues now, not one.** "One write queue for every feature" is
  still true of writes, and the publish queue is a second thing serialising a
  different unit, a whole sequence. It composes correctly and the reason it has
  to exist is a deadlock rather than a preference, but somebody reading
  `createSerialQueue` in two places has to know which is which, and the wrong one
  reached for from a third feature is a hang rather than a loud failure.
- **Five visibility states is one more than anybody wants to reason about.** The
  fifth is real, `withdrawing` is what a crashed unpublish leaves, and it is the
  unavoidable price of writing visibility first in both directions. Keeping the
  derivation in one pure function is what stops it multiplying further.
- No moderation. Any signed in person can put anything into one shared global
  feed and only its owner can take it down. Named here so it is a decision on
  the record rather than an oversight, and revisited when the feed is real.
- Store B is still durable derived state that only its own owner can repair, per 0002. Nothing here changes that.

**Neutral**:

- `feed:meta`'s `totalPublished` is gone, so nothing can show "142 projects
  shared" without adding a counter back. No screen asks for one.
- The flat shape is the one 0002's cross check raised and turned down. It is
  chosen now because `kv.list`'s cursor makes bounded reads possible on it, which
  was the reason it lost the first time.
- The public routes remain client rendered, so a crawler sees an empty shell.
  Unchanged from 0002 and still deliberate.

## Follow-up

- [x] Task 1's platform check ran on 2026-09-02, against scratch `/kv-probe/*`
      routes on the deployed worker, driven by `curl`. All three facts came back
      the way the index shape needs, so nothing here reopens.
  - **The `kv` surface is there.** The worker's injected `me.puter.kv` exposes
    `set`, `del` and `list`, and `list` honours `pattern`, `limit`, `cursor` and
    `returnValues`. Nothing in this spec is blocked on a missing method.
  - **Key order holds across a cursor boundary.** Entries were written out of
    order, then read back a page at a time with the returned cursor. The pages
    came back in key order with no key repeated and none skipped at the seam, so
    inverted timestamp keys really do read newest first, **AC-16** as written.
  - **The cursor is opaque, not positional.** A key on page one was deleted
    between fetching page one and page two, and page two was unaffected: nothing
    skipped, nothing shifted. So a concurrent unpublish cannot make the feed
    drop an unrelated card, and `AC-16`'s positional fallback is not needed.
  - The scratch routes have been removed and `worker/roomify.js` is byte for byte
    the file it was before the probe.
- [ ] The publish and unpublish race is bounded, not closed. If it ever shows up
      in practice, the answer is a lease around the sequence, and that is a
      decision worth its own `/architect` pass rather than an improvised fix.
- [ ] Confirm a real `FeedEntry` fits comfortably inside the 400 KB value ceiling
      once one exists. It is one entry per key now rather than 50, so this is
      almost certainly fine, and it is still worth one look.
- [x] The hosting check for task 4 ran on 2026-09-02, against scratch
      `/hosting-probe/*` routes on the deployed worker, driven by `curl`. It also
      closes 0002's open follow up, which is now ticked there. Every fact came
      back clean and the store C mechanism is confirmed end to end.
  - **`me.puter` has both `hosting` and `fs`.** So the app identity can create
    and own a subdomain itself, and task 4's "create the hosted subdomain in the
    app account" needs no person in a browser and no second account. One identity
    owns the directory and the subdomain over it.
  - **The app's root is `~/AppData/<appId>`, and only relative paths reach it.**
    Every absolute path tried failed; `.` and `""` resolve, landing at
    `/sanfsl/AppData/app-5f7912a9-…/`. **This cost the probe its first run**: the
    original `/hosting-probe` asked for a top level entry beside the user home
    directories and answered `Entry not found` to both `mkdir` and `write`, with
    `createMissingParents: true` set on both, because that flag creates parents
    under a root it can resolve and cannot invent the filesystem root. Store C's
    paths are therefore app relative, and `/<projectId>/floor-plan.<ext>` in the
    data model means relative to the app root, not to `/`.
  - **A subdomain created by `me` serves what `me` wrote, publicly and with no
    auth.** `hosting.create` bound `av-hosting-probe` to the app relative probe
    directory, and a plain `curl` of the file returned its exact bytes.
  - **`hosting.list()` confirms ownership; `get()` was never called.** The probe
    name came back in the list. Ownership is only ever read from `list`, per the
    `apps.get` lesson in `worker/AGENTS.md`.
  - **HeyPuter/puter#2295 does not bite this design.** That open issue reports
    `getReadURL` failing on files under AppData, and store C lives in AppData, so
    it was the live risk going in. Hosting serves those files regardless: the
    public fetch is a different path from `getReadURL`, and the publish design
    never needs the latter.
  - **The cross identity copy works, first try.** A 46,168 byte JPEG read through
    `user.puter.fs` and written through `me.puter.fs` came back byte for byte
    from its public URL, JFIF header and EXIF intact. No grant, no copy driver,
    no re-encode. This is 0002's follow up and the whole of build task 5.
  - The scratch routes have been removed and `worker/roomify.js` is byte for byte
    the file it was before the probe.
- [ ] 0002's six open problem checkboxes should be ticked with a pointer here
      rather than left open, and its `Locking`, `Write order on publish`, store B
      table, and staleness row should carry an amendment footnote pointing at this
      spec, in the style 0005, 0006 and 0007 already used on it.
- [ ] `app/projects/AGENTS.md` and `worker/AGENTS.md` both state facts this spec
      changes: the schema version, the two store description, and the worker
      owning no state. `/sync` should update them once this is built.
- [ ] **No rename and no regenerate control exists in the UI yet**, so `AC-22`
      and `AC-10`, the automatic republish, cannot be reached by pressing
      anything. `verify.md` carries a console recipe that drives a real content
      write through `updateProject` instead. Replace that step with the real
      control the moment one ships, because a recipe verifies the store and only
      a control verifies the path a person actually takes.
- [ ] Moderation is deliberately absent. Revisit before the feed is promoted
      anywhere public facing.
