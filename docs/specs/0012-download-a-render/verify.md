# 0012 verify: downloading a render

Hand walkthrough, per `CLAUDE.md`: a real dev server, a real browser, a real
Downloads folder. No test runner, no browser automation.

Each step names the acceptance criterion it proves. The gate runs first and
blocks everything, because the whole feature rests on one browser fact nobody in
this project has proven yet.

## The gate, before task 2

- [x] With the thin thread from build task 1 in place, press the download on a
      project with a finished render. A **file appears in the Downloads folder**.
      If the image opens in a new tab instead, stop: the save path is wrong and
      nothing after this is worth building, **AC-2**.
- [x] Open the saved file and compare it with the render on screen. Same picture,
      same dimensions. Check the byte size against what `puter.fs.stat` reports
      for `render.path`; they match exactly, **AC-2**.
- [x] Do it a second time on the same project. A second file is saved, and the
      first one is not corrupted or truncated. This is the object URL revoke
      timing, and getting it wrong usually shows up on the second download rather
      than the first.

## Code shape, cheap and before the browser steps

- [x] `app/export/` imports the Puter SDK nowhere directly. Every call goes
      through `withPuter`, per `app/platform/AGENTS.md`.
- [x] Nothing in `app/export/` imports `app/projects/store.ts`, the publish
      queue, or the worker client. If it does, the feature is not the pure read
      this spec says it is, **AC-10**.
- [x] `grep` the module for `canvas`, `toDataURL`, `drawImage` and `new Image`.
      No hits. Any one of them means the bytes are being remade rather than
      copied, **AC-2**.
- [x] `downloadFilename` does not call `sanitisePlanName`. Feed it a project
      named `Flat 2.b north` by hand and confirm the result keeps the `b north`,
      **AC-3**.

## The filename

- [x] Download from a project named from an ordinary plan filename. The saved
      file is the project name slugified, plus `.png`, **AC-3**.
- [x] Rename a project's source so its name is only punctuation or emoji, or
      construct such a record directly, and download. The file is `render.png`,
      not an empty name, not a dangling `-`, and not `plan.png`, **AC-3**.

## The three states

- [ ] On a `complete` render, the control is in the plate's label row, on the
      same line as the model name and the state word, **AC-1**.
- [x] Start a render and watch the control during `pending` and `running`. It is
      present, looks disabled, and `Tab` still reaches it. Press `Enter` on it:
      nothing happens and no failure appears, **AC-5**.
- [ ] With a screen reader or the accessibility inspector, confirm the focused
      waiting control announces `Download when it is ready` and its unavailable
      state. A control that announces nothing means the real `disabled` attribute
      slipped back in, **AC-5**, **AC-13**.
- [ ] STALE, and it needs `/architect` to rewrite it rather than a tick. This
      step expected the sign in button to start dimming while busy. The build
      found that stacking state 5's 0.55 opacity on state 6's clay at 55% takes
      the busy label to about 1.55:1, so the amended selector excludes a busy
      control and that button's look is unchanged. The verified fact underneath
      is stronger than the one this step asked for: every `aria-disabled` in the
      app today is paired with `aria-busy` on the same element, so the CSS change
      touches **no** existing control, and the waiting download is the only thing
      the new selector reaches, **AC-13**.
- [x] Force a render to `failed`, or wait one out to `stalled`. There is no
      download control on the page at all, only the failure sentence and its
      retry, **AC-6**.
- [x] Throttle the network to something slow, press download, and watch the busy
      state: the label reads `Preparing your render`, `aria-busy` is on the
      element, focus stays on it, and pressing `Enter` again while busy saves
      nothing extra, **AC-4**.
- [x] Check the three labels against the spec's **Copy** table word for word.
      They are the accessible names too, so there is no separate `aria-label` to
      drift out of step, **AC-4**, **AC-5**, **AC-11**.

## Failures

Each sentence must match the spec's **Copy** table word for word.

- [x] Sign out in a second tab, then press download in the first. The
      `signedOut` sentence, **no retry action**, and nothing resembling an
      exception or an error code on screen, **AC-7**, **AC-8**, **AC-9**.
- [x] Delete the render file from Puter storage behind the app's back, then press
      download. The read rejects with a missing subject, so this is the
      `unreadable` sentence rather than the session one, and it offers the retry,
      **AC-7**.
- [x] Go offline, press download, see a sentence, come back online, press the
      retry, and the file saves without a page reload, **AC-8**.
- [x] Confirm the rule really separates the two. This is the check that found
      the bug: fully offline, the app said `unreadable` because the old `stat`
      first rule keyed on which call failed rather than why. Fixed by classifying
      the rejection's shape, and proven by running the real classifier over the
      seven rejection shapes the SDK can produce, including the bare `TypeError`
      it throws when the transport dies: offline gives `unreachable`, a missing
      subject and a 404 give `unreadable`, a gate error gives `signedOut`.
      Re-walk it in the browser to confirm end to end, **AC-7**.

## Nothing else moved

- [x] Read the project's `revision` in `puter.kv` before and after five
      downloads. Unchanged. Nothing new appeared under any `feed:` key either,
      **AC-10**.
- [x] Open the same project's public page at `/community/:projectId` in a private
      window, signed out. No download control anywhere on it, **AC-12**.
- [ ] Open the gallery and the comparison view. Neither has gained a control, and
      the comparison slider still works, **AC-12**.

## The checks

- [x] `npm run verify` passes in full: typecheck, lint, format check, contrast,
      and a real build, **AC-11**.
- [ ] The focus ring is visible on the control in all three looks, against the
      ivory ground, **AC-11**.
