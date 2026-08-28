# 0004 rationale: design system tokens, type roles, and interactive states

The reasoning behind [index.md](index.md). Not read during a build.

## Context

> ⚠️ Premise note: the fix queued during feature 1 was recorded as one token,
> `--color-ink-soft`. Measuring the palette shows it is two, and the second one
> is worse, because it is already live in shipped code. `--color-clay`
> (`#b5551f`) clears 4.62:1 against bone but only 4.12:1 against ivory, and
> `SessionBanner` renders a `.btn-accent` (clay text on transparent) inside
> `.banner` (ivory). That button label fails 4.5:1 on screen today. Treating the
> queued item as a single token swap would have fixed the unshipped case and
> left the shipped one. The right framing is a rule rather than a value: every
> text token must clear 4.5:1 against **both** surface tones, so no component
> ever has to know which background it is sitting on. Correcting clay means
> `scope.md`'s written palette is now wrong, and per `CLAUDE.md`'s own rule the
> plan gets fixed, not worked around.

Roomify has a palette and a handful of shared CSS classes. It does not have a
design system. `app/app.css` declares six colours and five component classes,
and every screen then picks its own type sizes, weights, tracking and spacing
from the whole of stock Tailwind. Nine files currently do this. The competing
patterns are visible in a single grep: `text-base font-medium tracking-tight` in
`root.tsx` and `BootScreen`, `text-lg font-medium tracking-tight` in
`SignInPrompt`, `text-2xl font-medium tracking-tight` in `projects` and `home`,
and `text-sm` with and without `text-ink-soft` in six places. None of it is
wrong on its own. All of it is a decision being remade every time somebody
writes a heading.

What breaks when these coexist is not aesthetics, it is checkability. There is
no answer to the question "is this on system?", so nothing can be enforced, and
the accessibility baseline `CLAUDE.md` asks for on every screen becomes a thing
a person has to notice. That is exactly how `--color-ink-soft` shipped at 3.5:1
in two places, and how the clay on ivory case shipped without anyone raising it.
`ConfigScreen` even carries a comment explaining that its steps avoid
`--color-ink-soft` because of the contrast, which is a developer routing around
a defect by hand, one screen at a time, and leaving the token in place for the
next screen to hit.

The forces that shape the answer are specific to this project. There is no test
runner and no browser automation, deliberately, so "checkable" has to mean a
lint rule, a plain script, or a manual walkthrough, and nothing else. The
codebase is nine screens, which is small enough that a single migration is
cheaper than any staged rollout. Tailwind v4 takes its configuration from the
stylesheet, so the token layer and the utility layer are the same file. And
feature 2 has already installed the machinery, ESLint at `--max-warnings 0`, a
pre commit hook, and `npm run verify`, so enforcement here is configuration
rather than new infrastructure.

The consequence of not deciding is not that the app looks inconsistent. It is
that features 5 through 10, all of which are UI, each invent their own answer,
and the contrast defect recurs by exactly the mechanism that produced it twice
already.

## The measurements

Computed from the declared tokens, WCAG 2.1 relative luminance, against both
surface tones.

| Token              | Value     | vs bone `#faf8f4` | vs ivory `#efebe3` | Verdict                                                                                    |
| ------------------ | --------- | ----------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `--color-ink`      | `#1c1b19` | 16.23             | 14.48              | passes comfortably                                                                         |
| `--color-ink-soft` | `#8a8478` | **3.50**          | **3.12**           | fails 4.5:1 on both. Live in `SignInPrompt` and `projects`                                 |
| `--color-clay`     | `#b5551f` | 4.62              | **4.12**           | passes on bone, fails on ivory. Live in `SessionBanner`                                    |
| `--color-hairline` | `#e3ded3` | 1.26              | 1.13               | decorative only, acceptable as a divider, not acceptable as the sole boundary of a control |

Candidate replacements, chosen to stay in the same warm grey and burnt clay
families rather than to shift hue:

| Candidate     | vs bone  | vs ivory |
| ------------- | -------- | -------- |
| `#7a746a`     | 4.37     | 3.90     |
| `#736d63`     | 4.83     | 4.31     |
| **`#6e685e`** | **5.20** | **4.64** |
| `#655f56`     | 5.96     | 5.31     |
| `#a94d19`     | 5.26     | 4.69     |
| `#9e4716`     | 5.88     | 5.25     |

`#6e685e` and `#a94d19` are the shallowest changes that clear 4.5:1 against
both tones with a little headroom. Going darker was available and was declined:
the palette's whole character is quiet, and buying margin beyond what the
standard asks would cost the restraint the design is built on.

## Options considered

### Option 1: define the standard, fix contrast, migrate lazily

Write the token system and the state matrix, correct the two colours, and let
existing screens move onto the system whenever they are next touched.

**Pros**:

- Smallest immediate change. The two live failures are still fixed today.
- No churn in nine working files.

**Cons**:

- The ESLint rules cannot be switched on, because the current tree violates
  them. They ship disabled, or behind a warning baseline.
- A warning baseline at `--max-warnings 0` is a contradiction, and feature 2
  explicitly rejected exactly this at exactly this codebase size.
- "Migrate when next touched" for nine files in a project built in fresh
  conversations means some of them are never touched again and quietly stay off
  system, which is the state this spec exists to end.

### Option 2: define the standard and land it as one migration

Define the tokens, roles, ladder and state matrix; correct the colours; retrofit
all nine files; then switch the lint rules on against an already clean tree.

**Pros**:

- The rules can actually be enforced, which is the deliverable. Everything else
  is prose.
- Mirrors the rollout feature 2 already used and proved on this codebase.
- Nine files is a small blast radius, and the changes are mechanical.

**Cons**:

- Touches nine working files for no user visible gain beyond the contrast fix.
- The diff mixes real changes with Prettier class reordering.
- If a role or a ladder step turns out wrong, the correction touches all nine
  again.

### Option 3: document only, rely on review

Write the system down in `docs/coding-standards.md` and hold it by code review.

**Pros**:

- Zero code change, zero risk, immediately available to the next feature.

**Cons**:

- It is precisely the state feature 2 was built to end. `docs/coding-standards.md`
  itself opens by distinguishing rules a tool fails on from rules held by care,
  and it says the second kind is the one nobody catches.
- The two live contrast failures stay live, because nothing forces the fix.
- The topic asked for a checkable system. This is the uncheckable one.

### Option 4: full component library

Promote every treatment to a React component in root `components/`, leaving
`app.css` holding only tokens and the focus rule.

**Pros**:

- Strongest guarantee that nobody hand rolls a button, since there is no class
  to hand roll.
- A busy button's `aria-busy`, `aria-disabled` and sweeping hairline live in one
  place rather than being set correctly by every caller.

**Cons**:

- A rewrite of every existing screen's markup, not just its classes, which is a
  much larger change than the problem justifies.
- Pushes styling into TSX, against the project's own rule that shared visual
  values live in the stylesheet.
- Premature at nine screens with two button variants.

## Rationale

Option 2, because enforcement is the actual deliverable and Option 1 cannot
deliver it. The topic asked for a checkable system rather than the palette
documented again, and a lint rule that has to ship disabled because the tree
violates it is not a check. The only thing standing between the rules and being
switched on is nine mechanical file edits, and this codebase already ran the
identical play in feature 2, one migration pass to zero rather than a baseline,
with the reasoning that at this size the baseline machinery costs more than the
cleanup it defers. That reasoning has not changed; the file count has barely
moved.

Option 4 was tempting for the busy state specifically, since `aria-busy` plus
`aria-disabled` plus a sweeping hairline is three things a caller can get wrong,
and a component would get them right once. It was declined for now on the same
"boring beats clever" ground the rest of this project runs on, and because it
contradicts the project's own rule that shared visual values live in
`globals.css` or a shared component rather than in markup. The compromise is
explicit and is the answer the engineer chose: the CSS class stays the primitive,
and a React component appears only when something needs behaviour a class cannot
carry. The busy button is the most likely first such component, and this spec
deliberately defines its treatment so that promoting it later is a refactor
rather than a design decision.

On the type scale, the `frontend-design` skill's own calibration names "a warm
cream background with a high contrast serif display and a terracotta accent" as
one of the three looks AI generated design currently defaults to, and Roomify's
decided palette sits close to it. The palette is pinned by `scope.md` and stands.
What was free was the type direction, and spending that freedom on a serif
display face would have walked straight into the default. The axis that already
distinguishes Roomify is its drafting sheet logic, hairline borders as the only
divider, `.boot-rule` as a filling line rather than a spinner, a 2px radius, no
shadows anywhere, which is the vernacular of the thing the app is actually about.
Extending that into the type gives `type-meta`: annotation, tracked open,
uppercase, set in real ink. That choice also happens to close the defect, because
it replaces "small faded grey text" with something that has no reason to be
faded, and small faded grey text is what failed contrast in both live cases. A
single face was kept for the same reason: the restraint is the design, and a
second font request buys decoration this product does not need.

The one accessory removed, in the skill's sense: an earlier draft gave the
hairline a decorative emphasis role, a rule used to mark a section rather than to
divide or to indicate progress. It was cut. On a drawing sheet every line means
something, and a line that means nothing is the one thing that would make the
device read as styling rather than as structure.
