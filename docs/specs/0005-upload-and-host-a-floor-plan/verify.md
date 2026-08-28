# Verify: upload and host a floor plan · spec 0005 · written 2026-08-28

_Steps derived from spec 0005's acceptance criteria. `/check verify` runs these._

There is no test runner and no browser automation on this project, on purpose.
Everything below is done by hand: real commands in a real terminal, and a real
browser at `npm run dev`, signed in to a real Puter account.

**What the ticks mean.** Tick a box only when the step was actually performed,
and write beside it what it produced, including when the result differed from
what this file expected.

**Run log, 2026-08-28. 15 of 50 steps run and passing, 35 left unrun.**
`/check verify` ran the eight command and code shape steps. The engineer then
walked the seven highest stakes runtime steps by hand in a real browser against a
real Puter account: the cancelled picker during Replace, the decode check
refusal, the abort on unmount, and the four signed out held file steps. All seven
passed, notes beside each.

The remaining 35 are unrun by a deliberate choice, not an oversight. They are the
lower stakes browser walk: the path and sanitiser shapes, the progress hairline,
the preview and the URL cache, the quota pair that needs a nearly full drive, the
keyboard and screen reader pass, and the second pick guard. They stay unticked
rather than claimed, the same way features 1 and 4 closed.

Two findings from the run, both recorded beside their steps. The `.tiff` Replace
step cannot be walked as written, because the file input's own `accept` attribute
filters `.tiff` out of the operating system picker before the app's validation
ever sees it. And `app/upload/` is still untracked, so plain `git grep` skips it
without saying so and several steps here return a silent, misleading nothing. Run
those with `--untracked` until the feature is committed.

**Two steps need a nearly full Puter drive.** The quota steps cannot be faked
from the client, so either use a throwaway account you can fill, or accept them
as waived and say so rather than ticking them.

## Nothing stores a URL

- [x] `git grep -n "floorPlan" app/` → no read of a `.url` on a `FloorPlan`
      anywhere, and `FloorPlan` in `app/projects/record.ts` declares `path`
      only → AC-3
      _Ran 2026-08-28 with `--untracked`, since `app/upload/` is not committed
      yet and plain `git grep` skips it silently. No `.url` is read on a
      `FloorPlan` anywhere, and `record.ts` declares `path` only._
- [x] `git grep -nE "getReadURL|getReadUrl" app/` → appears only inside
      `app/upload/`, never in a component, a route, or `app/projects/` → AC-3
      _Ran 2026-08-28. One call, `app/upload/store.ts:212`. The other hit,
      `app/projects/record.ts:86`, is a doc comment explaining the decision, not
      a call._
- [ ] Upload a plan, then read the stored value: in devtools console with the
      app signed in, list the project keys after feature 6 creates one, or
      inspect the `FloorPlan` the hook returns. No field holds an `http` URL
      → AC-3
      _This is the step the whole decision exists for. A URL that got stored
      would look completely fine today and break in an hour._

## The path

- [ ] Upload `floorplan.png`, then upload a second file also named
      `floorplan.png`. Both succeed, and the two stored paths differ by their id
      prefix → AC-2
- [ ] Inspect the second stored path: it is exactly what the app asked for, with
      no `(1)` suffix the server added → AC-2
      _If a suffix appears, `dedupeName` leaked back in and the path must now be
      read from the response rather than constructed._
- [ ] Upload a file named `Ground Floor (final) v2!.PNG`. The stored path is
      sanitised to lowercase with no spaces, brackets, or bangs, and keeps a
      `.png` extension → AC-2
- [ ] Sign in with a **fresh** Puter account that has never used this app, and
      upload. It succeeds, so `plans/` was created rather than assumed → AC-1
      _`createMissingParents` defaults to false. This fails on the first upload
      of a new account, which is the least convenient time to find out._

## Validation, before the network

- [ ] With the network panel open and recording, pick a 12 MB PNG. It is
      refused, a plain sentence names the size rule, and **no request is made**
      → AC-5
- [ ] Same, with a `.tiff` or `.heic` file → refused on type, no request → AC-5
- [x] Rename a `.txt` file to `.png` and pick it. It is refused, because the
      decode check failed, not because the extension looked right → AC-5
      _Walked 2026-08-28. Refused with a plain sentence, and the existing plan
      survived. Reached this step from the Replace walk below, where the `accept`
      filter blocked the `.tiff` the file picker was supposed to offer._
- [ ] Every refusal sentence is plain, names the rule, and says what to do. None
      shows a code, a status, or an SDK string → AC-13

## Quota

- [ ] On an account with little free space, pick a file that will not fit. The
      refusal is ours, and the network panel shows a `space` call but **no**
      write → AC-6
- [ ] Confirm Puter's own usage dialog did **not** appear on that path → AC-6
- [ ] The race case, if you can produce it: start two large uploads at once from
      two tabs so space runs out mid write. Our sentence appears. Puter's dialog
      may also appear; record whether it did → AC-7
      _This one is expected to be awkward to trigger. If you cannot, waive it
      and say so rather than ticking it._

## The uploading state

- [ ] Throttle the network to Slow 3G and upload a 5 MB file. The hairline width
      advances in steps rather than sitting still → AC-8
- [ ] No spinner appears anywhere, and no colour other than clay is introduced
      → AC-8
- [x] `git grep -niE "spinner|animate-spin" app/` → nothing new → AC-8
      _Ran 2026-08-28. One hit, the comment at `app/app.css:257` that says never
      a spinner. No spinner code._
- [ ] With the operating system set to reduce motion, repeat the throttled
      upload. The bar still advances but does not animate between values → AC-8
- [ ] The busy control follows spec 0004: it is `aria-busy`, it stays reachable
      by Tab, and clicking it again mid upload starts nothing second → AC-8

## The preview

- [ ] After a successful upload, the preview image loads, and the network panel
      shows it fetching a `token-read` URL rather than a `blob:` URL → AC-9
- [ ] Copy the preview URL, open it in a private window: it loads without
      signing in, which is what a minted read URL is → AC-4
- [ ] Wait an hour, or mint with a short expiry temporarily, then reload that
      copied URL: it no longer works → AC-4
      _This proves the expiry is real. It is the reason nothing stores it._
- [ ] Upload a second plan and watch the network panel: the first plan's URL is
      not minted again in the same session → AC-4
- [ ] Reload the page and display the same plan: it mints once more → AC-4

## Replace

- [ ] Upload a plan, then Replace it. The network panel shows the order:
      validate, then `space`, then a delete of the old path, then the write.
      **The delete must come after the space check, not before** → AC-10
- [x] Upload a plan, click Replace, then **cancel the file picker**. The original
      plan is still there and nothing was deleted → AC-10
      _This is the case the first draft of this spec got wrong. Deleting before
      validating would leave the person with nothing._
      _Walked 2026-08-28. Passed. The original plan survived and nothing was
      deleted._
- [ ] Upload a plan, click Replace, then pick a `.tiff`. It is refused and the
      original plan survives → AC-10
      _Attempted 2026-08-28, not exercised, so not ticked. The file input's own
      `accept` attribute filtered `.tiff` out of the operating system picker, so
      it could not be selected and the app's validation never ran. The refusal
      path was covered instead by the renamed `.txt` above, which does reach
      validation. To exercise this step as written, the `accept` attribute has to
      be relaxed temporarily, or the file dragged onto the drop zone, which
      `accept` does not filter._
- [ ] Confirm in Puter's own file browser that a successful Replace left only the
      new file → AC-10
- [ ] Force the delete to fail by deleting the file out from under the app first,
      then Replace. The upload still completes, and no failure is shown, because
      an already missing path counts as success → AC-10

## Signed out

- [x] Sign out and load the home page. The real upload card is visible, not a
      sign in wall → AC-11
      _Observed 2026-08-28 as the starting state of the held file walk below,
      not as a separate step._
- [x] Pick a file while signed out. The sign in flow starts → AC-11
      _Observed 2026-08-28 inside the held file walk below. The sign in could not
      have been completed without it._
- [x] Complete the sign in. The upload begins on its own, with no second pick
      → AC-11
      _This is the step the held state exists for. If the file was dropped, the
      person does the same work twice on the app's first screen._
      _Walked 2026-08-28. Passed. The upload resumed on its own after sign in
      with no second pick._
- [x] Repeat, but cancel the sign in popup. Nothing uploads, nothing errors, and
      the card is idle → AC-11
      _Walked 2026-08-28. Passed. The card was left idle with no error._

## Keyboard and accessibility

- [ ] Reach the file input by Tab alone and open the picker with the keyboard.
      Drag and drop is never the only way in → AC-12
- [ ] Focus is visible on the input and on Replace, in clay, against bone → AC-12
- [ ] Walk the whole card with a screen reader: the drop zone announces what it
      accepts, and the uploading state announces that work is in progress → AC-12
- [ ] Text on the card is legible against its background, per spec 0004 → AC-12

## One upload at a time

- [ ] Start an upload on a throttled connection, then drop a second file onto the
      zone while it runs. Nothing happens, and the network panel shows no second
      write → AC-16
- [ ] Same, but use the file input rather than a drop. Also ignored → AC-16
- [x] Start an upload on a throttled connection, then navigate away from home
      before it finishes. The network panel shows the request cancelled rather
      than running to completion → AC-17
      _Walked 2026-08-28. Passed. The network panel showed the request cancelled,
      not completed, so the `init` handle really does cancel._
      _The cancel handle is the `XMLHttpRequest` from `write`'s `init` callback,
      not its `abort` option. The spec named the wrong one and the build
      corrected it, so this step is worth actually running: passing `abort` and
      expecting it to cancel fails silently, with the upload running on._

## Awkward filenames

- [ ] Upload a file whose name is only emoji, plus `.png`. The stored path falls back to
      `plan` and is legal → AC-2
- [ ] Upload a file with a very long name, over 60 characters. The sanitised part
      of the path is capped at 40 → AC-2
- [ ] Upload `a  b--c.png`. Runs collapse to a single `-`, with no leading or
      trailing dash → AC-2
- [ ] Upload a `.jpeg` and a `.jpg`. Both store a `.jpg` extension, taken from
      the type rather than the filename → AC-2

## The card is never remounted

- [x] `git grep -n "RequireUser" app/routes/home.tsx` → nothing. The card is not
      behind the guard → AC-15
      _Ran 2026-08-28. One hit, the doc comment at `app/routes/home.tsx:21`
      recording that the card is deliberately not wrapped. No guard._
- [x] Read the home route: the upload card renders in the same position on both
      the signed in and signed out paths, not in two different branches → AC-15
      _If it is two branches, the held file in AC-11 is discarded on sign in and
      that test passes only by luck._
      _Read 2026-08-28. One `<PlanUploadCard />`, one position under the hero,
      no signed in and signed out branch, no guard._

## Nothing else moved

- [ ] Through a whole upload, the network panel shows **no** `puter.kv` write.
      No project record is created by this feature → AC-14
- [x] `git grep -nE "kv\.|createProject" app/upload/` → nothing → AC-14
      _Ran 2026-08-28 with `--untracked`. Nothing._
- [x] `npm run verify` from a clean tree → typecheck, lint, format check,
      contrast, and a real build all pass in order → AC-1
      _Ran 2026-08-28. Typecheck, lint, format check, contrast, and the build all
      passed in order._
- [x] `git grep -n "@heyputer/puter.js" app/` → still only
      `app/platform/puter.ts` → AC-1
      _Feature 5 is the first feature to need `puter.fs`. It goes through
      `withPuter` like everything else, or spec 0001's guard has been bypassed._
      _Ran 2026-08-28 with `--untracked`. Only `app/platform/puter.ts:19`._
