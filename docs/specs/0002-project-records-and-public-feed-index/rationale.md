# 0002 rationale: project records and the public feed index

The build spec lives beside this file in `index.md`. This file is the decision
record: why the shape is what it is, what else was weighed, and what the claims
here were actually checked against.

## Context

> ⚠️ Premise note: this spec knowingly stores derived data. A feed entry is a
> denormalized copy of fields that already live in the owner's own record, and
> the usual rule is to compute at read time rather than store and let it go
> stale. There is no query engine here to compute with: `puter.kv` is scoped per
> user per app, so "every public project across all users, newest first" is not
> a question any single store can answer. The copy is the only way to answer it.
> What makes the duplication survivable is that publish is idempotent and
> rewrites an entry in place, so an owner republishing repairs their own entries.
> Be honest about the limit of that: the worker cannot enumerate other people's
> stores, so there is no central sweep that rebuilds the whole index. The feed
> index is durable state to look after, not a cache to throw away.

Roomify has no relational database and no server of its own. Puter is the whole
backend, and its key value store is the only persistence. So the data model here
is really two questions at once: what a project record holds, and how the
community feed finds public projects. They cannot be separated, because the
answer to the second one dictates which fields the first one has to carry.

The hard force is the one spec 0001 raised and left open. `puter.kv` is scoped
per user per app. Its own generated types say so plainly: each app has a private
store inside each user's account, and reaching another app's namespace needs an
`app-data:<appUuid>:kv:<op>` grant that `puter.perms.requestAppData()` asks a
signed in person for. `puter.fs.share` only accepts an email address or a Puter
username. A signed out visitor is not a reader holding weaker permissions. They
hold no credentials at all, so no grant and no share can reach them. Feature 9
promises that anyone can browse the community feed without an account, and that
promise does not follow from any KV read performed as the visitor.

The consequence of not deciding this now is that feature 5 and feature 6 write
project records in whatever shape is convenient, feature 9 discovers the feed
cannot read them, and the record shape gets reworked after two features already
depend on it.

Two secondary forces shape the rest. The app is a static SPA with no server of
ours, so anything that has to be trusted has to be trusted by the Puter worker,
not by the browser. And CLAUDE.md rules out a test runner and browser
automation, so every claim below had to be checked by reading the SDK's own
source and types, or by an actual HTTP request, not by assumption.

## What was verified, and how

Checked on 2026-08-27 against the installed `@heyputer/puter.js` version 2.6.2,
its generated types and its source, plus live requests.

- **KV really is per user per app.** `types/modules/kv/index.d.ts` states each
  app has its own private store within each user's account, and
  `types/modules/kv/types.d.ts` documents `KVOptConfig.appUuid` as needing an
  `app-data:<appUuid>:kv:<op>` permission obtained through
  `puter.perms.requestAppData()`. No anonymous path exists.
- **`puter.fs.share` cannot reach an anonymous visitor.**
  `types/modules/FileSystem/types.d.ts` types a share recipient as an email or a
  username only.
- **`puter.fs.getReadUrl` is not a permanent public URL.**
  `types/modules/FileSystem/operations/getReadUrl.d.ts` documents an `expiresIn`
  duration, and a sibling `revokeReadUrl` exists to kill one. It also reads a
  single file and cannot list anything, so it can never be a feed.
- **`*.puter.site` serves anonymously.** `curl` with no credentials at all
  returned `200 text/html` from two live subdomains
  (`file-sharing-example.puter.site` and `docs.puter.site`), and a subdomain that
  does not exist returned a plain `404 Subdomain not found` with no
  authentication challenge. `puter.hosting.create(subdomain, dirPath)` is
  therefore a genuine anonymous read channel.
- **A worker can be called without a session, and can tell the difference.**
  `src/modules/Workers.js:127` only attaches the `puter-auth` header when the
  caller has not set `x-puter-no-auth`, and the documented router handler
  receives `user.puter` (the calling person's resources, present only when the
  call carried a session) separately from `me.puter` (the worker owner's own
  resources). So one worker endpoint can serve anonymous readers and still
  identify a signed in publisher.
- **Not verified by hand:** no worker is deployed yet (`.env.local` holds a
  placeholder URL), so the anonymous `*.puter.work` request and the worker side
  copy from `user.puter.fs` into `me.puter.fs` rest on the SDK source and the
  docs rather than on a real call. Both are listed as verification steps in
  `index.md`.

## Options considered

### Option 1: a worker endpoint over a central KV index (chosen)

The Puter worker, which feature 6 already requires, also serves the feed. It
holds a feed index in its own owner's KV through `me.puter`, answers
unauthenticated `GET` requests for feed pages and single public projects, and is
the only writer of that index.

**Pros**:

- Anonymous readers are served by a channel that is genuinely anonymous, with no
  credentials and no sign in popup, which is what AC-2 of spec 0001 demands.
- The worker is the only place ownership can be checked, because it is the only
  place that holds both the caller's session and a store the caller cannot write.
- Reuses a component the stack already needs. No new platform surface.
- Real pagination, since the index is chunked and every read is bounded.

**Cons**:

- The worker becomes a single point of failure for the public feed. If it is
  down, the feed is down, while the personal gallery keeps working.
- The index is a second copy of data, so it can drift from the owner records.
- Feed traffic is metered against the worker owner's account, not the visitor's.

### Option 2: a static feed file on a hosted subdomain

The worker regenerates a `feed.json` into a hosted directory on each publish;
visitors fetch that file straight from `*.puter.site`.

**Pros**:

- The cheapest and most cacheable read possible. No worker invocation per
  visitor, and static hosting is the one channel proven anonymous by direct test.
- Survives a worker outage, since the file is already published.

**Cons**:

- Every publish rewrites a whole file, so concurrent publishes clobber each
  other far more destructively than a chunked KV page does.
- Pagination means slicing files by hand and republishing the slices.
- Still needs the worker for publish and unpublish anyway, so it adds a
  representation rather than removing one.

### Option 3: full records in one central store

Every project, private ones included, lives in the worker owner's KV keyed by
username.

**Pros**:

- One store, one representation, no drift by construction.
- Cross user queries become straightforward.

**Cons**:

- Throws away the per user isolation Puter gives for free, and puts every
  person's private work in one account that one bug can expose.
- Every gallery read becomes a worker call, so a signed in person's own projects
  stop working the moment the worker does.
- Storage for the whole product bills to one account.

### Option 4: per project `fs.getReadUrl`

Store an authentication free read URL per project on the record and let the feed
point at those.

**Pros**:

- No second store, no worker in the read path, nothing to keep in step.

**Cons**:

- `getReadUrl` expires and is revocable by design, so a feed built on it decays
  silently.
- It reads one known file and cannot enumerate anything, so there is no way to
  produce a list of public projects at all. It answers a different question.

## Rationale

Option 1 is the only option that answers the actual constraint rather than
working around it. The forcing fact from Context is that no credential exists on
the visitor's side, so the read has to happen somewhere that holds a credential
of its own. `me.puter` inside the worker is exactly that, and it is already in
the stack for feature 6, which matters more than elegance here: this is a small
project with no server, and adding a second platform surface to serve a feed
would be a worse trade than accepting one metered call per feed page.

Keeping the owner's KV as the source of truth (rather than Option 3's single
central store) preserves the property that a signed in person's own gallery
depends on nothing but their own account. The worker can be broken, unpaid, or
redeployed, and someone's own work is still there. That is worth the drift risk,
because an owner republishing repairs their own entries and the alternative
failure is not repairable at all.

Option 2 was close, and its static read really is cheaper and proven anonymous
by direct test. It lost on writes, not reads: a full file rewrite per publish is
a worse concurrency story than a chunked page rewrite behind a short lock, and
it still needs the worker for the write path, so it buys read performance at the
cost of a second representation. It stays on record as the natural optimization
if feed reads ever become a real cost, and `index.md` notes it as such.

Two smaller calls follow from the same reasoning. The worker rebuilds each feed
entry by reading the project back through `user.puter` rather than trusting the
posted body, because the body is client controlled and the public feed is the
one surface where a forged entry would be visible to strangers. And public
images are copied into an app owned hosted directory rather than the publisher's
own, because a feed card whose image dies when its author deletes a subdomain is
a broken product surface, and subdomain names are a shared global namespace that
per user creation would have to fight.

## References

**Project sources**:

- `CLAUDE.md`: Puter is the whole backend, no API route and no database; fail
  fast on missing configuration; never show a raw provider error; no test runner
  and no browser automation, verify by hand or with `curl`.
- `scope.md` feature 3, which raised this exact constraint, and features 5, 6, 7,
  9 and 10, which consume the record shape decided here.
- Spec [0001](../0001-puter-auth-and-platform-access/index.md): `withPuter` is
  the single doorway to `puter.fs`, `puter.kv` and `puter.workers`, and its AC-2
  bars any unbidden sign in popup, which is what rules out a KV read as the
  anonymous read path.
- The installed `@heyputer/puter.js` 2.6.2 types and source, quoted in
  _What was verified_ above. Per CLAUDE.md the package itself is the reference,
  not training data.

**Practices & standards**:

- Denormalized read model derived from a system of record, so the copy is never
  authoritative even though it is durable.
- A fenced lock rather than a bare expiring one, so a stalled holder cannot
  overwrite work that finished while it was gone.
- Write ordering chosen so every partial failure is either invisible or repaired
  by the next write, since there is no multi key transaction to lean on.
- Server side re trust of client claims: never build a public artifact from a
  client supplied payload.
- Bounded pagination on every list read, including the first version.

**Links** (fetched and confirmed on 2026-08-27):

- Puter serverless workers: https://docs.puter.com/Workers/
- Worker router and handler context: https://docs.puter.com/Workers/router/
- `puter.hosting.create()`: https://docs.puter.com/Hosting/create/
- Key value store: https://docs.puter.com/KV/
- Security and permissions: https://docs.puter.com/security/
- A live hosted subdomain, fetched anonymously as proof:
  https://file-sharing-example.puter.site/
