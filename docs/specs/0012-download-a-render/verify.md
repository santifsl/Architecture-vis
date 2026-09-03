# 0012 verify: downloading a render

Hand walkthrough, per `CLAUDE.md`: a real dev server, a real browser, a real
Downloads folder. No test runner, no browser automation.

Each step names the acceptance criterion it proves. The gate runs first and
blocks everything, because the whole feature rests on one browser fact nobody in
this project has proven yet.

## The gate, before task 2

- [ ] With the thin thread from build task 1 in place, press the download on a
      project with a finished render. A **file appears in the Downloads folder**.
      If the image opens in a new tab instead, stop: the save path is wrong and
      nothing after this is worth building, **AC-2**.
- [ ] Open the saved file and compare it with the render on screen. Same picture,
      same dimensions. Check the byte size against what `puter.fs.stat` reports
      for `render.path`; they match exactly, **AC-2**.
- [ ] Do it a second time on the same project. A second file is saved, and the
      first one is not corrupted or truncated. This is the object URL revoke
      timing, and getting it wrong usually shows up on the second download rather
      than the first.

## Code shape, cheap and before the browser steps

- [ ] `app/export/` imports the Puter SDK nowhere directly. Every call goes
      through `withPuter`, per `app/platform/AGENTS.md`.
- [ ] Nothing in `app/export/` imports `app/projects/store.ts`, the publish
      queue, or the worker client. If it does, the feature is not the pure read
      this spec says it is, **AC-10**.
- [ ] `grep` the module for `canvas`, `toDataURL`, `drawImage` and `new Image`.
      No hits. Any one of them means the bytes are being remade rather than
      copied, **AC-2**.
- [ ] `downloadFilename` does not call `sanitisePlanName`. Feed it a project
      named `Flat 2.b north` by hand and confirm the result keeps the `b north`,
      **AC-3**.

## The filename

- [ ] Download from a project named from an ordinary plan filename. The saved
      file is the project name slugified, plus `.png`, **AC-3**.
- [ ] Rename a project's source so its name is only punctuation or emoji, or
      construct such a record directly, and download. The file is `render.png`,
      not an empty name, not a dangling `-`, and not `plan.png`, **AC-3**.

## The three states

- [ ] On a `complete` render, the control is in the plate's label row, on the
      same line as the model name and the state word, **AC-1**.
- [ ] Start a render and watch the control during `pending` and `running`. It is
      present, looks disabled, and `Tab` still reaches it. Press `Enter` on it:
      nothing happens and no failure appears, **AC-5**.
- [ ] With a screen reader or the accessibility inspector, confirm the focused
      waiting control announces `Download when it is ready` and its unavailable
      state. A control that announces nothing means the real `disabled` attribute
      slipped back in, **AC-5**, **AC-13**.
- [ ] Sign in and watch the sign in button while it is busy. It now dims, which
      it did not before, because `AuthControl.tsx` already sets `aria-disabled`
      and the amended selector finally matches it. Confirm this is the only other
      control the CSS change touches, **AC-13**.
- [ ] Force a render to `failed`, or wait one out to `stalled`. There is no
      download control on the page at all, only the failure sentence and its
      retry, **AC-6**.
- [ ] Throttle the network to something slow, press download, and watch the busy
      state: the label reads `Preparing your render`, `aria-busy` is on the
      element, focus stays on it, and pressing `Enter` again while busy saves
      nothing extra, **AC-4**.
- [ ] Check the three labels against the spec's **Copy** table word for word.
      They are the accessible names too, so there is no separate `aria-label` to
      drift out of step, **AC-4**, **AC-5**, **AC-11**.

## Failures

Each sentence must match the spec's **Copy** table word for word.

- [ ] Sign out in a second tab, then press download in the first. The
      `signedOut` sentence, **no retry action**, and nothing resembling an
      exception or an error code on screen, **AC-7**, **AC-8**, **AC-9**.
- [ ] Delete the render file from Puter storage behind the app's back, then press
      download. The `stat` fails, so this is the `unreadable` sentence rather
      than the session one, and it offers the retry, **AC-7**.
- [ ] Go offline, press download, see a sentence, come back online, press the
      retry, and the file saves without a page reload, **AC-8**.
- [ ] Confirm the `stat` first rule really separates the two: with the file
      present but the read failing, the sentence is `unreachable`, not
      `unreadable`. If both cases produce the same sentence, the rule was not
      implemented and AC-7 is only half met.

## Nothing else moved

- [ ] Read the project's `revision` in `puter.kv` before and after five
      downloads. Unchanged. Nothing new appeared under any `feed:` key either,
      **AC-10**.
- [ ] Open the same project's public page at `/community/:projectId` in a private
      window, signed out. No download control anywhere on it, **AC-12**.
- [ ] Open the gallery and the comparison view. Neither has gained a control, and
      the comparison slider still works, **AC-12**.

## The checks

- [ ] `npm run verify` passes in full: typecheck, lint, format check, contrast,
      and a real build, **AC-11**.
- [ ] The focus ring is visible on the control in all three looks, against the
      ivory ground, **AC-11**.
