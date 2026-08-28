# Verify: design system tokens, type roles, and states · spec 0004 · updated 2026-08-27

_Steps derived from spec 0004's acceptance criteria. `/check verify` runs these._

There is no test runner and no browser automation on this project, on purpose.
Everything below is done by hand: real commands in a real terminal, and a real
browser at `npm run dev`. Several steps deliberately plant a violation, so do
those on a branch you are willing to throw away, or `git restore` after each.

**What the ticks mean.** Tick a box only when the step was actually performed,
and write beside it what it produced, including when the result differed from
what this file expected.

**Status, 2026-08-28.** 31 of the 45 steps were run and passed, every one of them
a command with its output recorded below. The remaining 14 are the browser walk:
the visual states, the keyboard pass, the nine screen review, and the double fire
check on a live sign in. Those were **waived by Santiago and shipped without
being run**, so they stay unticked on purpose. Feature 4 was marked done on that
basis. If you are picking this up fresh, the browser walk is the outstanding
work, and the double fire step is the one worth doing first: `aria-disabled` does
not block a click, so an unguarded handler fires sign in twice and the screen
still looks completely correct.

## Contrast, the two live failures

- [x] `node scripts/check-contrast.mjs` on the clean tree → exits `0` and
      reports every text token clearing 4.5:1 against both `--color-bone` and
      `--color-ivory`, and clay clearing 3:1 as a ring → AC-1
      **Ran 2026-08-28: exit 0, all 8 pairs clear. ink 16.23/14.48, ink-soft 5.20/4.64, clay 5.26/4.69, ring 5.26/4.69.**
- [x] Temporarily set `--color-ink-soft` back to `#8a8478` in `app/app.css`,
      then `npm run verify` → it fails at the contrast step, names
      `--color-ink-soft`, and prints its real ratios (about `3.50` on bone and
      `3.12` on ivory). Restore → AC-1
      _This is the step that matters. A script that has only ever been watched
      to pass has not been shown to catch anything._
      **Ran: `npm run verify` exit 1 at the contrast step, naming ink-soft at 3.50 on bone and 3.12 on ivory, exactly as predicted. Restored.**
- [x] Temporarily set `--color-clay` back to `#b5551f`, then `npm run verify` →
      it fails naming clay and its ivory ratio of about `4.12`, not its bone
      ratio of `4.62`. Restore → AC-1
      _The bone reading passes. If the script only checks against bone this step
      goes green wrongly, which is the whole reason it checks both._
      **Ran: `npm run verify` exit 1 naming clay at 4.12 on ivory, while bone read `ok 4.62`. The both-surfaces check is doing real work. Restored.**
- [x] `git grep -in "8a8478\|b5551f" app/` → returns nothing → AC-2
      **Ran 2026-08-28 after the fix: no matches, exit 1. The palette comment in
      `app/app.css` was rewritten to explain that ink-soft and clay were both
      darkened, and that clay failed on ivory alone, without repeating either
      superseded value. The numbers themselves live in `rationale.md`, which is
      where the record belongs. No exception was carved into AC-2: the rule is
      that no off-system colour appears anywhere in `app/`, a comment included.**
- [x] `git grep -in "8a8478\|b5551f" scope.md docs/ CLAUDE.md` → every hit is
      prose explaining what the value was corrected from, never a live
      instruction to use it → AC-2
      _Do not try to make this one return empty. The history is the point._
      **Ran: every hit is prose (scope.md line 355 'was corrected from', spec index, rationale table, this file). No live instruction to use either value.**

## The token layer

- [x] `app/app.css` declares `--radius`, `--border-hairline`,
      `--duration-quick` and `--ease-standard` in `@theme`, and
      `git grep -n "2px\|120ms" app/app.css` shows them only in those
      declarations, never repeated in a rule → AC-7
      **Ran after the fix: the only hits are the four declarations themselves
      (`--radius`, `--ring-width`, `--ring-offset`, `--duration-quick`). The
      focus ring's bare `outline: 2px` and `outline-offset: 2px` were the gap;
      rather than relax this step, `--ring-width` and `--ring-offset` were added
      to `@theme` and the rule now reads them, the same way radius and spacing
      already worked. Checked the real risk too: Tailwind can prune unused
      `@theme` variables, which would have silently removed the ring entirely, so
      the shipped CSS was inspected and both tokens are defined there and the
      compiled rule resolves against them. The comment describing them avoids the
      literal as well, so the grep stays silent.**
- [x] Six `type-*` utilities exist and each carries size, line height, weight
      and tracking together; `type-meta` additionally carries
      `text-transform: uppercase` → AC-3
      **Ran: all six compile in the shipped CSS, each carrying size, line height, letter spacing and weight together; `type-meta` also carries `text-transform:uppercase`.**
- [x] `git grep -nE "text-(xs|sm|base|lg|[0-9]?xl)|font-(normal|medium|semibold|bold)|tracking-(tight|tighter|normal|wide)" app/` →
      returns nothing → AC-3
      **Ran: no matches.**
- [x] `git grep -nE "\b(m|p|mt|mb|ml|mr|ms|me|mx|my|pt|pb|pl|pr|ps|pe|px|py|gap|gap-x|gap-y|space-x|space-y)-(5|7|9|10|11|14|20|28|32|36|40|44|48|52|56|60|64|72|80|96)\b" app/` →
      returns nothing → AC-4
      _The logical prefixes matter. `ConfigScreen` ships `ps-5` today, and a
      grep that omits `ps` reports a clean tree that is not clean._
      **Ran: no matches. `ps-5` and the old `mt-5` are both gone.**
- [x] `git grep -n "rounded-" app/` → returns nothing outside `app.css` → AC-4
      **Ran: no matches anywhere in `app/`, including `app.css`.**
- [x] `git grep -n "\-\-text-" app/app.css` → returns nothing. The role
      properties are `--type-*-size` and friends, so Tailwind generates no
      shadow `text-display` utility alongside `type-display` → AC-3
      **Ran: the only hits are the two comment lines explaining why the namespace is avoided; no `--text-*` declaration exists. Confirmed at the other end too: the built CSS contains zero `.text-display`, `.text-title`, `.text-heading`, `.text-body`, `.text-meta` or `.text-code` utilities, so no shadow name was generated.**
- [x] `git grep -nE "font-size" app/app.css` → every occurrence reads
      `var(--type-...)`, never a literal. `.code-token` in particular must not
      carry its own `0.8125rem` → AC-3
      **Ran: all 8 occurrences read `var(--type-*-size)`. `.code-token` (line 381) reads `var(--type-code-size)`, its duplicate literal is gone.**

## The six states, in a real browser

Run `npm run dev` and use the sign in button in the header, which is a
`.btn-accent`, and the sign out button, which is a `.btn-quiet`.

- [ ] Rest, then hover each: `.btn-accent` fills clay with bone text,
      `.btn-quiet` turns clay and underlines. Both ease rather than snap → AC-5
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] Press and hold each: the hover treatment applies instantly, with no ease
      on the way in → AC-5
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] Tab to each with the keyboard: the clay outline appears, offset from the
      control, and is genuinely visible against bone. Tab away: it clears → AC-5
      _No tool can see this one. Look at it._
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] Set `disabled` on the sign in button from devtools: it drops to 55%
      opacity, the cursor is default, hovering does nothing, and clicking does
      nothing → AC-5
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] Set `aria-busy="true"` and `aria-disabled="true"` on the sign in button
      from devtools: the label drops to clay at 55%, a hairline sweeps beneath
      it, and the button is **still reachable by Tab** → AC-5, AC-6
      _Focus staying on the control is the point. If focus jumps to the top of
      the page when a real action starts, the state is wrong even if it looks
      right._
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] With a real sign in genuinely in flight (throttle the network so the busy
      window is long enough), click the button a second time, then press
      `Enter` on it, then press `Space` on it. Watch the network panel: exactly
      one sign in call is made → AC-11
      _This is the step that would catch the regression the busy state
      introduces. `aria-disabled` does not block a click, so if the handler is
      not guarded this fires two or four times and the screen still looks
      completely correct._
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [x] Read every `disabled={` in `app/` and confirm each one guards a control
      that is genuinely unavailable, never one that is merely busy. The three
      auth buttons should no longer be in that list → AC-11
      **Ran: no `disabled={` remains in any JSX. The three auth buttons now pass `aria-busy` plus `aria-disabled` (AuthControl 47, SessionBanner 29, SignInPrompt 31). The only `disabled` left in `app/` is the CSS state selector and two prose comments.**
- [x] The sweep is an `::after` on the control class, not a sibling element:
      `git grep -n "boot-rule" app/` shows it only in `BootScreen` → AC-6
      **Ran: `boot-rule` appears in `app.css` (its own rules) and in `BootScreen.tsx` only. The busy sweep is `.btn-*[aria-busy="true"]::after`, confirmed in the compiled CSS.**
- [x] `git grep -niE "spinner|animate-spin|@keyframes spin" app/` → returns
      nothing → AC-6
      **Ran: one hit, the word 'spinner' inside the comment saying never to use one. No spin animation exists.**
- [ ] With the operating system set to reduce motion, reload: the boot rule
      fills without sweeping, and no button transition eases → AC-7
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**

## Every screen, on the system

Walk each screen in a real browser at `npm run dev`, and on each one check that
text is legible against its background, focus is visible on every control, and
the screen is fully operable from the keyboard alone.

- [ ] Signed out home, header and sign in prompt → AC-8
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] The boot window, using devtools network throttling to hold it open long
      enough to look at → AC-8
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] Signed in home, header with the username and the sign out button → AC-8
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] `/projects` while signed in. Its paragraph is now `type-body text-ink-soft`
      rather than faded small text → AC-8
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] Signed out `SignInPrompt`: its `h1` is `type-heading` (not `type-title`),
      its paragraph is `type-body text-ink-soft`, and the gap above the button
      is `mt-6` → AC-3, AC-4
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] The session ended banner, driven by the console recipe in spec 0001's
      `verify.md`. This is the screen where clay text sits on ivory, so it is
      the one the contrast correction was made for → AC-8, AC-1
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**
- [ ] The configuration screen, by unsetting `VITE_PUTER_WORKER_URL` and
      restarting the dev server. Its numbered fix steps should now be able to
      use `type-body` in `text-ink` without the hand written exception its
      comment currently describes; check that comment was updated or removed
      rather than left stating a workaround that no longer applies → AC-8, AC-9
      **WAIVED 2026-08-28 by Santiago, not run. This step needs a real browser and a
      person looking at the screen; `/check verify` has no browser automation, which is
      the project's own choice, so it was never exercised. It is deliberately left
      unticked: nobody has observed it, and a tick here would claim otherwise. What was
      checked underneath it: the dev server serves the route 200 with no console
      errors, the served markup carries the new classes, and the compiled CSS carries
      the matching rules. Reopen this walk before trusting the visual states.**

## The lint rules

Plant each violation in a real file, run `npm run lint`, confirm it fails, then
`git restore`. A rule proven only against a clean tree has not been proven.

- [x] A raw hex in a `className`, for example `className="text-[#ff0000]"` → AC-3
      **Planted `text-[#ff0000]`: `npm run lint` exit 1, 'Raw colour values are declared in app/app.css and nowhere else'. Restored.**
- [x] An arbitrary colour utility, for example `className="bg-[rgb(0,0,0)]"` → AC-3
      **Planted `bg-[rgb(0,0,0)]`: exit 1, 'An arbitrary colour value reopens the closed palette'. Restored.**
- [x] A stock Tailwind colour family, for example `className="text-slate-500"` → AC-3
      **Planted `text-slate-500`: exit 1, 'Roomify has six colours and no stock Tailwind families'. Restored.**
- [x] A stock text size, for example `className="text-sm"` → AC-3
      **Planted `text-sm`: exit 1, 'Type comes from a role, never a stock size'. Restored.**
- [x] A stock weight, for example `className="font-bold"` → AC-3
      **Planted `font-bold`: exit 1, 'A weight belongs to a type role'. Restored.**
- [x] A tracking utility, for example `className="tracking-tight"` → AC-3
      **Planted `tracking-tight`: exit 1, 'Tracking and line height belong to a type role'. Restored.**
- [x] A radius utility, for example `className="rounded-md"` → AC-4
      **Planted `rounded-md`: exit 1, 'Radius comes from the component class'. Restored.**
- [x] An off ladder spacing step, for example `className="mt-5"` → AC-4
      **Planted `mt-5`: exit 1, 'Off the spacing ladder. The nine legal steps are 1 2 3 4 6 8 12 16 24'. Restored.**
- [x] An off ladder **logical** spacing step, `className="ps-5"`, and an
      off ladder `className="space-y-5"` → AC-4
      _`ConfigScreen` uses `ps-` and `space-y-` today. A selector that only
      enumerates `pl pr px py` misses both and AC-4 is quietly false._
      **Planted `ps-5`: exit 1, off ladder. Planted `space-y-5`: exit 1, off ladder. Both caught, so the concern this step was written for does not bite.**
- [x] An arbitrary type value, for example `className="text-[13px]"` and
      `className="tracking-[0.02em]"` → AC-3
      **Planted `text-[13px]`: exit 1. Planted `tracking-[0.02em]`: exit 1. Note `text-[13px]` also trips the arbitrary-colour rule, so its message names both; it still fails, but the wording is broader than the real cause.**
- [x] A legal layout arbitrary value, `className="max-w-[42ch]"`, still passes.
      `ConfigScreen` already uses this one, so a rule that rejects it breaks a
      working screen → AC-4
      **Ran `max-w-[42ch] px-6 py-16 type-body text-ink`: `npm run lint` exit 0. The legal case genuinely passes, so ConfigScreen is not broken by the rules.**
- [x] `npm run lint -- --max-warnings 0` on the clean tree → exits `0` → AC-8
      **Ran: exit 0.**
- [x] `npm run verify` from a clean tree → typecheck, lint, format check,
      contrast, and a real build all pass in order → AC-1, AC-8
      **Ran: exit 0. typecheck, lint, format check, contrast (all 8 pairs clear) and a real build all pass in order.**

## The documents

- [x] `docs/coding-standards.md` carries the design system rules, and each one
      sits under Enforced or Judgment matching what actually enforces it. The
      lint rules and the contrast script go under Enforced, and so does no status
      colour: the stock-family rule genuinely fails the commit on `text-red-500`
      and friends, so filing it under Judgment would have understated it. When
      the accent is allowed, and hairline rather than shadow, go under Judgment,
      because nothing checks either one: lint can see that `text-clay` is a legal
      token but not whether the thing wearing it is interactive, and a bare
      `shadow-md` names no colour and so passes. Both were confirmed by probe
      rather than assumed → AC-9
      **Ran after the fix: met. Enforced now carries the closed set, the contrast
      script, the six state matrix, and no status colour. Judgment now carries
      clay only on interactive elements, hairline rather than shadow, and the
      three role-choice rules. Both tiers were assigned by probe rather than by
      assumption: a planted `shadow-md` and a planted `text-clay` on
      non-interactive text both pass `npm run lint` at exit 0, so neither is
      enforceable today and both are judgment; `text-red-500` does fail the
      commit, so no status colour is genuinely Enforced and this step's own
      expectation was corrected to say so.**
- [x] `scope.md` feature 4 states `#6e685e` and `#a94d19`, and says why they
      changed rather than silently carrying new numbers → AC-2, AC-9
      **Ran: scope.md lines 347 to 349 carry the corrected values, and lines 355 onward explain what each was corrected from and the measured ratios that forced it.**
- [x] `scope.md`'s "Not doing right now" names dark mode, and
      `git grep -n "dark:" app/` returns nothing → AC-10
      **Ran: scope.md line 607 records dark mode as declined with its reasoning. `git grep -n "dark:" app/` returns no matches.**
