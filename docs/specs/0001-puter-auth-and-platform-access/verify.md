# Verify: Connecting to Puter · spec 0001 · updated 2026-08-27

_Steps derived from spec 0001's acceptance criteria (`index.md`). `/check verify`
runs these. There is no test runner and no browser automation on this project by
standing decision (CLAUDE.md), so this file is the whole safety net: every step
is walked by hand against `npm run dev` in a real browser._

**How to read a box.** `[x]` means walked by hand and passed, with the date and
what actually happened noted under it. `[ ]` means not walked yet. Nothing is
ticked from reading the code.

**Setup once per session**

- `npm run dev`, then open http://localhost:5173.
- Have devtools open on Application → Local Storage for the token cases. The
  Puter token lives under the `puter.auth.token` key for this origin.
- "No popup appears" means Puter's own account window, which opens as a real
  browser popup on `puter.com`. Watch for it actively; it is the thing several of
  these steps exist to catch.
- The SDK assigns `globalThis.puter` even though this app imports it as a package
  rather than a script tag, so `puter` is reachable from the devtools console.
  That is what makes the two recipes below possible.

**Reproducing the two conditions that have no interface for them.** Neither the
ended session nor the blocked popup can be produced by clicking around, so both
are driven from the devtools console. Each one enters the real SDK code path
rather than faking our own result, which is the point: the walk still proves the
handler, not a stub.

_An ended session (AC-6)._ Signed in, run:

```js
puter.dropStaleAuthToken({ reason: "manual test" });
```

This is the exact call the SDK's own network layer makes when a request the
person did not start comes back 401. It emits `puter.auth.reauth_required`,
drops the token, and announces the change, so the app's real listener runs.
Corrupting the token in devtools does **not** work for this: it produces no event
at all until something makes a request, and nothing else in the app talks to
Puter yet.

_A blocked popup (AC-5)._ Before clicking Sign in, run:

```js
const realOpen = window.open;
window.open = () => null;
```

The SDK treats a null window handle as a blocked popup, which is literally what a
blocking browser gives it, so this reaches the same rejection. Restore it with
`window.open = realOpen;` afterwards. Chrome's own pop-up site setting cannot
produce this: a window opened from a real click is user-requested, and Chrome
allows it regardless of the setting. Do not spend time on that route again.

## Milestone 2 · boot and the deliberate actions

Walked by hand on 2026-08-25, before PR #1 merged, and re-walked clean on
2026-08-26 alongside milestone 3. Re-walk them after any change to the boot path,
`resolveAuthState`, or the root loader.

A brief "Checking your session" state on reload is correct, not a defect. That is
`HydrateFallback` covering the boot window while the real user resolves, and it
is what the signed-out flash in step 3 would otherwise be.

- [x] Load the app with no token at all → the interface settles on signed out and
      **no popup appears at any point** → AC-2
      _Passed. A visitor who did nothing but load the page was never asked for
      anything._
- [x] From signed out, click Sign in and complete Puter's popup → the navbar
      shows your username, with no page reload → AC-2, AC-3
      _Passed. The username came from the root loader re-running, not from the
      sign-in call's own return value._
- [x] Signed in, reload the page → the interface never shows a signed out state
      first, it resolves straight to signed in → AC-1
      _Passed. `HydrateFallback` covered the boot window; there was no signed out
      flash._
- [x] Signed in, corrupt the stored token in devtools, then reload → the app
      settles on **signed out**, and **no popup appears at any point** → AC-1,
      AC-2
      _Passed, and this is the single most important step in this file. It is the
      case `isSignedIn()` reports wrongly and the case `getUser()` answers
      correctly but with a popup, so it is what proves the whole boot mechanism.
      Re-walk it on every SDK upgrade: the boot check leans on
      `puter.whoamiCache_`, which is internal and could disappear quietly._

## Milestone 3 · popup failures, the ended session, and the guard

**Verified 2026-08-26.** All seven cases walked by hand in a real browser and all
seven passed, on branch `feature/auth-failures-and-guard`. The blocked popup and
the ended session both needed the console recipes above, because neither can be
produced by clicking or by browser settings; both recipes enter the real SDK path
rather than faking a result.

Three boxes below are deliberately still open. None of them is in doubt: each is
either a regression guard, or a case that cannot be settled on a dev server. They
are marked individually with why. The shared sign-in cases added on 2026-08-27
were walked when the interaction moved into `signInStore`.

### Sign-in failures (AC-5)

- [x] Stub `window.open` to return null (recipe above), then click Sign in → one
      plain sentence saying the browser blocked the window, alongside a Sign in
      button that still works. No raw error text, no error code, no console trace
      on screen → AC-5
      _Passed 2026-08-26 with the stub. Chrome's pop-up site setting was tried
      first and cannot work: a window opened from a real click is user-requested
      and Chrome allows it whatever the setting says. Use the stub._
- [x] Click Sign in and close the Puter window yourself without signing in → the
      app returns to signed out **silently**: no sentence, no error, nothing on
      screen changes → AC-5
      _Passed 2026-08-26. A cancel is treated as a cancel._
- [x] Restore `window.open`, click Sign in and complete it → any sentence left
      over from the blocked attempt is gone → AC-3, AC-5
      _Passed 2026-08-26._
- [x] Double-click Sign in fast → exactly one Puter window opens, not two → AC-5
      _Passed 2026-08-27, re-walked after the latch moved from a per-component
      `useRef` to one module-level latch in `signInStore`._
- [x] Signed out at `/projects`, with both the navbar button and the route's own
      prompt on screen, start a sign in from one → the other goes busy with it
      and cannot open a second Puter window → AC-5
      _Passed 2026-08-27. This is the case per-component state got wrong: each
      control held its own latch, so the second button stayed live and a click on
      it opened a second popup. Re-walk it with two controls on screen, not one,
      after any change to `signInStore` or `useSignIn`._
- [x] Complete that sign in from the prompt → the real content appears at
      `/projects` with no reload and no leftover notice → AC-3, AC-5, AC-7
      _Passed 2026-08-27._

### The ended session (AC-6)

**A cold reload with a dead token shows no banner, and that is correct.** The
SDK's boot cache warmer does emit `puter.auth.reauth_required` when the server
rejects a stored token, but it emits it at page load, before React has mounted
and `useAuthEvents` has subscribed, so nothing is listening and the flag is never
set. It is unreachable on that path by construction, not by chance. It is also
the behaviour the spec asks for: AC-6 covers Puter ending a session **mid-use**,
where there is a page to preserve and a person to tell. Someone who reloads and
lands signed out was not interrupted, and "pick up where you left off" would be a
strange thing to say to them. If that judgement should change, it is a change to
AC-6 and belongs to `/architect`, not a quiet patch here.

- [x] Sign in, stay on `/` (home, which is not guarded), then run
      `puter.dropStaleAuthToken({ reason: "manual test" })` in the console → a
      plain banner appears under the header saying the session ended and offering
      Sign in → AC-6
      _Passed 2026-08-26. This is the real SDK path, not a stubbed result: the
      same call the network layer makes on a background 401._
- [x] In that same state → **you are still on `/`**, the page underneath it is
      intact, and nothing navigated you away → AC-6
      _Passed 2026-08-26._
      _Run the same trigger on `/projects` too. There the banner appears and the
      URL still does not change, but the content below becomes the sign-in prompt,
      because the route guard is doing its job. Both are correct._
- [x] Sign in from the banner → the banner disappears and the page's real content
      appears, with no reload → AC-3, AC-6
      _Passed 2026-08-26._
- [x] Sign in, then click Sign out deliberately → the banner **never** appears.
      A sign out is not an ended session, and the one-shot reason flag must not
      confuse the two → AC-4, AC-6
      _Passed 2026-08-26._
- [ ] After that sign out → nothing belonging to the previous person is left on
      screen (no username, no guarded content) → AC-4
      _Not part of the seven cases walked on 2026-08-26, though the sign-out case
      beside it passed. Walk it before AC-4 is called fully covered._
- [ ] Navigate once more after the banner has shown → the banner is gone, it does
      not survive into a later navigation → AC-6
      _Not part of the seven cases walked on 2026-08-26. It is what proves the
      reason flag is genuinely one-shot, so it is worth a minute._

### The guarded route (AC-7)

- [x] Signed out, visit `/projects` directly → the sign-in prompt renders **at
      `/projects`**, the URL does not change, and the navbar and layout are still
      there around it → AC-7
      _Passed 2026-08-26._
- [x] Sign in from that prompt → the real content appears at `/projects`, still
      with no redirect and no change to the URL → AC-7
      _Passed 2026-08-26._
- [ ] Signed out, hard-refresh `/projects` → the prompt renders again rather than
      a 404. This is what `vercel.json`'s rewrite exists for, so it is worth
      re-walking against a real deployment, not only the dev server → AC-7
      _Not part of the seven cases walked on 2026-08-26. It cannot be settled on
      the dev server anyway, which serves the SPA fallback whether or not the
      rewrite is right. Walk it on the first Vercel deployment._

## Milestone 4 · configuration and the import rule

Built on 2026-08-27 on branch `feature/env-validation-and-import-guard`. The
commands below were run and passed, and all four browser steps were walked by
hand on 2026-08-27 and passed. Re-walk them after any change to `env.ts`, to
`ConfigScreen`, or to the configuration branch in the root `clientLoader`.

**Setup for these steps.** `VITE_PUTER_WORKER_URL` is read by Vite at startup,
not per request, so every change to it needs the dev server stopped and started
again. A running server will not pick it up, and neither will a browser reload.

- [x] With no `.env` file at all (or the variable blank), `npm run dev` and open
      http://localhost:5173 → a readable screen headed "Roomify", stating that
      Roomify can't start, naming `VITE_PUTER_WORKER_URL`, and telling you to
      copy `.env.example` to `.env` and restart. No blank page, no console
      stack, no raw exception, no red → AC-8
- [x] On that same screen, navigate straight to http://localhost:5173/projects →
      the same configuration screen, not the sign-in prompt and not a broken
      page. A missing worker URL replaces the whole app, so no route renders its
      own content → AC-8
- [x] Set `VITE_PUTER_WORKER_URL` in `.env` to any `https://…puter.work` value,
      restart the dev server, reload → the normal app returns: header, sign-in
      control, home page. Nothing about the configuration screen lingers → AC-8
- [x] Tab through the configuration screen → nothing is focusable except
      ordinary text selection, and no focus trap. It offers no retry button on
      purpose: a reload cannot fix a file on disk → AC-8

_All four walked on 2026-08-27 and passed._

## Still owed from later build tasks

As of 2026-08-27 the only step here with no build behind it is the offline one.
Build task 8 has landed, so its case moved up into milestone 4 above.

- [ ] Boot offline: hold a valid token, disconnect the network, reload → the app
      settles on signed out with no hang and no raw error → AC-1
      _Built since milestone 2: `readCurrentUser` already resolves a network
      failure to signed out. Never actually walked with the network cut._

## Commands

- [x] `npm run typecheck` → passes → AC-9
- [x] `npm run build` → succeeds under `ssr: false`, and no Puter call runs
      during the build-time root render → AC-9
- [x] `npm run check:imports` → exits 0 and prints that the SDK is imported by
      `app/platform/puter.ts` only → AC-11
      _Build task 9. `scripts/check-sdk-import.mjs` replaces the hand-run grep:
      it walks `app/`, matches static imports, re-exports, and dynamic
      `import()` alike, and exits non-zero naming the offending files. Proven
      against a planted violation of each kind on 2026-08-27, so it fails when
      it should rather than passing vacuously. Until feature 2 installs the
      ESLint `no-restricted-imports` rule this is the whole of AC-11, so run it
      before every merge. It is evidence for AC-11 only: it proves where the SDK
      is imported, not that every use of it goes through `withPuter`._
- [x] `npm run check` → runs typecheck then the import check, both pass → AC-9,
      AC-11
- [ ] Every `puter.fs`, `puter.kv`, and `puter.workers` use goes through
      `withPuter` → AC-10
      _Not verifiable yet by the import grep, and nothing in the app makes such a
      call before feature 5. Tick it when a call-site check over `app/`, or the
      enforced lint rule from feature 2, actually covers the three surfaces._

## Acceptance-criteria coverage

- **AC-1** boot resolves the real user, never a popup · milestone 2 steps 3 and
  4, plus the offline step still owed
- **AC-2** nothing at boot or on navigation raises the popup · milestone 2 steps
  1, 2 and 4
- **AC-3** signing in updates everything with no reload · milestone 2 step 2, the
  cleared-sentence step, the banner sign-in step
- **AC-4** signing out leaves nothing behind · the deliberate sign out steps
- **AC-5** blocked popup explained, closed popup silent · the six sign-in
  failure steps, including the two shared-control steps
- **AC-6** ended session states itself and keeps the page · the six ended-session
  steps
- **AC-7** guarded route prompts in place, no redirect · the three guard steps
- **AC-8** missing environment variable fails readably · the four milestone 4
  steps, all walked on 2026-08-27
- **AC-9** the real build passes with no Puter call at build time · the commands
- **AC-10** `puter.fs`, `puter.kv`, and `puter.workers` only through `withPuter` ·
  **not verified.** The import grep is AC-11's evidence and does not reach this:
  a file could import the access module and still reach past `withPuter`. It
  needs a call-site check or the enforced lint rule, and it gains real
  behavioural coverage when feature 5 makes the first storage call
- **AC-11** only the access module imports the SDK · the grep, until feature 2's
  lint rule replaces it
