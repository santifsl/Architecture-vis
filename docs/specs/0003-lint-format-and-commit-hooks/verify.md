# Verify: lint, format, and commit hooks · spec 0003 · updated 2026-08-27

_Steps derived from spec 0003's acceptance criteria. `/check verify` runs these._

There is no test runner on this project, on purpose. Everything below is done by
hand: real commands in a real terminal, and real commits against a scratch
branch. The two planted violation steps deliberately break the tree, so do them
on a branch you are willing to throw away, or `git restore` after each.

**What the ticks mean.** A ticked box was run for real during the `/develop`
build on 2026-08-27, on branch `feature/lint-format-and-commit-hooks`, and the
note beside it says what it produced. Where a step names a specific file and the
build used a different one, the note says so, so re-walking it is still worth
doing. An unticked box has not been run by anybody yet. The exception is the
final section, whose three boxes were walked later the same day by a session
that had not written the code; each says so in its own note.

## Commands

- [x] `npm run lint` on the clean tree → exits `0`, no output beyond ESLint's
      own silence, and no warnings, since it runs at `--max-warnings 0` → AC-1
      _Zero violations. Getting there took four fixes, not none: an unnecessary
      type assertion in `app/projects/invariants.ts` became a real narrowing,
      two unused `Route` imports and their empty `meta({})` patterns came out of
      the two route modules, and `react-refresh/only-export-components` was
      given React Router's route module export names. The `no-unsafe-*` family
      the spec expected in `app/platform/puter.ts` never fired: that module
      already narrows the SDK's `any` down to `unknown` at the boundary._
- [x] `npm run format:check` on the clean tree → exits `0`, reports every file
      already formatted → AC-2
- [x] `npm run verify` → typecheck, lint, format check, and a real production
      build all run, in that order, and it exits `0` → AC-5
- [x] Break a type deliberately (change a return type in `app/auth/state.ts`),
      then `npm run verify` → it fails at the typecheck step and never reaches
      lint. Restore → AC-5
      _Ran with a bad annotation appended to `app/auth/state.ts` rather than a
      changed return type. It stopped at `error TS2322` and `> lint` never
      printed._
- [x] `git ls-files scripts/` → empty, and no live pointer to
      `scripts/check-sdk-import.mjs`, `npm run check:imports`, or
      `npm run check` remains: nothing in `package.json`, and nothing in the
      documentation that tells a reader to run them → AC-4
      _Reworded during the build, because the original step asked for
      `grep -rn "check:imports" .` to return nothing and that can never hold. A
      spec that records deleting a script has to name the script, so spec 0003
      and `scope.md`'s own build boxes both mention it by necessity, and spec
      0001's ticked entries are a dated record of what was actually run at the
      time. Rewriting those would be falsifying a record rather than fixing a
      pointer. What was checked instead: `git ls-files scripts/` is empty, both
      npm scripts are gone from `package.json`, and each surviving mention is
      either spec 0003 describing the deletion or a spec 0001 or 0002 entry
      carrying a "superseded" note added during this build._

## The SDK import rule

Each of these plants one line, runs lint, and restores. All three must fail.

- [x] Add `import puter from "@heyputer/puter.js";` at the top of
      `app/auth/actions.ts` → `npm run lint` fails on that line with the message
      naming `app/platform/puter.ts` and `withPuter()`. Restore → AC-3
- [x] Add `export { default } from "@heyputer/puter.js";` to
      `app/projects/store.ts` → `npm run lint` fails. Restore → AC-3
- [x] Add `const sdk = await import("@heyputer/puter.js");` inside a function in
      `app/projects/store.ts` → `npm run lint` fails, caught by the
      `no-restricted-syntax` selector rather than `no-restricted-imports`.
      Restore → AC-3
- [x] Confirm the exemption still holds: `app/platform/puter.ts` keeps its real
      SDK import and `npm run lint` passes → AC-3
      _All four ran, but the three planted forms went into a scratch file,
      `app/__planted.ts`, rather than into `actions.ts` and `store.ts`. The rule
      is not file specific, so the result is the same, but re-walking these in
      the named files is still worth doing if you want the exact step._
- [x] Two further forms the acceptance criteria do not ask for, planted the same
      way and also caught → AC-3
      _`import type { Puter } from "@heyputer/puter.js"` is caught by
      `no-restricted-imports`, and
      `await import("@heyputer/puter.js/types/modules/kv/index.js")`, a deep
      subpath, is caught by the `no-restricted-syntax` selector. The config adds
      a `patterns` group and anchors the selector regex so subpaths cannot slip
      through the way they would with an exact-name match alone._

## Formatting and Tailwind

- [x] Scramble the class order on any element in `app/auth/AuthControl.tsx`, for
      example `className="gap-3 items-center flex"`, then `npm run format` → it
      is rewritten to the plugin's canonical order → AC-9
      _Run on a scratch file rather than `AuthControl.tsx`:
      `className="p-4 bg-bone flex text-clay border-hairline items-center"`
      became `"flex items-center border-hairline bg-bone p-4 text-clay"`._
- [x] Temporarily rename `app/app.css` in the Prettier config to a file that
      does not exist, run `npm run format` on a file using a `@theme` token
      class such as `text-ink` → the sort differs or the plugin warns, proving
      the `tailwindStylesheet` pointer is actually doing something. Restore →
      AC-9
      _Done by running the same file both ways rather than by editing the
      config. With `app/app.css` configured, `bg-bone`, `text-clay` and
      `border-hairline` sort into canonical positions; with no stylesheet the
      plugin treats them as unknown classes and pushes all three to the front.
      The pointer is doing real work._
- [x] `npx prettier --check build .react-router` is not how this is checked;
      instead confirm `npm run format:check` reports zero files from `build/`
      or `.react-router/`, and `npm run lint` reports zero files from either →
      AC-10
      _Both directories exist on disk. `eslint . --format json` lists exactly 28
      files and neither directory appears; `format:check` passes with
      `.prettierignore` covering both._

## The pre commit hook

Run these on a scratch branch.

- [x] Stage a file with an auto fixable issue, for example a badly ordered set
      of Tailwind classes or a missing semicolon, then `git commit` → the commit
      succeeds and `git show` proves the committed content is the fixed version,
      not what was staged → AC-6
      _Staged `import { RoomifyUser } from "~/platform/puter";` with no spacing
      and no semicolon. `git show HEAD:` returned it with `type` inserted by
      ESLint and the body reformatted by Prettier. The scratch commit was
      removed afterwards._
- [x] Stage a file with a non fixable violation, for example an explicit `any`
      annotation, then `git commit` → the commit is refused, and the message
      names the rule and the file in a form a person can read → AC-6
      _Refused, naming the file, `1:24`, and
      `@typescript-eslint/no-explicit-any`. `HEAD` did not move._
- [x] Break a type in a file you do **not** stage, stage an unrelated trivial
      change, then `git commit` → the commit is refused by the whole project
      typecheck, which is the case a staged only check would have let through →
      AC-7
      _`lint-staged` passed, since the staged file was clean, and the commit was
      then refused by `error TS2322` in the unstaged `app/auth/state.ts`. This
      is exactly the case the unscoped typecheck exists for._
- [x] Fresh clone into a temporary directory, `npm install`, then make a
      violating commit → it is refused, with no setup step run by hand between
      the clone and the commit → AC-8
      _Before `npm install` the clone had no `core.hooksPath` and no
      `.git/hooks/pre-commit`. After it, `core.hooksPath` was `.husky/_`, and a
      commit carrying an explicit `any` was refused. Nothing was run by hand
      between the two._
- [x] The `lint-staged` globs cover every extension `eslint.config.js` and
      Prettier actually cover, so the hook cannot pass a file `npm run verify`
      then rejects → AC-6
      _Added after the feature was first called done, because they did not. A
      staged `.js` file got Prettier and no ESLint: an unused variable appended
      to `eslint.config.js` committed cleanly and `npm run lint` then failed on
      the committed content. Staged `.mts` and `.cts` matched no group at all,
      though the type-aware block and the four named rules both name them.
      Re-walked after the fix: the same unused variable is refused, and an
      explicit `any` in an `.mts` file is refused with `no-explicit-any` and
      `no-unsafe-return` both firing, which also proves the project service
      resolves `.mts`. `jsx` is in the Prettier-only group deliberately —
      ESLint has no configuration for it, and passing it one fails at
      `--max-warnings 0` on a "no matching configuration" warning rather than
      on anything real._

## Documentation

- [x] `docs/coding-standards.md` names `app/app.css`, not `app/globals.css` →
      AC-11
- [x] `docs/coding-standards.md` describes the real `app/auth/`,
      `app/platform/`, `app/projects/` layout rather than `features/upload/`
      and friends → AC-11
- [x] Its Enforced section lists the SDK import rule and the `jsx-a11y` rules,
      and its Running it table matches the scripts that actually exist in
      `package.json` → AC-11
- [x] It no longer describes `format:check` as "what CI would run", since there
      is no CI → AC-11
      _It now says positively what the enforcement is: `npm run verify` and the
      hook, both local, and that a `--no-verify` commit bypasses all of it._
- [x] `scope.md` feature 1's last box, the lint half of AC-9, is ticked, and its
      Code paragraph no longer names `scripts/check-sdk-import.mjs` as what
      holds the single import rule → AC-4

## Worth re-walking by hand

Everything above was run by the same session that wrote the code, which is the
weakest kind of evidence there is. Three are worth an independent pass:

All three were walked by hand on 2026-08-27 in a separate session from the one
that wrote the code, and all three passed.

- [x] The three SDK import forms planted in the real `app/auth/actions.ts` and
      `app/projects/store.ts`, rather than in a scratch file → AC-3
      _All three failed lint in the real files. The static import in
      `app/auth/actions.ts` and the re-export in `app/projects/store.ts` were
      caught by `no-restricted-imports`; the dynamic `import()` in
      `app/projects/store.ts` was caught by the `no-restricted-syntax` selector
      specifically, not by the import rule. Every file restored clean
      afterwards, and `app/platform/puter.ts`'s exemption held throughout._
- [x] The Tailwind scramble in the real `app/auth/AuthControl.tsx` → AC-9
      _`npm run format` rewrote the scrambled class list back to the plugin's
      canonical order. Restored clean._
- [x] `npm run verify` from a clean checkout on another machine, which is the
      only thing that proves the tooling does not depend on state left behind in
      this working directory → AC-5, AC-8
      _Walked as a fresh clone into a clean directory rather than on a second
      machine: `git clone`, `npm install`, then `npm run verify` passed end to
      end with nothing run by hand in between. That covers the state-leakage
      question this step exists for; a genuinely different machine would also
      cover a different Node or npm version, which this does not._

## Acceptance-criteria coverage

- AC-1 covered by the `npm run lint` step
- AC-2 covered by the `npm run format:check` step
- AC-3 covered by the four SDK import rule steps, plus two extra forms
- AC-4 covered by the `git ls-files scripts/` step and the last documentation step
- AC-5 covered by the `npm run verify` step and the deliberate type break
- AC-6 covered by the two staged violation steps
- AC-7 covered by the unstaged type error step
- AC-8 covered by the fresh clone step
- AC-9 covered by the two Tailwind steps
- AC-10 covered by the `build/` and `.react-router/` exclusion step
- AC-11 covered by the four documentation steps
