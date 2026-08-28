# 0004. Design system: tokens, type roles, and interactive states

**Date**: 2026-08-27
**Status**: Accepted

## Summary

Roomify already has five colours and a handful of shared CSS classes. It does
not have a design system, because nothing says which type sizes are allowed,
what the spacing rhythm is, which states every control must define, or how any
of that gets checked. This spec turns the decided palette into a closed,
enforceable system: six named type roles, a nine step spacing ladder, six
mandatory interactive states, and tokens for radius, border and motion. It also
fixes two live accessibility failures found while writing it, one of them the
`--color-ink-soft` problem queued during feature 1, and it makes the whole thing
checkable by a lint rule, a contrast script wired into `npm run verify`, and a
manual walkthrough.

## Requirements

**User stories**:

- As someone building a new Roomify screen, I want a closed set of type, spacing
  and colour choices so that I am never inventing a value, and so that a screen
  built in a fresh conversation looks like the screens built before it.
- As someone reviewing a change, I want off system values to fail the commit
  rather than fail my attention, so that consistency is held by a tool and not
  by whoever happens to be reading.
- As someone using Roomify with low vision or a keyboard, I want every piece of
  text to meet contrast and every control to show where focus is, on every
  screen, not on the screens somebody remembered to check.

**Acceptance criteria**:

- **AC-1**: Every colour token used as a text colour clears 4.5:1 against both
  `--color-bone` and `--color-ivory`, and the focus ring colour clears 3:1
  against both. A script asserts this and `npm run verify` fails when it does
  not hold.
- **AC-2**: `--color-ink-soft` is `#6e685e` and `--color-clay` is `#a94d19`.
  Neither `#8a8478` nor `#b5551f` survives as a live value: not in `app/`, and
  not in `scope.md`'s palette statement. Both may still appear in prose that
  names them as the corrected-from values, which `scope.md`, this spec's
  `rationale.md` and its `verify.md` all deliberately do. A record of why a
  number changed is worth more than a clean grep.
- **AC-3**: Six type roles exist as `type-display`, `type-title`,
  `type-heading`, `type-body`, `type-meta` and `type-code`, each carrying size,
  line height, weight, tracking and case together. No `className` in `app/` sets
  a font size, a font weight or a tracking value by stock Tailwind utility.
- **AC-4**: Every spacing utility in every `className` in `app/` comes from the
  nine step ladder in the Standard definition. An off ladder step fails lint.
- **AC-5**: `.btn-accent` and `.btn-quiet` each define all six states: rest,
  hover, active, focus visible, disabled, loading. Each is observable by hand in
  a real browser.
- **AC-6**: The loading state sets `aria-busy="true"` and
  `aria-disabled="true"`, leaves the control focusable, drops the label to clay
  at 55% opacity, and shows a sweeping hairline. No spinner and no second hue
  exist anywhere in the tree.
- **AC-11**: A control that is busy cannot run its action twice. Because
  `aria-disabled` does not block a click the way the real `disabled` attribute
  does, every busy control's handler returns immediately while busy, and
  activating a busy control by mouse, by `Enter` and by `Space` each produce no
  second call.
- **AC-7**: `--radius`, the border width, `--ring-width`, `--ring-offset`,
  `--duration-quick` and `--ease-standard` are declared once in `@theme` and
  every rule that rounds, rings or transitions references them. No literal
  length or duration appears in a rule, or in a comment: a grep for one should
  stay silent. Every transition and animation in `app.css` is
  suppressed inside the existing `prefers-reduced-motion` block.
- **AC-8**: The five screens that already exist (`root.tsx`, `BootScreen`,
  `SignInPrompt`, `SessionBanner`, `AuthControl`, `AuthNotice`, `ConfigScreen`,
  `home`, `projects`) render on the system, and the tree passes
  `npm run lint -- --max-warnings 0` with the new rules switched on.
- **AC-9**: `docs/coding-standards.md` carries the design system rules, split
  between Enforced and Judgment the way every other rule in that file is, and
  `scope.md`'s feature 4 prose states the corrected hex values.
- **AC-10**: Dark mode is recorded as deliberately out of scope. `color-scheme:
light` stays, and no `dark:` variant appears in the tree.

## Decision

**Chosen option**: Option 2: define the standard and land it as a single
migration.

Roomify adopts a closed token system covering colour, type, spacing, radius,
border and motion, plus a mandatory six state matrix for every interactive
control, enforced by ESLint and a contrast script, and the existing screens are
migrated onto it in this feature rather than lazily.

**Implementation skills**: `frontend-design`
(`anthropics/claude-plugins-official`,
`.claude/plugins/cache/claude-plugins-official/frontend-design/`) ·
`react-router` (bundled with this project, `.agents/skills/react-router/`)

## Standard definition

### Canonical pattern

The whole system lives in `app/app.css`. A screen composes named classes and
ladder steps, and never states a size, a weight, a colour or a radius directly.

```css
/* app/app.css */
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  /* Surfaces and ink. Corrected for contrast, see AC-1. */
  --color-bone: #faf8f4;
  --color-ivory: #efebe3;
  --color-ink: #1c1b19;
  --color-ink-soft: #6e685e;
  --color-hairline: #e3ded3;
  --color-clay: #a94d19;

  /* Form. The gallery look is tight and unrounded, decided once. */
  --radius: 2px;
  --border-hairline: 1px;
  --ring-width: 2px;
  --ring-offset: 2px;

  /* Motion. */
  --duration-quick: 120ms;
  --ease-standard: ease;

  /*
   * The six type roles. Deliberately NOT the `--text-*` namespace: Tailwind v4
   * turns any `--text-<name>` key into a `text-<name>` utility automatically,
   * which would give every role a second, unblocked name and quietly reopen the
   * closed set. These are plain custom properties, so the only way to reach a
   * role is its `type-*` utility.
   */
  --type-display-size: 2.5rem;
  --type-display-leading: 1.05;
  --type-display-tracking: -0.03em;
  --type-display-weight: 500;

  --type-title-size: 1.5rem;
  --type-title-leading: 1.15;
  --type-title-tracking: -0.02em;
  --type-title-weight: 500;

  --type-heading-size: 1rem;
  --type-heading-leading: 1.4;
  --type-heading-tracking: -0.01em;
  --type-heading-weight: 500;

  --type-body-size: 0.875rem;
  --type-body-leading: 1.55;
  --type-body-tracking: 0;
  --type-body-weight: 400;

  --type-meta-size: 0.75rem;
  --type-meta-leading: 1.4;
  --type-meta-tracking: 0.06em;
  --type-meta-weight: 500;

  --type-code-size: 0.8125rem;
  --type-code-leading: 1.5;
  --type-code-tracking: 0;
  --type-code-weight: 400;
}

/*
 * One utility per role, so a role is a single name rather than a stack of
 * utilities a screen has to remember to repeat. `meta` carries its uppercase
 * here rather than in the markup, so the underlying text stays sentence case
 * for anything reading it aloud.
 */
@utility type-display {
  font-size: var(--type-display-size);
  line-height: var(--type-display-leading);
  letter-spacing: var(--type-display-tracking);
  font-weight: var(--type-display-weight);
}
/* type-title, type-heading, type-body, type-code follow the same shape. */

@utility type-meta {
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-leading);
  letter-spacing: var(--type-meta-tracking);
  font-weight: var(--type-meta-weight);
  text-transform: uppercase;
}

/*
 * Component classes take their type from the same role values, never a second
 * copy of the number. `.code-token` and `type-code` were two independently
 * maintained `0.8125rem` literals before this rule existed.
 */
.code-token {
  font-size: var(--type-code-size);
  line-height: var(--type-code-leading);
}

.btn-accent,
.btn-quiet,
.notice {
  font-size: var(--type-body-size);
  line-height: var(--type-body-leading);
  font-weight: var(--type-body-weight);
}
```

And a screen reads like this:

```tsx
<h1 className="type-title text-ink">Roomify</h1>
<p className="type-body mt-2 text-ink">Sign in to keep your projects.</p>
<p className="type-meta mt-4 text-ink-soft">Claude and Gemini</p>
<button type="button" className="btn-accent mt-6">Upload a floor plan</button>
```

### Colour

| Token              | Value     | Job                                                                  | Contrast on bone / ivory                        |
| ------------------ | --------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| `--color-bone`     | `#faf8f4` | Page background                                                      | n/a                                             |
| `--color-ivory`    | `#efebe3` | Surface tone: banner, code token                                     | n/a                                             |
| `--color-ink`      | `#1c1b19` | Primary text                                                         | 16.23 / 14.48                                   |
| `--color-ink-soft` | `#6e685e` | Secondary text and meta labels                                       | 5.20 / 4.64                                     |
| `--color-hairline` | `#e3ded3` | Every border and divider                                             | decorative, not a boundary a control depends on |
| `--color-clay`     | `#a94d19` | The one accent: interactive text, focus ring, hover fill, busy state | 5.26 / 4.69                                     |

Rules that do not change from `scope.md`: clay appears only on things you
interact with. There is no status colour, ever. Public against private, and
errors, are carried by words and by the thin outlined mark, never by hue. Work
in progress is clay at reduced opacity, never a second colour.

### Type

Six roles, closed set, Inter throughout. `meta` is the annotation role: small,
tracked open, uppercase, and set in real ink rather than faded grey. Faded small
grey text is not a pattern in this app, which is both a look and the reason the
contrast bug cannot recur by habit.

| Role           | Size / line height   | Weight | Tracking | Case       | Job                                                                            |
| -------------- | -------------------- | ------ | -------- | ---------- | ------------------------------------------------------------------------------ |
| `type-display` | 2.5rem / 1.05        | 500    | −0.03em  | as written | The hero line, feature 5                                                       |
| `type-title`   | 1.5rem / 1.15        | 500    | −0.02em  | as written | Page `h1`                                                                      |
| `type-heading` | 1rem / 1.4           | 500    | −0.01em  | as written | Section and card headings                                                      |
| `type-body`    | 0.875rem / 1.55      | 400    | 0        | as written | Prose, labels, control text                                                    |
| `type-meta`    | 0.75rem / 1.4        | 500    | +0.06em  | uppercase  | Annotation: the model line on a card, a public or private label, a field label |
| `type-code`    | 0.8125rem / 1.5 mono | 400    | 0        | as written | The existing `.code-token`                                                     |

### Spacing

Tailwind's stock 0.25rem base is kept. The allowed ladder is nine steps, each
with a job, and nothing else is legal.

| Step | Value   | Job                                                     |
| ---- | ------- | ------------------------------------------------------- |
| `1`  | 0.25rem | Inside a control; the gap between an icon and its label |
| `2`  | 0.5rem  | A tight pair of related lines                           |
| `3`  | 0.75rem | Between siblings inside one group                       |
| `4`  | 1rem    | Between elements inside a block                         |
| `6`  | 1.5rem  | Page gutter and header padding                          |
| `8`  | 2rem    | Between blocks                                          |
| `12` | 3rem    | Between minor sections                                  |
| `16` | 4rem    | Section rhythm on a normal page                         |
| `24` | 6rem    | Top and bottom of a sparse, centred screen              |

### The six interactive states

Every control defines all six. A control that cannot be busy still declares the
other five.

| State            | Treatment                                                                                                                                                                                      | Notes                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| rest             | The control class as written                                                                                                                                                                   |                                                                                              |
| hover            | `.btn-accent` fills clay with bone text; `.btn-quiet` turns clay and underlines                                                                                                                | Transitions on `--duration-quick` `--ease-standard`                                          |
| active (pressed) | The hover treatment with the transition suppressed                                                                                                                                             | The press reads instantly rather than easing, which is what makes a quiet button feel crisp  |
| focus visible    | The one global rule: `2px` clay outline, `2px` offset, `var(--radius)`                                                                                                                         | Never removed and never replaced per component. It already exists and stays exactly as it is |
| disabled         | `opacity: 0.55`, `cursor: default`, no hover response, and the real `disabled` attribute                                                                                                       | Not a class alone, so the control is genuinely inert                                         |
| loading (busy)   | `aria-busy="true"` and `aria-disabled="true"`, the label drops to clay at 55% opacity, a hairline sweeps beneath the control, **and the control's own handler returns immediately while busy** | See the two rules below, both load bearing                                                   |

Two rules the busy state depends on, neither of which is optional:

- **`aria-disabled` does not stop a click.** The three call sites that exist
  today (`AuthControl`, `SignInPrompt`, `SessionBanner`) all pass a real
  `disabled={busy}`, which does. Moving to `aria-disabled` to keep the control
  focusable therefore removes the only thing preventing a second activation, so
  the control's handler must return early while busy. A busy button whose
  handler is unguarded fires `signIn()` twice, which is a worse bug than the
  focus loss the change was made to fix.
- **The sweep is a pseudo element on the control, not a sibling.** `.btn-accent`
  and `.btn-quiet` get `position: relative`, and the sweep is an `::after` at
  `position: absolute; bottom: -1px; height: 1px`, carrying the same animation
  as `.boot-rule`. Written as a sibling element it would need JSX changes at
  every call site, which is how a state ends up applied in four places and
  missed in the fifth.

The busy treatment is defined here rather than in feature 6 on purpose.
Generation in progress is the app's signature state, `scope.md` already fixed
its look, and `.boot-rule` already proves the pattern. Leaving it undefined is
how it gets improvised under deadline as a spinner.

### Where each value comes from

So no build step has to invent one.

| Treatment                               | Value                                           | Source                                                          |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Every colour                            | six `@theme` colour tokens                      | `scope.md` feature 4, with the two corrected in AC-2            |
| Every type size, weight, tracking, case | one of six `type-*` utilities                   | this spec's Type table                                          |
| Every margin, padding, gap              | one of nine ladder steps                        | this spec's Spacing table                                       |
| Every corner                            | `var(--radius)`                                 | this spec, `2px`                                                |
| Every border width                      | `var(--border-hairline)`                        | this spec, `1px`                                                |
| Every transition duration and easing    | `var(--duration-quick)`, `var(--ease-standard)` | this spec, `120ms` `ease`, matching what `app.css` already uses |
| The busy opacity                        | `0.55`                                          | `scope.md` feature 4, already used by `.boot-rule`              |
| Every focus ring                        | `var(--ring-width)`, `var(--ring-offset)`       | this spec, `2px` each, added during the build (see below)       |

### Replaces

- Picking a stock Tailwind text size and pairing it with a weight and a tracking
  by hand, as `text-sm font-medium tracking-tight` currently does in six places.
- Secondary text expressed as a faded grey. `text-ink-soft` at the corrected
  value is legal; reaching for a lighter grey to signal "less important" is not,
  `type-meta` is.
- Any raw hex, `rgb()`, or arbitrary colour value in a `className`.
- Any spacing step outside the nine.
- Any `rounded-*` utility. Radius comes from the component class.
- Any status colour. There is still no red, no green, and no amber in this app.
- Repeating `border-radius: 2px` and `transition: ... 120ms ease` as literals
  inside `app.css`, which currently happens in five rules.
- A component class stating its own font size. `.btn-accent`, `.btn-quiet`,
  `.notice` and `.code-token` all do today, and `.code-token`'s `0.8125rem` is a
  second, independently maintained copy of `type-code`'s. They take the role
  values instead.
- Blocking a busy control with the real `disabled` attribute, which is what all
  three current call sites do. It throws focus away mid action. `aria-disabled`
  plus a guarded handler replaces it.

### Enforcement

Three layers, in descending strength.

1. **ESLint**, in `eslint.config.js`, as `no-restricted-syntax` selectors over
   `className` string literals. Each fails at `--max-warnings 0`, so the
   pre commit hook blocks the commit. The rules catch: a hex or `rgb()`; an
   arbitrary colour value such as `bg-[...]` or `text-[#...]`; a stock Tailwind
   colour family name; a stock text size, `font-*` weight or `tracking-*`
   utility; an arbitrary type value (`text-[13px]`, `tracking-[0.02em]`,
   `leading-[1.3]`, `font-[500]`); any `rounded-*`; and any spacing step outside
   the ladder. The spacing selector covers every prefix Tailwind actually ships,
   the logical ones included: `m p mt mb ml mr ms me mx my pt pb pl pr ps pe px
py gap gap-x gap-y space-x space-y`. Omitting `ps` and `space-y` would let
   `ConfigScreen`'s existing `ps-5` and `space-y-2` through, which would make
   AC-4 false for code already in the tree. Layout arbitrary values such as
   `max-w-[42ch]` stay legal, because layout is not what drifts. Note the esquery escaping trap feature 2 already paid for: the
   regex inside a `no-restricted-syntax` selector is slash delimited, so any
   slash in a pattern has to be escaped or the selector is a parse error at lint
   time rather than a failing rule.
2. **A contrast script**, `scripts/check-contrast.mjs`, run by `npm run verify`.
   It parses the `@theme` block of `app/app.css`, computes WCAG relative
   luminance, and asserts every text colour token clears 4.5:1 against both
   surface tones and that clay clears 3:1 as a focus ring. It exits non zero
   naming the failing pair and its actual ratio. Its job is narrower than layer
   1's: the lint rule already stops a screen reaching for an off token colour,
   so what this catches is a future deliberate edit to the palette itself, which
   is exactly how both current failures were introduced. It is arithmetic over
   CSS values, which no lint rule can do.
3. **A manual walkthrough**, in this spec's
   [verify.md](verify.md). It covers what no tool can see: whether focus is
   genuinely visible, whether every screen is operable from the keyboard, and
   whether hover, active, disabled and busy read correctly to a person.

### Rollout

A single migration, in this feature. The lint rules are switched on last, after
the existing screens are already clean, so the tree never carries a warning
baseline. This is exactly the rollout feature 2 used, and for the same reason:
at this size the baseline machinery costs more than the cleanup it defers.

### Corrections made during the build

- **The focus ring gained two tokens.** This spec originally carried the ring
  over from spec 0001 unchanged, which left `outline: 2px` and
  `outline-offset: 2px` as bare literals in the one rule that draws them, while
  radius, spacing and motion all had tokens. That is the same gap the rest of the
  system exists to close, so `--ring-width` and `--ring-offset` were added rather
  than the check relaxed. They match `--radius` by taste, not by relationship,
  and are kept separate so retuning the ring cannot silently round every corner.
- **The palette comment no longer names the corrected-from hexes.** The rule is
  that no off-system colour appears anywhere in `app/`, a comment included, so a
  grep for one stays silent. The superseded values live in `rationale.md`, which
  is where the record belongs.

### Exceptions

- `app.css` itself declares the raw values. That is the point of it, and it is
  where the rules do not apply.
- Layout arbitrary values in a `className` (`max-w-[42ch]`, `w-[40%]`) stay
  legal. `ConfigScreen` already uses one correctly.
- Nothing else. No disable comments. If a rule and a real need collide, the rule
  changes here and in `docs/coding-standards.md`, per that file's own closing
  section.

## Build plan

Ordered by the project's Skateboard approach, the thinnest usable whole first,
then grown. The token layer is the skateboard: once it exists, every later step
has something real to build against.

1. The token layer in `app/app.css`: the two corrected colours, the six type
   role custom properties and their `type-*` utilities, `--radius`,
   `--border-hairline`, `--duration-quick` and `--ease-standard`, every existing
   literal in the file replaced by its token, and the four component classes
   pointed at the role values rather than their own font sizes. The role
   properties are deliberately not in the `--text-*` namespace, so Tailwind does
   not auto generate a second `text-<role>` utility that would sit outside the
   closed set. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**.
2. `scripts/check-contrast.mjs` and its wiring into `npm run verify`, proven by
   temporarily reverting `--color-ink-soft` to `#8a8478` and watching it fail
   with the right ratio, not only by watching it pass. Satisfies **AC-1**.
3. The component treatments: all six states on `.btn-accent` and `.btn-quiet`,
   including `position: relative` and the `::after` sweep that carries the busy
   state, and every new transition added to the existing
   `prefers-reduced-motion` block. Then the three existing call sites
   (`AuthControl`, `SignInPrompt`, `SessionBanner`) move from `disabled={busy}`
   to `aria-busy` plus `aria-disabled`, each with its handler guarded so a busy
   control cannot fire twice. Satisfies **AC-5**, **AC-6**, **AC-7**, **AC-11**.
4. Retrofit the existing screens onto the system: `root.tsx`, `BootScreen`,
   `SignInPrompt`, `SessionBanner`, `AuthControl`, `AuthNotice`,
   `ConfigScreen`, `home`, `projects`. Every stock size, weight and tracking
   utility becomes a `type-*` role, and every off ladder step moves onto the
   ladder. The cases that are a judgment call rather than a mechanical swap are
   decided here so the build does not have to decide them:

   - `SignInPrompt`'s `<h1>` is `text-lg` (1.125rem), which matches no role. It
     becomes `type-heading`, the same size as the wordmark, rather than being
     promoted to `type-title`. It is a prompt, not a page title.
   - The two `text-ink-soft` paragraphs (`SignInPrompt`, `projects`) are full
     sentences, so both become `type-body text-ink-soft`. `type-meta` is for
     short labels and is wrong for prose, uppercase or not.
   - `SignInPrompt`'s `mt-5` becomes `mt-6`. `ConfigScreen`'s `ps-5` becomes
     `ps-4`. These are the only two off ladder values in the tree today.
   - `.btn-accent` and `.btn-quiet` gain `position: relative` in step 3, so no
     JSX changes are needed here for the busy sweep.

   Satisfies **AC-3**, **AC-4**, **AC-8**.

5. The ESLint rules, added only now that the tree is already clean, then proven
   against planted violations of each kind rather than only against a clean
   tree: a hex, an arbitrary colour, a stock colour family, a stock text size, a
   `font-*` weight, a `tracking-*`, a `rounded-*`, and an off ladder spacing
   step. Satisfies **AC-3**, **AC-4**, **AC-8**.
6. The documents: the design system rules into `docs/coding-standards.md` under
   Enforced and Judgment, the corrected hex values into `scope.md`'s feature 4
   prose, and dark mode written into `scope.md`'s "Not doing right now".
   Satisfies **AC-2**, **AC-9**, **AC-10**.

## Consequences

**Positive**:

- Two live accessibility failures are fixed, and a script makes the class of
  failure non recurring rather than fixed once.
- A new screen has no open questions about size, spacing, colour or state. That
  matters most in a fresh conversation, which is the working mode this project
  is built around.
- The busy state exists before the feature that needs it, so feature 6 inherits
  a decided treatment instead of inventing one.
- `meta` gives the app a genuine typographic voice drawn from its own subject
  matter, architectural annotation, rather than from a generic secondary text
  style.

**Negative / tradeoffs**:

- The accent changes from the `#B5551F` written in `scope.md` to `#a94d19`. That
  is a real, if small, change to a decided look, and it forces a correction to
  `scope.md`. Keeping the original would mean forbidding clay text on the ivory
  surface, which the built `SessionBanner` already does.
- `scripts/` comes back. Feature 2 deliberately deleted it in favour of ESLint,
  and this reopens it for one file. The justification is narrow: the check is
  arithmetic over CSS values and no lint rule can do it. It is worth watching
  that the directory does not become a home for things ESLint could have caught.
- Six type roles plus a nine step ladder is a real constraint on a five screen
  app, and there will be a moment where a screen wants a seventh size. The
  answer is to change the set here, not to reach off system, and that costs a
  round trip.
- The retrofit touches nine files that currently work, for no user visible gain
  beyond the contrast fix. The gain is that the lint rules can be turned on at
  all.

**Neutral**:

- Dark mode is now an explicitly declined option rather than an unexamined gap.
- `prettier-plugin-tailwindcss` sorts the `type-*` utilities as custom classes.
  Corrected during the build: it places them **after** stock utilities, not ahead
  of them, so a retrofitted line reads `mt-3 type-body text-ink`. The prediction
  here was backwards. It is still stable and automatic, and the diff on step 4
  did show reordering alongside the real change, which is what actually
  mattered.
- The `@utility` directive is Tailwind v4 only. This project is on v4, so it is
  available, but it is worth knowing the roles are not portable back to v3.

## Follow-up

- [ ] The `frontend-design` skill is installed and materially shaped this
      decision, but is not referenced in any context file. It is project wide,
      so it belongs in root `CLAUDE.md` once feature 4 is built, alongside the
      existing instruction to invoke it.
- [ ] `type-display` and `type-meta` are the two roles with no consumer in the
      retrofit, since nothing on screen today is a hero line or an annotation.
      They are specified from the design rather than from existing markup, so
      treat their values as provisional until features 5 and 7 use them.
- [ ] The colour of the busy hairline under a `.btn-accent` sitting on the ivory
      banner is clay at 55% opacity, which is decorative rather than text and so
      is not covered by the contrast script. If a busy control ever ends up
      being the only indication that work is happening, that opacity needs a
      3:1 check of its own.
- [ ] `type-display` has no consumer until feature 5 builds the hero. Confirm
      2.5rem still reads correctly there against a real photographic image
      rather than against an empty page, and adjust here if not.
- [ ] Feature 8's comparison slider is the second interactive element allowed
      the accent. Check when it is built that it fits the six state matrix, or
      extend the matrix here rather than in that feature.

## Rationale

Reasoning, the options weighed, and the contrast measurements that drove the two
colour corrections: see [rationale.md](rationale.md).
