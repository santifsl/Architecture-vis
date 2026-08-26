# Coding standards

The conventions this codebase actually follows, written down after there was
real code to describe rather than guessed at up front. `CLAUDE.md` states the
rules in one line each; this file is the long version, and it says for every
rule whether a machine enforces it or a person has to.

Two categories, and the difference matters:

- **Enforced** means a tool fails on it. You cannot commit a violation without
  deliberately bypassing the hook.
- **Judgment** means nobody will catch it but a reader. These are the ones worth
  actually reading, because the tooling is silent on them.

## Running it

| Command               | What it does                                          |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Development server.                                     |
| `npm run typecheck`    | `tsc --noEmit` over the whole project.                  |
| `npm run lint`         | ESLint, including the type-aware rules.                 |
| `npm run lint:fix`     | The same, applying every fix it can.                    |
| `npm run format`       | Prettier, writing.                                       |
| `npm run format:check` | Prettier, reporting only. This is what CI would run.    |
| `npm run verify`       | Typecheck, lint, format check, and a real production build. |

`npm run verify` is the one to run before calling any piece of work done. The
project rule is that a change is not finished until it has been typechecked,
linted, and built for real, and chaining those into one command is the only
way that reliably happens rather than being remembered three times out of
four.

There is no test runner and no browser automation framework, deliberately.
Verification here is a running dev server and a real browser, or something as
light as `curl` against the Puter worker directly. Do not install one to check
that something works.

## The pre-commit hook

Husky runs `.husky/pre-commit`, which does two things:

1. `lint-staged` — ESLint with `--fix` and then Prettier, over staged files
   only. Fast, and it only ever touches what you were already committing.
2. `npm run typecheck` — the whole project, every time.

The typecheck is not scoped to staged files on purpose. Types are cross-file: a
changed return type breaks its callers, and those callers are exactly the files
you did not stage. A staged-only typecheck would pass while the project is
broken, which is worse than no check at all because it reads as a green light.

The production build stays out of the hook. It is slow enough that a hook
running it would get bypassed within a week, and `npm run verify` covers it at
the moment it actually matters.

The hook installs itself: `prepare` runs `husky` on `npm install`, so a fresh
clone is protected without anyone remembering a setup step.

## Enforced

**No `any`.** `@typescript-eslint/no-explicit-any` is an error. TypeScript is in
`strict` mode and this rule closes the escape hatch that would otherwise make
strictness optional. Where Puter.js does not surface something typed, a worker
response, a KV value, that needs its shape validated — the answer is a narrow
typed accessor of our own, parsed or asserted in one place, not `any` spreading
outward from the call site.

**No floating promises.** `@typescript-eslint/no-floating-promises` is an error,
and it is the reason the ESLint config turns on typescript-eslint's project
service at all. Every call into Puter, auth, storage, KV, and the worker, is
asynchronous. An un-awaited promise there does not throw; it resolves into
nothing, and the symptom is an upload that silently never finishes, or a
render that never updates its status. This rule is worth the slower lint.

**Consistent type imports.** Type-only imports are written as such, inline. It
keeps the runtime import graph honest.

**`prefer-readonly`.** A class field never reassigned must be `readonly`.
Narrow in reach, since this codebase is nearly all functions, but it points the
same direction as everything below.

**Formatting.** Prettier owns it entirely, with `eslint-config-prettier` last in
the ESLint config so the two never argue. Tailwind class order is sorted by
`prettier-plugin-tailwindcss`, pointed at `app/globals.css` (or the project's
equivalent entry stylesheet) since Tailwind takes its configuration from the
stylesheet rather than a JS config file. Class order being automatic means a
diff never contains a reordering argument.

**Build output is excluded, not formatted.** `build/` is the build output (and
`.react-router/` holds generated route types). Both are gitignored, and both
belong in `.prettierignore` and ESLint's ignore list. Linting output nobody
wrote, or types nobody hand-edited, is noise.

## Judgment

**Functional style.** Pure functions by default. No shared mutable state. Side
effects pushed to the edges. In practice: a function that computes should not
also write, and a module should not do anything at import time.

**Puter is the source of truth, not a local cache of it.** There is no
process-wide singleton here the way a database pool or a rate-limiter client
might need one elsewhere, there's no long-lived server process at all. A
project's real state, its render status, its visibility, lives in Puter's KV
store. React state exists to render what's there and to reflect optimistic UI
while a write is in flight, it is not a second source of truth that can drift
from what Puter actually has.

**Nothing reads the environment at import time.** `VITE_PUTER_WORKER_URL` is
read once, at startup, and checked before the app renders anything that would
need it. Parsing it at module scope risks the same failure mode as reading a
secret at import time anywhere else: it works in dev by accident and breaks
the first time the module load order changes. A missing value still kills the
app before it tries to generate anything, that's the fail-fast rule, satisfied
at boot, not at the moment a user clicks generate.

**Immutable data.** `const` and `readonly`, `map`/`filter`/`reduce` over
mutating loops. Not lintable without a preset strict enough to fight the
framework, so it is on the reader.

**Folder by feature, not by layer.** `features/upload/`, `features/generation/`,
`features/gallery/`, `features/community-feed/`. Routes stay thin: parse,
protect, delegate to a feature.

- **More than one feature renders it** — root `components/`. A project card
  is the obvious candidate here, the gallery and the community feed both draw
  it. It says in its own header why it's there.
- **One feature renders it** — that feature's folder, however shared it looks.
  Composing shared pieces does not make something shared.
- **shadcn owns the path**, if shadcn ends up in use — `components/ui/` and
  `lib/utils.ts` are fixed by `components.json`. They are generated, not
  written here.

**Never show a raw exception or a provider error.** Every failure a person can
see is a plain human sentence plus a retry action. This includes a failed
Claude or Gemini call through the worker, the user sees "the render didn't
finish, try again," never the provider's own error text or a stack trace.

**Roomify's model calls are metered by Puter, not by us.** There's no
free-tier accounting the way an OpenRouter-backed project might need, don't
add a cost-tracking layer here, that duplicates something the platform
already owns.

**Shared values live in one place.** Spacing, color, and repeated UI patterns
belong in the global stylesheet or a shared component, never copy-pasted as
raw Tailwind classes across files. The rule of thumb: the same handful of
classes in three places is a component, not a coincidence. Colors and the
accent rules are decided in `scope.md`'s design feature, read that rather
than inventing values here.

**Accessibility baseline on every screen.** Real contrast, visible focus, full
keyboard operation. Not a pass at the end; part of building the screen.

## When a rule and the code disagree

Say so and fix the rule, not just the code. This file and `scope.md` are both
meant to be corrected in place when building proves them wrong, quietly
working around a documented rule is the one thing that makes these documents
worthless.
