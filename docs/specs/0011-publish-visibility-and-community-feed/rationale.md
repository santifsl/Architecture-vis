# 0011 rationale

The decision history behind
[`index.md`](index.md): what the problem actually was, what was weighed, and the
platform reading that settled it. `/develop` does not need this file.

## Context

Spec 0002 decided the three store model for making a project public, and a review
of it on 2026-08-27 found six things wrong with the publish design. All six sit
in the public half, which has never been built, so none of them is a bug in
shipped code. 0002 deliberately answered none of them, because each is a real
fork, and feature 9 was blocked on settling them.

The forces behind them are all the same one. Puter's key value store has no
transaction across keys and, as 0002's review read it, no conditional write and
no compare and swap either. Every mechanism 0002 reached for to make publishing
safe was therefore a read followed by a write, which two callers can interleave:
the fenced lock, the chunk rewrite, the pointer key, the cleanup key. The design
compensated with careful ordering, which works for the cases it enumerates and
leaves the rest as drift that only the affected owner can repair.

Two more forces sit underneath. The client and the worker have different clocks,
and 0002 compared them to decide whether a public copy was out of date, which is
a comparison that cannot be right. And the commit that makes a project public
spans three stores with the browser as the coordinator, so a tab that closes at
the wrong moment leaves a project live in the feed with its own record still
saying private, which contradicts `AC-13`.

The consequence of not deciding is that feature 9 stays blocked, and it is the
feature that makes the product's central promise, a shared feed anyone can
browse, actually true.

**What the pinned SDK actually offers.** Reading
`node_modules/@heyputer/puter.js/src/modules/kv/` and its generated types, rather
than reasoning from the API shape, changed the ground under three of the six
problems. `puter.kv` has more than `incr` and `decr`:

- `add(key, { path: value })` and `update(key, { path: value })` are server side
  driver calls (`puter-kvstore.add`, `puter-kvstore.update`) that modify a value at
  a dot path. On an array path, `add` is an append performed on the server.
- `list` accepts `{ pattern, limit, cursor, returnValues, includeTotal,
fetchUntilFull }` and returns `{ items, cursor?, total? }`. That is real cursor
  pagination.
- `expireAt` exists alongside `expire`.

The `list` cursor is the important one. 0002's cross check raised a flat, one key
per published project shape as a way to drop the lock and the chunk arithmetic
entirely, and 0002 turned it down "in favour of bounded reads and exact ordering".
Bounded reads on a flat shape are exactly what a `limit` and a `cursor` provide,
so the reason that option lost no longer holds.

**What is still unproven.** Those are facts about the browser SDK. The worker's
injected `me.puter` and `user.puter` are a different runtime, and nothing here
proves it exposes the same `kv` surface. Nor is `list`'s ordering across a cursor
boundary documented anywhere in the package. Both are cheap to check against the
deployed worker with a `curl`, and both are load bearing, which is why they are
build task 1 and a hard gate rather than an assumption.

**What was already solved and the spec did not know.** Open problem 6 said
`updateProject` is unsafe against two renders finishing at once, and predicted
the answer would be serialising writes per project in the client.
`createSerialQueue` in `app/auth/singleFlight.ts` exists and
`app/render/useProjectRenders.ts` already routes every render write for one
project through it. So the problem is narrowed rather than open. What keeps it
open is placement: the queue is module scope inside the render feature, so a
rename, a visibility toggle, and a `publicAssets` commit would all sit outside it.

## Options considered

### Option 1: flat index, intent first publish, revision counter

One key per published entry named so key order is newest first, paged with
`kv.list`'s cursor. Publish is one `kv.set`, unpublish one `kv.del`. The client
writes `visibility` before calling the worker. Freshness is an integer on the
record compared against the integer the entry was built from.

**Pros**:

- Deletes the lock rather than redesigning it, along with the chunk arithmetic,
  the pointer key, the meta key, and the cleanup key.
- Every store B write is a whole key operation, so the "no read then write"
  invariant is checkable by reading the code once.
- The crash state points the safe way and is visible to the owner.
- No clock is compared to another clock anywhere.

**Cons**:

- Rests on `kv.list` returning key order across a cursor boundary, which is
  undocumented in the pinned SDK.
- `publishedAt` becomes a client clock, so feed order is approximately, not
  exactly, the order things happened.
- The `revision` counting rule (content only) is subtle and lives in one function
  where breaking it fails silently and permanently.

### Option 2: keep chunks, append with `kv.add`

Keep `feed:page:<nnnn>` and append entries with the server side `kv.add` instead
of reading and rewriting a chunk.

**Pros**:

- Keeps 0002's bounded reads exactly as specified, with no faith in `list`
  ordering at all.
- `add` is atomic on the server, so the insert path needs no lock.
- Ordering within the index is exact, because it is the order of appends.

**Cons**:

- Only the insert is fixed. Unpublish still has to splice an entry out of a
  chunk, which is a read then write, so the lock comes back for the delete path
  and so does most of its complexity.
- Keeps `feed:where`, keeps `feed:meta`, keeps the chunk roll.
- Rests on `kv.add`'s array append semantics on the server, which is the same
  class of unproven platform fact as `list` ordering, with more built on top.

### Option 3: keep chunks, rebuild the lock on `incr`

The narrowest change. Keep 0002's design and replace only the fenced lock with
the leased claim pattern `app/render/claim.ts` already proves works: one `incr`,
the caller handed `1` owns it, an `expire` bounds it.

**Pros**:

- Smallest diff, and it reuses a pattern already written, already debugged twice,
  and already documented in `app/render/AGENTS.md`.
- No new platform facts needed. `incr` and `expire` are proven in production code
  in this repository.

**Cons**:

- Fixes one of six problems and leaves the chunk arithmetic, the splice, the
  pointer key, the cleanup key, and the republish ordering bug all standing.
- Keeps the most intricate part of the design rather than removing it, and every
  later change pays for it.
- A lease is not a lock: the render claim can degrade to `unguarded` on a KV
  hiccup, which is acceptable when the cost is a duplicate paid render and much
  less acceptable when the cost is a corrupted shared index.

## Rationale

Option 1 wins because it answers the six problems by deleting the machinery that
caused them, and the one fact that made it lose in 0002 is no longer a fact.
0002 chose chunks over the flat shape for bounded reads, and `kv.list`'s `limit`
and `cursor` give bounded reads on the flat shape directly. With chunks gone,
there is no chunk to read and write back, so the lock has nothing to protect, so
problem 1 does not need the `incr` redesign the topic asked for. Problem 4,
republish ordering, dissolves the same way: `publishedAt` is written once and is
the key, so a republish rewrites the entry's contents at its own key and cannot
move.

Option 3 was seriously considered and is the one a cautious reading favours,
because it reuses a proven pattern and needs nothing new from the platform. It
was turned down because it is a fix that leaves five of six problems standing,
and because the thing it preserves, chunked pages with a splice on delete, is
precisely the part of 0002 the review found hardest to reason about. Fixing the
lock and keeping the chunks buys a correct lock guarding a design that still has
the ordering bug, the pointer key, and the cleanup key in it.

Option 2 is the honest middle and loses on the delete path. `kv.add` makes
appends atomic and does nothing for a splice, so the lock returns for unpublish,
and unpublish is the path that must be right because `AC-9` promises withdrawal
is real rather than a flag.

The intent first commit order for problem 2 follows from the single writer rule
that `app/projects/AGENTS.md` and `worker/AGENTS.md` both state. The alternative
that removes the window entirely is the worker writing store A itself through
`user.puter`, and it was turned down because it puts invariant enforcement in the
one component with no types, no build, and no local run. Writing intent first
does not remove the window; it chooses which side of it the system lands on. A
record that says public with no entry is repairable by its own owner in one
press. An entry with a record that says private is repairable by nobody, because
the worker cannot enumerate anyone's store to find it.

Problem 3, orphaned public files, is answered by that same intent record rather
than by a manifest. Once the record durably says the project is published, and
once store C paths are a pure function of the project id, there is nothing to
track: the next publish overwrites the same paths and unpublish derives and
deletes them. The staged copy alternative narrows the exposure window and doubles
the file operations to do it, and the durable manifest alternative adds a fourth
store B key whose only code path runs after a failure, which is the code least
likely to be correct in a project with no test runner.

Problem 5 is a revision counter rather than a worker issued timestamp because a
round trip in the path of a rename is a worse product than an integer, and
because the integer is readable by hand. The one sharp edge found while designing
it is recorded as an invariant: if committing `publicAssets` bumped `revision`,
every publish would invalidate itself the instant it succeeded. So `revision`
counts content changes only, which is also what it means.

Problem 6 is a placement fix, not a new mechanism. One queue behind
`app/projects/store.ts` is the only shape that actually serialises, because two
queues do not serialise against each other, and the render feature's own queue
becomes a second door the moment feature 9 adds a writer.

The engineer chose every recommended option in the design conversation, so no
stated preference conflicts with the recommendation here.

## What a cross check changed, 2026-09-02

A read only critique of the first draft, on a different model, found five things
worth recording, because four of them were wrong in the draft rather than merely
unclear.

- **The anonymous single project route could not find its key.** The draft deleted
  `feed:where:<projectId>`, reasoning the key is recomputable from the record's
  own `publishedAt`. True for publish and unpublish, which hold a session and re
  read the record; false for `GET /feed/project/:projectId`, which is anonymous
  and holds only an id. And it cannot scan for one either: `kv.list`'s `pattern`
  is documented as prefix only with a trailing `*`, so `feed:entry:*:<id>` matches
  nothing. `AC-5` and `AC-24` were unbuildable. The pointer key is restored, as a
  whole key `set` and `del`, which does not bring the lock back.
- **A slow publish can land after an unpublish and orphan a card.** The draft
  claimed no lock is needed and meant it per key, which is true, and read as if it
  meant across the sequence, which is not. The worker reads the record, spends
  time copying files, and its `kv.set` can arrive after the unpublish's `kv.del`.
  The result is a live card for a project whose record correctly reads private,
  and nobody can repair it because the worker cannot enumerate anyone's store.
  Answered with the per project queue (closes it in one tab) plus a second record
  read immediately before the `kv.set` (narrows it to one round trip across two),
  and named in Consequences as bounded rather than closed. The critique proposed
  a lease around the whole sequence instead; that was declined, because a lease
  is the one mechanism that can wedge a project's visibility if a worker stalls,
  and this project has already had to fix the render loop's lease twice.
- **Two republishes can complete out of order.** The older response landing last
  would make the record read fresh while the public copy shows earlier content,
  which is exactly what the revision counter exists to prevent. Answered by
  dropping a commit whose `publishedRevision` is lower than the stored one, the
  same compare before write shape as render guard 3.
- **`/unpublish` trapped a crashed publish.** Its `404 not published` was
  ambiguous and, read one way, meant an owner in the uncommitted state could only
  retry and never abandon. It is now idempotent with no such error.
- **The republish trigger named no site.** `name` changes and `renders` changes
  come from different call sites, and a builder could wire one and not the other.
  It now fires from inside `updateProject`, the single door both already pass
  through.

One further point the critique raised is recorded rather than fixed: whether
`kv.list`'s cursor is opaque or positional decides whether a concurrent unpublish
can skip a card mid paging. Build task 1 now tests it, and `AC-16` states what it
means in each case.

## Evidence

**Read from the repository, 2026-09-02.**

- `node_modules/@heyputer/puter.js/src/modules/kv/add.js`: `add` is
  `makeDriverMethod({ iface: 'puter-kvstore', method: 'add' })`, a server side
  call taking a `pathAndValueMap`.
- `node_modules/@heyputer/puter.js/types/modules/kv/index.d.ts`: the module
  exposes `set`, `get`, `del`, `incr`, `decr`, `add`, `remove`, `update`,
  `expire`, `expireAt`, `list`, `flush`. `MAX_KEY_SIZE` is `1024`.
- `node_modules/@heyputer/puter.js/types/modules/kv/types.d.ts`: `KVListOptions`
  carries `pattern`, `returnValues`, `limit`, `cursor`, `offset`, `includeTotal`,
  `fetchUntilFull`; `KVListPage` carries `items`, `cursor?`, `total?`. `offset` is
  documented as slower and capped at 5000, and `includeTotal` as metered, which is
  why the design uses `cursor` and stores no total.
- `node_modules/@heyputer/puter.js/src/modules/kv/kv.test.js`: covers argument
  shaping on the client only. It proves nothing about server semantics, which is
  why build task 1 exists.
- `app/render/claim.ts`: the `incr` based leased claim, with its three states and
  the `LEASE_MARGIN_MS` reasoning. The pattern option 3 would have reused.
- `app/auth/singleFlight.ts` and `app/render/useProjectRenders.ts:60`: the per
  project serial queue, already built, currently scoped to the render feature.
- `app/projects/store.ts:279`: `updateProject`'s own comment saying it is not
  safe against two writers and reasoning that it does not need to be, with the
  concurrency that matters deferred to "the worker's lock in feature 9". That
  lock is now gone, and the reasoning is replaced by the queue instead.
- `worker/roomify.js`: the worker as it stands, using `user.puter` only. Nothing
  in it touches `me.puter` yet, which is why the worker side `kv` surface is
  unproven.
