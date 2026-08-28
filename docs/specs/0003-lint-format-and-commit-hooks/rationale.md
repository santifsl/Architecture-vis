# 0003. Rationale

The decision itself, and everything a build needs, is in
[`index.md`](index.md). This file is the record of why.

## Context

> Premise note: the `CROSS-CUTTING` mode this spec was written in assumes a
> codebase with two or three competing patterns fighting each other. That is not
> the situation here. The twenty six files under `app/` were written by one
> person in a short span against a standards document that already existed, and
> they are consistent: the same import ordering, the same header comment
> convention, the same result carrying error style, the same functional shape.
> The problem is not inconsistency. The problem is that nothing holds that
> consistency in place, and a document that says a machine enforces something
> when no machine does is worse than no document, because it reads as a
> guarantee. This spec is therefore about installing the enforcement the
> document already describes, not about ending a pattern war.

`docs/coding-standards.md` was written ahead of its tooling, deliberately: it
describes the conventions after there was real code to describe rather than
guessing up front. It splits its rules into Enforced, meaning a tool fails on a
violation, and Judgment, meaning only a reader will catch it. Right now that
split is false. Nothing is installed. Every rule in the Enforced section is
currently held by the same thing as the Judgment ones, which is care.

Feature 1 left one box open for exactly this reason. Spec 0001's AC-11 requires
that only `app/platform/puter.ts` imports `@heyputer/puter.js`, and that rule is
load bearing rather than tidy: Puter's `getUser()`, `whoami()`, and any `fs` or
`kv` call route a 401 through a reauth policy whose interactive flag defaults to
true, which raises Puter's own login popup. A stray import anywhere else in
`app/` is how an unbidden popup gets put back in front of somebody who only
reloaded the page, which is the exact failure AC-2 exists to prevent. Feature 1
shipped `scripts/check-sdk-import.mjs`, a dependency free Node script, as the
interim holder of that rule, and named this feature as what replaces it.

The forces that shaped the choice:

- The codebase is small, twenty six source files under `app/`, and has one
  author. A staged rollout has almost nothing to stage.
- There is no test runner and no browser automation, by decision recorded in
  `CLAUDE.md`. Static analysis is therefore a larger share of the total safety
  net here than it would be in a project with tests, which raises the value of
  type aware rules.
- Every call into Puter is asynchronous, and the SDK's own type declarations
  type several of its properties as `any`. A linter that reads types will
  therefore both catch real bugs and complain at the one module that touches
  those `any` typed properties on purpose.
- There is no continuous integration and no second contributor, so the hook and
  a local command are the only places enforcement can currently live.

## Options considered

### Option 1: Document and enforce going forward, existing violations as debt

Install the tooling, set the rules that currently fire on existing files to
warning level or exclude those files, and require new code to comply.

**Pros**:

- Lands fastest. The reformat and the `no-unsafe-*` cleanup in the platform
  module do not block the install.
- No large reformat commit up front.

**Cons**:

- Needs a baseline mechanism to hold the line, which is real machinery on a
  twenty six file codebase.
- A lint that is red on day one is a lint nobody reads by day thirty. The
  warning count stops being information.
- It leaves `docs/coding-standards.md` still partly untrue, which is the actual
  problem being solved.

### Option 2: Document and enforce with a single migration pass

Install the tooling and bring the whole tree to zero violations in the same
feature, with lint running at `--max-warnings 0` from the start.

**Pros**:

- The Enforced section of the standards document becomes true in one step.
- Bounded: twenty six files, one author, no other branches in flight.
- Zero is a state that can be maintained. Any non zero number is not.

**Cons**:

- A repository wide reformat commit that damages `git blame` on the lines it
  touches.
- The type aware cleanup in `app/platform/puter.ts` is real work, and it is work
  on the most delicate module in the project.

### Option 3: Document only, rely on review

Write the conventions down, add no tooling, catch violations in review.

**Pros**:

- Nothing to install, nothing to maintain, no dependencies.

**Cons**:

- There is one person here, so review is self review, which is the weakest
  possible enforcement.
- It leaves feature 1's AC-11 resting on a hand written script indefinitely.
- It is the option `docs/coding-standards.md` already rejects by writing an
  Enforced section at all.

## Rationale

Option 2, because the cost that makes it unattractive in general, migrating
every existing violation at once, is close to zero at this size, and the
weakness of option 1 is severe at this size. A warning baseline needs tooling of
its own to be meaningful, and on twenty six files that machinery costs more than
the cleanup it defers. Option 3 fails on the specific force in Context that
there is no test runner here: static analysis is carrying more weight than
usual, so leaving it unautomated leaves the project with almost nothing checking
it except the type checker.

On the rule tier, `recommendedTypeChecked` over the maximal `strictTypeChecked`
plus `stylisticTypeChecked`, and over the four named rules alone. The maximal
presets bring rules like `no-unnecessary-condition` and
`restrict-template-expressions` that fire hardest on framework generated types,
and this project has two sources of those: React Router's generated
`./+types/*` modules and the Puter SDK's declarations. A preset that has to be
disabled in ten places is not a stricter preset, it is a noisier one. The named
rules alone were the runner up and were rejected because they leave out
`no-misused-promises`, which is the sibling of `no-floating-promises` and
matters just as much here: passing an async function straight to a React event
handler is the same failure in a different shape, and every handler in this app
eventually calls Puter.

On the SDK import rule, ESLint replaces the script rather than joining it.
`no-restricted-imports` alone was rejected because it does not see
`await import("@heyputer/puter.js")`, and a rule with a hole in it that the
prose claims is closed is worse than no rule. Pairing it with a
`no-restricted-syntax` selector on `ImportExpression` closes that form, and
together the pair covers everything the script covered while also understanding
what an import actually is, rather than matching text with a regular expression.
Keeping both was the runner up and was rejected on the ordinary grounds that one
rule with two enforcement mechanisms means two places to update and one of them
will be forgotten. The script's one genuine advantage, that it runs with no
dependencies installed, does not matter for a rule that only needs to hold at
commit time and at verify time, both of which happen after `npm install`.

On the plugins, `react-hooks` and `react-refresh` are close to free and catch
real bugs in code that already exists: `useAuthState`, `useSignIn`, and
`useAuthEvents` are all custom hooks, and `useSignIn` builds on
`useSyncExternalStore`, which is unforgiving about a snapshot function that is
not stable. `jsx-a11y` was chosen for a reason specific to this project rather
than a general one: `CLAUDE.md` states an accessibility baseline on every
screen, and features 4, 5, 7, 8, and 9 are all UI. Catching a missing label or a
handler on a non interactive element automatically is worth having in place
before those screens get built rather than after.
`eslint-plugin-import` was left out because its main offerings, import ordering
and cycle detection, address problems this codebase does not have, and its
resolver configuration is a maintenance surface.

On Prettier, defaults were chosen because they already describe the code. The
existing files are double quoted, semicolon terminated, two space indented,
trailing comma'd, and mostly inside eighty columns. Picking a wider print width
would have reformatted every file for no reason beyond preference.
`tailwindStylesheet` pointing at `app/app.css` is not optional in Tailwind v4:
without it the sorting plugin has no view of this project's `@theme` tokens.

On the hook, the standards document's own argument for an unscoped typecheck was
accepted as written, because it is correct. Types are cross file. A changed
return type breaks its callers, and its callers are precisely the files that
were not staged, so a staged only typecheck passes while the project is broken,
which reads as a green light and is therefore worse than no check. `lefthook`
was the runner up and is genuinely a better tool in isolation, one binary
replacing two dependencies, but it contradicts what the standards document
already names and buys little at this size, and this feature is supposed to make
that document true rather than rewrite its choices.

## What was found in the existing code

Read during the design pass, and recorded here because the build will run into
it:

- **The tree is already close to Prettier's output**, but not identical.
  `app/platform/puter.ts` has several declarations well past eighty columns,
  including `openSignIn`'s signature and the `PuterGateError` message. The first
  `npm run format` will rewrite those.
- **`verbatimModuleSyntax` is already `true`** in `tsconfig.json`, so type only
  import syntax is already enforced by the compiler. The ESLint rule adds the
  inline style on top of that, which is a formatting level addition rather than
  a new guarantee.
- **`tsconfig.json` includes everything**, `"include": ["**/*"]`, so the type aware project service covers
  the config files and `scripts/` as well as `app/`. No `allowDefaultProject`
  escape hatch is needed.
- **The Puter SDK's own declarations will fight the `no-unsafe-*` family.**
  `types/index.d.ts` in the installed package declares `whoamiCache_: any`,
  `whoami: any`, and `on(category: any): void`. `app/platform/puter.ts` already
  handles the first two by casting through `unknown` and proving the shape with
  `toRoomifyUser`, which is exactly right. `puter.on` is the one to watch,
  because the module assigns its return value and then calls it. The resolution
  is a narrow typed accessor at that boundary, which is what the standards
  document prescribes for precisely this case, not a disable comment.
- **`authToken` is properly typed** as `string | null`, so `hasStoredToken` is
  clean.

## Where the standards document and the code disagree

Both found during this pass, both corrected by this feature rather than worked
around, per that document's own closing rule:

1. It points `prettier-plugin-tailwindcss` at `app/globals.css`. The real entry
   stylesheet is `app/app.css`, imported by `app/root.tsx`, and it holds the
   `@theme` block with the palette. `CLAUDE.md` repeats the wrong name, which is
   a `/sync` job rather than this feature's.
2. It describes a folder layout of `features/upload/`, `features/generation/`,
   `features/gallery/`, `features/community-feed/`. The real layout puts feature
   folders directly under `app/`: `app/auth/`, `app/platform/`, `app/projects/`.
   The rule being stated, folder by feature with thin routes, is correct and is
   what the code does. Only the example paths are wrong.
