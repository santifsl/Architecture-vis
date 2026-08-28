# Verify: lint, format, and commit hooks · spec 0003 · created 2026-08-27

_Steps derived from spec 0003's acceptance criteria. `/check verify` runs these._

There is no test runner on this project, on purpose. Everything below is done by
hand: real commands in a real terminal, and real commits against a scratch
branch. The two planted violation steps deliberately break the tree, so do them
on a branch you are willing to throw away, or `git restore` after each.

## Commands

- [ ] `npm run lint` on the clean tree → exits `0`, no output beyond ESLint's
      own silence, and no warnings, since it runs at `--max-warnings 0` → AC-1
- [ ] `npm run format:check` on the clean tree → exits `0`, reports every file
      already formatted → AC-2
- [ ] `npm run verify` → typecheck, lint, format check, and a real production
      build all run, in that order, and it exits `0` → AC-5
- [ ] Break a type deliberately (change a return type in `app/auth/state.ts`),
      then `npm run verify` → it fails at the typecheck step and never reaches
      lint. Restore → AC-5
- [ ] `git ls-files scripts/` → empty, and `grep -rn "check:imports" .` outside
      `node_modules/` returns nothing, in `package.json`, `scope.md`,
      `docs/coding-standards.md`, and the spec 0001 files alike → AC-4

## The SDK import rule

Each of these plants one line, runs lint, and restores. All three must fail.

- [ ] Add `import puter from "@heyputer/puter.js";` at the top of
      `app/auth/actions.ts` → `npm run lint` fails on that line with the message
      naming `app/platform/puter.ts` and `withPuter()`. Restore → AC-3
- [ ] Add `export { default } from "@heyputer/puter.js";` to
      `app/projects/store.ts` → `npm run lint` fails. Restore → AC-3
- [ ] Add `const sdk = await import("@heyputer/puter.js");` inside a function in
      `app/projects/store.ts` → `npm run lint` fails, caught by the
      `no-restricted-syntax` selector rather than `no-restricted-imports`.
      Restore → AC-3
- [ ] Confirm the exemption still holds: `app/platform/puter.ts` keeps its real
      SDK import and `npm run lint` passes → AC-3

## Formatting and Tailwind

- [ ] Scramble the class order on any element in `app/auth/AuthControl.tsx`, for
      example `className="gap-3 items-center flex"`, then `npm run format` → it
      is rewritten to the plugin's canonical order → AC-9
- [ ] Temporarily rename `app/app.css` in the Prettier config to a file that
      does not exist, run `npm run format` on a file using a `@theme` token
      class such as `text-ink` → the sort differs or the plugin warns, proving
      the `tailwindStylesheet` pointer is actually doing something. Restore →
      AC-9
- [ ] `npx prettier --check build .react-router` is not how this is checked;
      instead confirm `npm run format:check` reports zero files from `build/`
      or `.react-router/`, and `npm run lint` reports zero files from either →
      AC-10

## The pre commit hook

Run these on a scratch branch.

- [ ] Stage a file with an auto fixable issue, for example a badly ordered set
      of Tailwind classes or a missing semicolon, then `git commit` → the commit
      succeeds and `git show` proves the committed content is the fixed version,
      not what was staged → AC-6
- [ ] Stage a file with a non fixable violation, for example an explicit `any`
      annotation, then `git commit` → the commit is refused, and the message
      names the rule and the file in a form a person can read → AC-6
- [ ] Break a type in a file you do **not** stage, stage an unrelated trivial
      change, then `git commit` → the commit is refused by the whole project
      typecheck, which is the case a staged only check would have let through →
      AC-7
- [ ] Fresh clone into a temporary directory, `npm install`, then make a
      violating commit → it is refused, with no setup step run by hand between
      the clone and the commit → AC-8

## Documentation

- [ ] `docs/coding-standards.md` names `app/app.css`, not `app/globals.css` →
      AC-11
- [ ] `docs/coding-standards.md` describes the real `app/auth/`,
      `app/platform/`, `app/projects/` layout rather than `features/upload/`
      and friends → AC-11
- [ ] Its Enforced section lists the SDK import rule and the `jsx-a11y` rules,
      and its Running it table matches the scripts that actually exist in
      `package.json` → AC-11
- [ ] It no longer describes `format:check` as "what CI would run", since there
      is no CI → AC-11
- [ ] `scope.md` feature 1's last box, the lint half of AC-9, is ticked, and its
      Code paragraph no longer names `scripts/check-sdk-import.mjs` as what
      holds the single import rule → AC-4
