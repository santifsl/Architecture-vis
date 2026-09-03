# 0011 verify: publish, the community feed, and the revision counter

Hand walkthrough, per `CLAUDE.md`: a real dev server, a real browser, and `curl`
against the deployed worker. No test runner, no browser automation.

Each step names the acceptance criterion it proves. The gate below runs first and
blocks everything: the index shape rests on a platform fact nobody has proven.
Then the code shape steps, which are cheap and catch mistakes that would leave
every runtime step looking fine while being wrong.

## The gate, before anything is built

- [x] Deploy a scratch route on the worker that writes a handful of
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

- [x] `me.puter.kv` exposes `set`, `del` and `list` at all. If `me.puter` has no
      `kv`, stop: nothing in this spec is buildable and it needs a new decision,
      not a workaround.
- [x] Two pages read with the returned `cursor` come back in **key order**, with
      no key repeated and none skipped at the seam. This is what makes newest
      first true, **AC-16**.
- [x] Delete one key between fetching page one and page two, and see whether an
      entry is skipped. That answers whether the cursor is opaque (safe) or
      positional (a card can be skipped by a concurrent unpublish). Record which,
      because `AC-16` has a different meaning in each case.
- [x] If key order does not hold, stop and route back to `/architect`. Do not
      improvise a sort, because a page assembled in the wrong order cannot be
      fixed by sorting it.
- [x] Record the result in `index.md`'s Follow-up either way.

## Before you start the rest

- [ ] `npm run dev` boots to the home screen rather than `ConfigScreen`.
- [x] The `PUBLIC_SUBDOMAIN` exists in the app account and its name is in the
      worker constant. It is bound to the app relative `public/` directory, not
      to the app root, so nothing else the app account writes is served. The
      public URL shape is identical either way, so this is only checkable by
      reading `PUBLIC_ROOT` in `worker/roomify.js`, **AC-4**.
- [ ] You are signed in and have **three** projects: one with a complete render,
      one still rendering, and one saved before this change (a schema version 2
      record). The old one is the only way to check the migration.
- [ ] A second browser profile or a private window with **no** Puter session.

## Commands and code shape

- [x] `npm run verify` passes clean: typecheck, lint, format, contrast, build.
- [x] `grep -rn "feed:lock\|feed:meta\|feed:cleanup\|feed:page" worker/ app/`
      returns nothing. Those four keys are deliberately gone, and a leftover one
      means the chunked design came back in, **AC-15**. `feed:where` **should**
      appear, in the worker only; it is the single project route's only way to
      find a key.
- [x] `/publish` writes the entry **before** the pointer, and `/unpublish`
      deletes the pointer **before** the entry. Both orderings make the
      half finished state harmless, and reversing either makes it a card pointing
      at nothing, **AC-5**.
- [x] `/publish` re reads the record a second time after the file copy and before
      its `kv.set`. Without it, a slow publish can land after an unpublish and
      leave a card nobody can remove, **AC-13**, **AC-17**.
- [x] `/unpublish` has no "not published" branch and answers `{ ok: true }` when
      it finds nothing. An owner stuck in the uncommitted state has no other way
      out, **AC-17**.
- [x] The `publicAssets` commit drops a response whose `publishedRevision` is
      lower than the stored one. Read the comparison by hand, **AC-19**.
- [x] The publish and unpublish actions go through the **publish** queue in
      `app/publish/queue.ts`, and each individual record write inside them still
      goes through the record queue in `app/projects/store.ts`. This step used to
      read "the same per project queue as the record writes" and **that check
      fails as written**: one queue deadlocks on the first press, because a
      publish sequence held inside a record queue turn waits for a position that
      turn has to return to free. Two queues here is correct, not a leak. What
      would be wrong is a publish sequence writing a record around the store,
      **AC-13**, **AC-17**.
- [x] The automatic republish is driven by the store's own write announcement
      from inside `updateProject`'s turn, not by the rename handler and the render
      loop separately. Two call sites is how one of them ends up forgotten,
      **AC-22**.
- [x] That republish **skips** a content write leaving no complete render, rather
      than sending it. Read the guard. Without it, a regenerating render moving to
      `running` sends a publish the worker correctly refuses with `noRender`, and
      somebody who did nothing wrong reads a failure sentence, **AC-22**,
      **AC-14**.
- [ ] In `worker/roomify.js`, every `me.puter.kv` call is a `set`, a `del`, or a
      `list`. No `get` on a `feed:*` key followed by a `set` of it anywhere. This
      is the invariant that replaces the lock and it is checkable by eye,
      **AC-15**.
- [x] `grep -rn "createSerialQueue" app/` finds it defined in
      `app/auth/singleFlight.ts` and used in exactly two places,
      `app/projects/store.ts` (every record write) and `app/publish/queue.ts`
      (a whole publish or unpublish sequence), and **not** in
      `app/render/useProjectRenders.ts`. Those two serialise different units and
      compose; a leftover render queue would serialise the same unit as the
      record queue without serialising against it, which is worse than none,
      **AC-20**.
- [x] `updateProject` increments `revision` only when `name` or `renders` is among
      the changes. Read the branch by hand. If a `publicAssets` write bumps it,
      every publish invalidates itself the instant it succeeds and every public
      project is permanently stale, which looks like a feed problem and is not,
      **AC-19**.
- [x] `parseProject` has one named branch accepting `schemaVersion` `2` and
      returning `revision: 0`. Check the type in `record.ts` and the parser in
      `invariants.ts` changed together, per `app/projects/AGENTS.md`, **AC-21**.
- [x] The store C path builder is a pure function of `projectId` and the file
      extension. `grep -rn "Date.now\|random\|uuid" worker/` shows nothing in the
      publish path's path building, **AC-18**.
- [x] The freshness rule is a pure function, not an inline comparison in a
      component, and it reads no clock. `grep -rn "Date.now" app/projects/` shows
      it nowhere near the staleness check, **AC-19**.
- [x] `/publish` refuses a record whose own `visibility` is not already `public`.
      Read the guard. Without it the intent first order is a client convention
      rather than an enforced one, **AC-17**.
- [x] `app/feed/store.ts` reads the two anonymous routes with a plain `fetch`
      carrying `x-puter-no-auth`, **not** through `withPuter`. The gate rejects
      when no token is held, so a `withPuter` feed read fails for exactly the
      reader **AC-3** is about. Check also that it imports no SDK, which is the
      rule `app/platform/AGENTS.md` actually owns, **AC-3**.
- [x] `publicState` in `app/publish/rules.ts` derives **five** states, including
      `withdrawing` for a record reading private that still carries `publishedAt`
      or `publicAssets`. Folded into `private` it would offer `Make public` to
      somebody whose withdrawal did not finish, **AC-17**.
- [x] `deleteProject` refuses when the record reads `public` **or** still carries
      `publishedAt` or `publicAssets`. Visibility alone is not the test: deleting
      in the `withdrawing` state strands a feed entry and a directory of files
      with nothing pointing at them, and no worker can enumerate them back,
      **AC-9**.

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

## The console recipe, for the republish steps

Three steps below need a **content change** to a public project, meaning a change
to `name` or to `renders`. **There is no rename control and no regenerate control
in the UI yet**, so there is nothing to press. Until one ships, drive the write
from the browser console on the dev server, with the project open and signed in:

```js
const { updateProject } = await import("/app/projects/store.ts");
await updateProject("<id>", { name: "Renamed" });
```

- [ ] Get `<id>` from the project's own URL, and check the call resolves `ok`
      before trusting anything downstream of it.

**It has to go through `updateProject`, and a raw `puter.kv.set` proves nothing.**
`updateProject` is the only thing that takes the record queue, increments
`revision` for a content change, and calls `announceProjectWritten`, and that
announcement is the entire trigger for the automatic republish. Writing the key
directly skips all three: the record changes, `revision` does not move, nothing is
announced, no republish fires, and the project reads fresh while showing the old
content. That looks exactly like the bug **AC-22** is about, from a test that
never exercised the path. If a console write appears to break the freshness rule,
check it went through `updateProject` before believing it.

The dev server serves source over `/app/...`, so the import path is the source
file. It does not work against a production build, where the module is bundled.

## Runtime, the failures

- [ ] Publish, and kill the tab between the worker answering and the client
      committing `publicAssets`. Reload the gallery: the project reads public and
      out of date with a retry that works. The feed shows it. At no point did the
      gallery read private while the card existed, **AC-17**, **AC-22**.
- [ ] Publish two different projects at the same instant from two tabs. Both cards
      appear, **AC-8**, **AC-15**.
- [ ] Publish the same project twice in quick succession. Exactly one card exists
      and it did not move position, **AC-8**, **AC-10**.
- [ ] Rename a public project, with the console recipe above. The card's name
      changes, the card stays where it was in the feed, and neither you nor
      anything else asked for the republish, **AC-10**, **AC-22**.
- [ ] Regenerate a render on a public project, or drive its `renders` through the
      same recipe so one model goes back to `running` while another stays
      `complete`. The republish fires. Then contrive the case where **nothing** is
      complete: no publish is attempted and no failure sentence appears, and the
      project sits in the out of date state until the render finishes, **AC-22**,
      **AC-14**.
- [ ] Set the machine clock an hour fast, reload, and check the freshness state is
      identical. Then an hour slow. Same state both times, **AC-19**.
- [ ] Start a render and rename the project while it is running, with the recipe
      above. Both the new name and the finished render survive, **AC-20**.
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
- [ ] Unpublish and kill the tab between the visibility write and the worker
      confirming, leaving the `withdrawing` state. The sheet says the copies have
      not come down yet and offers to finish making it private, **not** to make it
      public. Press it and it finishes cleanly, **AC-17**, **AC-9**.
- [ ] Try to delete a public project. It refuses with the sentence asking for an
      unpublish first, which is 0002's existing rule and must still hold, **AC-9**.
- [ ] Try to delete a project in the `withdrawing` state, where visibility already
      reads private. It **also** refuses, because the copies are still up and a
      delete here strands them with nothing pointing at them, **AC-9**.
- [ ] Open the gallery holding the pre change project. It is still there,
      **AC-21**.
- [ ] Point `VITE_PUTER_WORKER_URL` at nothing and load `/community`. A plain
      sentence and a retry, and the personal gallery still loads, **AC-14**.

## Runtime, auth and the empty states

- [ ] `curl -X POST /publish` with another account's project id and a made up
      name. Nothing enters the feed, **AC-7**.
- [ ] `curl -X POST /publish` with an id whose record still reads `private`. It
      refuses with a `409` and nothing enters the feed, **AC-13**, **AC-17**.
- [x] `curl` the feed with no session at all. It answers, **AC-3**.
- [ ] Unpublish everything and load `/community` signed out, then signed in. Two
      different invitations, each with the action that fits, **AC-23**.
- [ ] Open a withdrawn project's URL, a private project's URL, and a made up id.
      All three show the identical plain "not public" page with a link to the
      feed, and nothing distinguishes them, **AC-24**, **AC-5**.
