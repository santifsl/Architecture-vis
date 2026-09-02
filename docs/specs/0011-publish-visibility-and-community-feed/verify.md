# 0011 verify: publish, the community feed, and the revision counter

Hand walkthrough, per `CLAUDE.md`: a real dev server, a real browser, and `curl`
against the deployed worker. No test runner, no browser automation.

Each step names the acceptance criterion it proves. The gate below runs first and
blocks everything: the index shape rests on a platform fact nobody has proven.
Then the code shape steps, which are cheap and catch mistakes that would leave
every runtime step looking fine while being wrong.

## The gate, before anything is built

- [ ] Deploy a scratch route on the worker that writes a handful of
      `feed:entry:*` keys through `me.puter.kv.set` **out of order**, then reads
      them back a page at a time:

```js
await me.puter.kv.list({
  pattern: "feed:entry:*",
  limit: 2,
  cursor,
  returnValues: true,
});
```

- [ ] `me.puter.kv` exposes `set`, `del` and `list` at all. If `me.puter` has no
      `kv`, stop: nothing in this spec is buildable and it needs a new decision,
      not a workaround.
- [ ] Two pages read with the returned `cursor` come back in **key order**, with
      no key repeated and none skipped at the seam. This is what makes newest
      first true, **AC-16**.
- [ ] Delete one key between fetching page one and page two, and see whether an
      entry is skipped. That answers whether the cursor is opaque (safe) or
      positional (a card can be skipped by a concurrent unpublish). Record which,
      because `AC-16` has a different meaning in each case.
- [ ] If key order does not hold, stop and route back to `/architect`. Do not
      improvise a sort, because a page assembled in the wrong order cannot be
      fixed by sorting it.
- [ ] Record the result in `index.md`'s Follow-up either way.

## Before you start the rest

- [ ] `npm run dev` boots to the home screen rather than `ConfigScreen`.
- [ ] The `PUBLIC_SUBDOMAIN` exists in the app account and its name is in the
      worker constant.
- [ ] You are signed in and have **three** projects: one with a complete render,
      one still rendering, and one saved before this change (a schema version 2
      record). The old one is the only way to check the migration.
- [ ] A second browser profile or a private window with **no** Puter session.

## Commands and code shape

- [ ] `npm run verify` passes clean: typecheck, lint, format, contrast, build.
- [ ] `grep -rn "feed:lock\|feed:meta\|feed:cleanup\|feed:page" worker/ app/`
      returns nothing. Those four keys are deliberately gone, and a leftover one
      means the chunked design came back in, **AC-15**. `feed:where` **should**
      appear, in the worker only; it is the single project route's only way to
      find a key.
- [ ] `/publish` writes the entry **before** the pointer, and `/unpublish`
      deletes the pointer **before** the entry. Both orderings make the
      half finished state harmless, and reversing either makes it a card pointing
      at nothing, **AC-5**.
- [ ] `/publish` re reads the record a second time after the file copy and before
      its `kv.set`. Without it, a slow publish can land after an unpublish and
      leave a card nobody can remove, **AC-13**, **AC-17**.
- [ ] `/unpublish` has no "not published" branch and answers `{ ok: true }` when
      it finds nothing. An owner stuck in the uncommitted state has no other way
      out, **AC-17**.
- [ ] The `publicAssets` commit drops a response whose `publishedRevision` is
      lower than the stored one. Read the comparison by hand, **AC-19**.
- [ ] The publish and unpublish actions go through the same per project queue as
      the record writes, not around it, **AC-13**, **AC-17**.
- [ ] The automatic republish is fired from inside `updateProject`, not from the
      rename handler and the render loop separately. Two call sites is how one of
      them ends up forgotten, **AC-22**.
- [ ] In `worker/roomify.js`, every `me.puter.kv` call is a `set`, a `del`, or a
      `list`. No `get` on a `feed:*` key followed by a `set` of it anywhere. This
      is the invariant that replaces the lock and it is checkable by eye,
      **AC-15**.
- [ ] `grep -rn "createSerialQueue" app/` finds it in `app/auth/singleFlight.ts`
      and used in `app/projects/store.ts`, and **not** in
      `app/render/useProjectRenders.ts`. Two queues do not serialise against each
      other, so a leftover render queue is worse than none, **AC-20**.
- [ ] `updateProject` increments `revision` only when `name` or `renders` is among
      the changes. Read the branch by hand. If a `publicAssets` write bumps it,
      every publish invalidates itself the instant it succeeds and every public
      project is permanently stale, which looks like a feed problem and is not,
      **AC-19**.
- [ ] `parseProject` has one named branch accepting `schemaVersion` `2` and
      returning `revision: 0`. Check the type in `record.ts` and the parser in
      `invariants.ts` changed together, per `app/projects/AGENTS.md`, **AC-21**.
- [ ] The store C path builder is a pure function of `projectId` and the file
      extension. `grep -rn "Date.now\|random\|uuid" worker/` shows nothing in the
      publish path's path building, **AC-18**.
- [ ] The freshness rule is a pure function, not an inline comparison in a
      component, and it reads no clock. `grep -rn "Date.now" app/projects/` shows
      it nowhere near the staleness check, **AC-19**.
- [ ] `/publish` refuses a record whose own `visibility` is not already `public`.
      Read the guard. Without it the intent first order is a client convention
      rather than an enforced one, **AC-17**.

## Runtime, the happy path

- [ ] Make the complete project public. It asks once, in a sentence naming what
      happens, **AC-25**.
- [ ] Make it private again. It does **not** ask, **AC-25**.
- [ ] Make it public again, then load `/community` in the signed out window. The
      card is there with its image and its model label, and no sign in popup
      appeared at any point, **AC-3**, **AC-4**.
- [ ] Open that project's own URL in the same signed out window and see the owner's
      view minus the edit and regenerate controls, **AC-5**.
- [ ] Publish enough projects to need two pages. Page through with the load more
      control, using the keyboard only. Order is strictly newest first and nothing
      repeats at the seam, **AC-12**, **AC-16**.

## Runtime, the failures

- [ ] Publish, and kill the tab between the worker answering and the client
      committing `publicAssets`. Reload the gallery: the project reads public and
      out of date with a retry that works. The feed shows it. At no point did the
      gallery read private while the card existed, **AC-17**, **AC-22**.
- [ ] Publish two different projects at the same instant from two tabs. Both cards
      appear, **AC-8**, **AC-15**.
- [ ] Publish the same project twice in quick succession. Exactly one card exists
      and it did not move position, **AC-8**, **AC-10**.
- [ ] Rename a public project. The card's name changes and the card stays where it
      was in the feed, **AC-10**.
- [ ] Set the machine clock an hour fast, reload, and check the freshness state is
      identical. Then an hour slow. Same state both times, **AC-19**.
- [ ] Start a render and rename the project while it is running. Both the new name
      and the finished render survive, **AC-20**.
- [ ] Unpublish. `curl` the public image URLs and confirm they no longer resolve,
      and that the project's directory under the subdomain is empty, **AC-9**,
      **AC-18**.
- [ ] Publish from one tab and unpublish from a second while the first is still
      copying. No card is left behind for a project whose record reads private.
      This is the residual race the design bounds rather than closes, so if a card
      does survive, check the queue and the worker's second read before
      concluding the design is wrong, **AC-13**, **AC-17**.
- [ ] Get a project into the uncommitted state (kill the tab mid publish), then
      make it private instead of retrying. It goes private cleanly and no error
      appears, **AC-17**.
- [ ] Cause two republishes to complete out of order, by making one worker call
      slow. The older response is dropped and the project does not read fresh
      while showing the earlier content, **AC-19**, **AC-22**.
- [ ] Try to delete a public project. It refuses with the sentence asking for an
      unpublish first, which is 0002's existing rule and must still hold, **AC-9**.
- [ ] Open the gallery holding the pre change project. It is still there,
      **AC-21**.
- [ ] Point `VITE_PUTER_WORKER_URL` at nothing and load `/community`. A plain
      sentence and a retry, and the personal gallery still loads, **AC-14**.

## Runtime, auth and the empty states

- [ ] `curl -X POST /publish` with another account's project id and a made up
      name. Nothing enters the feed, **AC-7**.
- [ ] `curl -X POST /publish` with an id whose record still reads `private`. It
      refuses with a `409` and nothing enters the feed, **AC-13**, **AC-17**.
- [ ] `curl` the feed with no session at all. It answers, **AC-3**.
- [ ] Unpublish everything and load `/community` signed out, then signed in. Two
      different invitations, each with the action that fits, **AC-23**.
- [ ] Open a withdrawn project's URL, a private project's URL, and a made up id.
      All three show the identical plain "not public" page with a link to the
      feed, and nothing distinguishes them, **AC-24**, **AC-5**.
