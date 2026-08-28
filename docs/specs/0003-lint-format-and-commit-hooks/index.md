# 0003. Enforce the coding standards with ESLint, Prettier, and a pre commit hook

**Date**: 2026-08-27
**Status**: Proposed

The decision history (what was weighed, what was found in the existing code, and
why each pick beat its runner up) lives beside this file in
[`rationale.md`](rationale.md). The manual verification steps live in
[`verify.md`](verify.md).

## Summary

`docs/coding-standards.md` already describes the tooling this project wants.
Nothing installs it yet, so every rule in that document is currently a promise
kept by hand. This spec turns the enforced half of that document into real
tooling: ESLint with type aware rules, Prettier owning all formatting, and a
Husky pre commit hook that runs both over staged files and then typechecks the
whole project. It also moves feature 1's Puter SDK import rule off the interim
`scripts/check-sdk-import.mjs` script and onto ESLint, which is what closes the
last open box on feature 1.

## Requirements

**User stories**:

- As the person building this, I want a single command that proves a change is
  finished, so that typecheck, lint, format, and a real build stop being four
  things I have to remember.
- As the person building this, I want a violation caught at commit time rather
  than at review time, so that the standards document describes reality instead
  of describing an intention.
- As a future contributor, I want the Puter SDK import rule enforced by the
  linter that already runs, so that a stray SDK import cannot quietly
  reintroduce an unbidden login popup.
- As a reader of `docs/coding-standards.md`, I want every claim in its Enforced
  section to actually be enforced, so that the split between Enforced and
  Judgment is trustworthy.

**Acceptance criteria**:

- **AC-1**: `npm run lint` exits `0` on the tree as it stands after this feature,
  with `--max-warnings 0`. No violation is left behind, and no rule is left
  reporting at warning level.
- **AC-2**: `npm run format:check` exits `0` on the whole tree, and
  `npm run format` is the only thing that decides formatting. ESLint reports no
  formatting opinion of its own.
- **AC-3**: An import of `@heyputer/puter.js` from any file in `app/` other than
  `app/platform/puter.ts` fails `npm run lint`, in all three forms: a static
  `import`, a re export, and a dynamic `import()` expression. The same import
  inside `app/platform/puter.ts` passes.
- **AC-4**: `scripts/check-sdk-import.mjs` and the `check:imports` and `check`
  npm scripts are gone, and nothing else in the repository or the documentation
  still points at them.
- **AC-5**: `npm run verify` runs typecheck, lint, format check, and a real
  production build in that order, and fails on the first one that fails.
- **AC-6**: A commit with a staged file that ESLint can fix is committed already
  fixed, and a commit with a staged file that ESLint cannot fix is refused with
  a readable message.
- **AC-7**: A commit is refused when `tsc` fails anywhere in the project, even
  when the file that breaks is not one of the staged files.
- **AC-8**: A fresh clone plus `npm install` has the hook installed, with no
  separate setup step run by hand.
- **AC-9**: Tailwind class order in a `.tsx` file is rewritten to the plugin's
  canonical order by `npm run format`, using `app/app.css` as the source of the
  Tailwind configuration.
- **AC-10**: `build/` and `.react-router/` are linted by nothing and formatted by
  nothing.
- **AC-11**: `docs/coding-standards.md` matches what actually landed: the entry
  stylesheet is named correctly, the folder layout it describes is the layout the
  code uses, and the SDK import rule and the accessibility rules appear in its
  Enforced section rather than as future tense.

## Decision

**Chosen option**: Option 2, document and enforce with a single migration pass.

Install the tooling `docs/coding-standards.md` already names, bring the whole
existing codebase to zero violations in the same pass, and delete the interim
import check script rather than run two enforcement mechanisms for one rule.

**Implementation skills**: none. The `react-router` skill at
`.agents/skills/react-router/` governs routing, which this feature does not
touch.

## Standard definition

### Canonical pattern

One flat ESLint config at the repository root, one Prettier config, one hook.
The shape, written for ESLint's flat config format. Treat the plugin export
names below as the shape rather than as verified spelling: the flat config
entry points for these plugins have moved more than once, so at build time read
each installed package's own `package.json` and type declarations and use what
it actually exports.

```js
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

const SDK = "@heyputer/puter.js";
const SDK_OWNER = "app/platform/puter.ts";

export default tseslint.config(
  { ignores: ["build/**", ".react-router/**", "node_modules/**"] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },

  reactHooks.configs.recommended,
  reactRefresh.configs.vite,
  jsxA11y.flatConfigs.recommended,

  {
    rules: {
      // The four rules docs/coding-standards.md names by hand.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],

      // Spec 0001, AC-11. The static and re export forms.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: SDK,
              message: `${SDK} may only be imported by ${SDK_OWNER}. Reach Puter through withPuter() from that module instead.`,
            },
          ],
        },
      ],
      // The dynamic form, which no-restricted-imports does not see.
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression > Literal[value="${SDK}"]`,
          message: `${SDK} may only be imported by ${SDK_OWNER}. Reach Puter through withPuter() from that module instead.`,
        },
      ],
    },
  },

  // The one module the rule exists to permit.
  {
    files: [SDK_OWNER],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },

  // Last, so nothing here argues with Prettier.
  prettier,
);
```

Prettier takes its defaults, which already match every file written so far
(double quotes, semicolons, two space indent, eighty columns, trailing commas).
The only addition is the Tailwind plugin, pointed at the real entry stylesheet:

```json
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./app/app.css"
}
```

Tailwind v4 takes its configuration from the stylesheet rather than from a
JavaScript config file, so the plugin has to be told where that stylesheet is or
it sorts against stock Tailwind and quietly loses this project's `@theme`
tokens.

The npm scripts, which are the interface everything else uses:

| Script                 | Runs                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `lint`                 | `eslint . --max-warnings 0`                                    |
| `lint:fix`             | `eslint . --fix --max-warnings 0`                              |
| `format`               | `prettier --write .`                                           |
| `format:check`         | `prettier --check .`                                           |
| `verify`               | `typecheck`, then `lint`, then `format:check`, then `build`     |

The hook, `.husky/pre-commit`:

```sh
npx lint-staged
npm run typecheck
```

with `lint-staged` configured to run `eslint --fix` then `prettier --write` over
staged files only, and `"prepare": "husky"` in `package.json` so a fresh clone
installs the hook on `npm install` with nothing to remember.

### Replaces

- `scripts/check-sdk-import.mjs` and the `check:imports` npm script. Deleted.
  The ESLint pair above covers every form that script covered.
- The `check` npm script (`typecheck && check:imports`). Replaced by `verify`.
- The claim in `docs/coding-standards.md` that the Tailwind Prettier plugin is
  pointed at `app/globals.css`. The real entry stylesheet is `app/app.css`.
- The claim in `docs/coding-standards.md` that the layout is
  `features/upload/`, `features/generation/`, and so on. The real layout is
  `app/auth/`, `app/platform/`, `app/projects/`, feature folders directly under
  `app/`. The rule the doc is stating (folder by feature, routes stay thin) is
  correct and stands; only the example paths are wrong.
- Formatting by hand and by eye. Prettier owns it entirely from here.

### Enforcement

| Rule                                            | Enforced by                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| No `any`                                        | `@typescript-eslint/no-explicit-any`, error                        |
| No floating promises                            | `@typescript-eslint/no-floating-promises`, error, type aware       |
| Consistent inline type imports                  | `@typescript-eslint/consistent-type-imports` plus `verbatimModuleSyntax` already on in `tsconfig.json` |
| `readonly` on never reassigned class fields     | `@typescript-eslint/prefer-readonly`, error                        |
| Only `app/platform/puter.ts` imports the SDK    | `no-restricted-imports` plus `no-restricted-syntax`, error, with a per file override |
| Formatting and Tailwind class order             | Prettier plus `prettier-plugin-tailwindcss`, checked by `format:check` |
| Hook rules and hot reload safety                | `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`         |
| The machine checkable part of accessibility     | `eslint-plugin-jsx-a11y`, recommended set                          |
| All of the above, at commit time                | Husky plus `lint-staged`                                           |
| Types across the whole project, at commit time  | `npm run typecheck` in the hook, unscoped on purpose               |

Everything under the Judgment heading in `docs/coding-standards.md` stays
judgment. `jsx-a11y` moves part of the accessibility baseline into Enforced, but
only the part a static rule can see: contrast, focus visibility, and real
keyboard operation are still checked by a person, and that stays true in the
document.

There is no continuous integration in this feature. `npm run verify` and the
hook are the enforcement, and `docs/coding-standards.md` should say that in the
present tense rather than describing a CI that does not exist.

### Rollout

A single migration pass, all in this feature. Install, configure, then bring the
existing tree to zero: Prettier will rewrite the files that run past eighty
columns, and the type aware rules will report in `app/platform/puter.ts` where
the SDK's own declarations type `whoami` and `whoamiCache_` as `any`. That
module is a deliberate boundary, so the fix there is a narrow typed accessor at
the boundary, which is what `docs/coding-standards.md` already prescribes, not a
file wide disable comment.

### Exceptions

- `app/platform/puter.ts` is exempt from the SDK import rule. That is the whole
  point of the rule, and the exemption is a per file override in the config, not
  a disable comment in the file.
- A single line `eslint-disable-next-line` is allowed only where a rule fights a
  type the Puter SDK itself declares as `any`, and only with a comment saying
  which SDK declaration forces it. A file wide disable is never allowed. If a
  rule needs disabling in more than two places, turn it off in the config with a
  written reason instead, so the reason lives in one place.
- Generated output is not linted or formatted at all: `build/` and
  `.react-router/`.

## Build plan

Ordered so the thing that proves itself lands first, which matches this
project's stated approach of a thin working slice before anything is made
fuller. Lint working end to end on the real codebase is the review point; the
hook only makes automatic what already works by hand.

1. Install and configure Prettier with `prettier-plugin-tailwindcss` pointed at
   `app/app.css`, add `.prettierignore` covering `build/` and `.react-router/`,
   add the `format` and `format:check` scripts, then run `npm run format` once
   over the tree and commit the reformat on its own so it never mixes with a
   behaviour change. Satisfies **AC-2**, **AC-9**, and half of **AC-10**.
2. Install ESLint with `typescript-eslint` on the type aware project service,
   `recommendedTypeChecked`, and the four named rules, with
   `eslint-config-prettier` last. Add the `lint` and `lint:fix` scripts. Satisfies
   **AC-1** and the rest of **AC-10**.
3. Add `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and
   `eslint-plugin-jsx-a11y`. Satisfies **AC-1**.
4. Bring the tree to zero violations, fixing rather than disabling. Expect the
   `no-unsafe-*` family to report in `app/platform/puter.ts`; resolve it by
   narrowing the SDK surface at that boundary, per the Exceptions above.
   Satisfies **AC-1**.
5. Add the two SDK import rules and the per file override, and prove both
   directions: a planted static import fails, a planted dynamic `import()` fails,
   and `app/platform/puter.ts` still passes. Only then delete
   `scripts/check-sdk-import.mjs` and the `check:imports` and `check` scripts.
   Satisfies **AC-3** and **AC-4**.
6. Add the `verify` script chaining typecheck, lint, format check, and build, and
   run it. Satisfies **AC-5**.
7. Install Husky and `lint-staged`, write `.husky/pre-commit`, add
   `"prepare": "husky"`, and confirm the three commit cases: an auto fixable
   violation, a non fixable one, and a type error in an unstaged file. Satisfies
   **AC-6**, **AC-7**, and **AC-8**.
8. Update `docs/coding-standards.md`: correct `app/globals.css` to `app/app.css`,
   correct the `features/` example paths to the real `app/` layout, add the SDK
   import rule and the `jsx-a11y` rules to Enforced, and state that `verify` and
   the hook are the enforcement rather than a CI that does not exist. Satisfies
   **AC-11**.
9. Tick feature 1's last open box in `scope.md`, the lint half of its AC-9, and
   update its Code section, which currently names `scripts/check-sdk-import.mjs`
   as what holds the single import rule. Satisfies **AC-4**.

## Consequences

**Positive**:

- `docs/coding-standards.md` stops being aspirational. Every claim under its
  Enforced heading is enforced by something that fails.
- Feature 1's AC-11 gets an enforcement that understands the code rather than a
  regular expression over file text, and its last open box closes.
- One command, `npm run verify`, is the answer to "is this finished", which is
  the rule `CLAUDE.md` states and the one most likely to be skipped otherwise.
- `no-floating-promises` covers a real failure mode in this codebase
  specifically: every Puter call is asynchronous, and an un awaited one there
  resolves into nothing rather than throwing.

**Negative and tradeoffs**:

- The first Prettier run rewrites files across the repository. That reformat
  commit is noise in the history, and it makes `git blame` less useful on the
  lines it touches. It lands on its own so it is at least skippable.
- Type aware linting is noticeably slower than plain linting, because it builds
  a TypeScript program. On a project this size that is seconds, not minutes, but
  it grows.
- Every commit now pays a whole project typecheck. That is deliberate, and it is
  the cost of the hook catching the cross file breakage that a staged only check
  would miss.
- Nine or so new development dependencies, each with its own upgrade cadence.
  ESLint flat config and its plugin ecosystem in particular still churn.
- `jsx-a11y` will produce some findings that need a real judgment call rather
  than a mechanical fix, and it cannot see the parts of the accessibility
  baseline that matter most here.

**Neutral**:

- No continuous integration is added. Vercel already builds on push, so the
  build half is partly covered by accident; lint and format are not covered
  anywhere except locally, which is a deliberate gap recorded in Follow up.
- No editor configuration is checked in. The hook makes the result the same
  whatever anyone's editor does.
- Exact package versions are not pinned here. Install what is current at build
  time and record the versions in `package.json` as usual.

## Follow-up

- [ ] No continuous integration means the enforcement is local only, and a
      `--no-verify` commit bypasses all of it silently. Worth revisiting when
      more than one person commits to this repository, or at the first bypass
      that reaches `main`.
- [ ] `eslint-plugin-import` was considered and left out. Revisit if import
      cycles or import ordering ever become a real problem rather than a
      hypothetical one.
- [ ] The immutability rule in `docs/coding-standards.md` stays judgment. If a
      preset ever exists that enforces it without fighting React and React
      Router's generated types, revisit.
- [ ] Spec 0001's Follow up on pinning the Puter SDK version becomes more
      pressing once the linter depends on that package's declarations to decide
      what is `any`. Not this feature's job, but related.

## Rationale

Reasoning, the options weighed, and what was found in the existing code: see
[`rationale.md`](rationale.md).
