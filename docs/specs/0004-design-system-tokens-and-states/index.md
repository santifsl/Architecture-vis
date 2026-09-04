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

## Amendments

Six changes made after this spec was accepted, across three polish passes rather
than inside a feature, at the engineer's direction. They are recorded here rather
than left in a conversation, because a later reader would otherwise take any of
them for drift.

Amendments 3 and 4 came from the second pass and 5 and 6 from the third. Two of
them undo earlier ones, so read them in order or read the summary here:

- Amendment 3 REVERSES this spec's accent rule rather than extending it, and
  amendment 6 then rewrites the rule amendment 3 introduced.
- Amendment 4 replaces amendment 1's drawing and placement while keeping its
  argument for why a drawing belongs here at all, and amendment 5 replaces
  amendment 4's darkness, extent and count.

For what is actually on screen today, read 5 and 6. Read 1 and 3 for the
arguments that still stand underneath them.

### 1. The hero band carries a line drawing

> **Superseded in part by amendment 4.** The decision that a drawing belongs on
> this screen, and the argument that it is not the grid pattern `scope.md`
> feature 4 refused, both stand and are still made here. The drawing itself, its
> placement, its opacity and its fade were all replaced. Nothing in the
> "Placement", "A static drawing" or "The fade is a mask" paragraphs below is
> what is on screen today.

**A new decision, not a parked one resumed.** This was raised as the parked item
from `scope.md`'s `## Not doing right now` list, style and scope supposedly left
open for a later `/architect` pass. That item is not on that list and never was;
the list was read end to end before this was written. What the plan actually
says about a decorated home screen is the opposite, and it says it twice:
`scope.md` feature 4's structural reference cut "a decorative grid-pattern
background" from behind the upload card, and this spec's `### Replaces` made the
whole look flat. So the change has to earn its place against a rule that already
said no once, rather than inherit permission from a queue entry that does not
exist.

It earns it by not being the thing that was refused. Feature 4 cut a generic SaaS
grid from behind the one element a person is asked to drop a file onto, because a
patterned ground makes a target harder to read. What goes in instead is a sparse
architectural line drawing behind the whole hero band, and it never appears
behind that card at all: `.plan-card` is opaque `--color-bone` and carries the
app's one shadow, so it occludes whatever is under it. The drawing is the
product's own subject rather than a texture, set in the palette's existing
hairline tone, and the surface feature 4 protected stays exactly as protected as
it was.

**Placement: the hero band only.** The drawing spans the full viewport width
behind the headline, the subhead and the upload card, and fades to nothing before
the `Recent projects` strip. The strip, the gallery, the project sheet, the
community feed and every other route are untouched and stay on clean bone. Two
reasons for stopping there rather than running it behind the whole route: the
strip below holds real render thumbnails, which are the only saturated things on
the screen by design, and a drawing under them competes with the one thing the
palette exists to frame; and a background that stops is a decision a reader can
see, while one that runs everywhere becomes a page texture, which is what was
refused.

**Contrast, and the one rule that makes it safe.** The drawing's darkest possible
ground is `--color-ivory`. That is not an estimate, it is how the layer is built,
and it is why no new token and no new check are needed: this spec already
requires every text colour to clear 4.5:1 against ivory, and `npm run verify`
already measures it on every run (`ink` 14.48:1, `ink-soft` 4.64:1, `clay`
4.69:1).

Two details hold that ceiling up, and neither is optional:

- **The strokes are `--color-hairline` at full strength; the opacity lives on the
  layer.** `--color-hairline` at 50% over `--color-bone` composites to `#efebe4`,
  which is `--color-ivory` to within a rounding step. Painted at full strength
  instead, the same linework puts `ink-soft` at 4.11:1 and `clay` at 4.16:1, both
  under the minimum, so the reduction is load bearing rather than a taste call.
- **Group opacity, never per stroke opacity.** Two strokes each drawn at 50%
  composite to 75% where they cross, which is darker than ivory and lands
  `ink-soft` back under 4.5:1, and an architectural drawing is nothing but
  crossing lines. Opacity on the `<svg>` element flattens the drawing first and
  composites the result once, so an intersection costs exactly what a single line
  costs. Anyone moving the opacity onto the strokes to "simplify" it reintroduces
  the defect invisibly.

**A static drawing, hand authored, inlined as JSX.** `app/home/HeroBackdrop.tsx`
holds the geometry as an inline `<svg>`, not a file under `public/`, for the
reason spec 0010 gave when it turned the AV mark into a mask: an asset brings its
own colour, and this one has to take `--color-hairline` from `@theme` so retuning
the palette retunes the drawing. It is written out once and never changes: no
randomness, no generation, no animation, no canvas, nothing that runs per frame.
"Drawn in code" here means only that JSX is the file format. It is
`aria-hidden="true"`, `focusable="false"` and `pointer-events: none`, so it is
invisible to the keyboard, to a screen reader and to the pointer alike.

What it draws, sparsely, with the empty space as the point: double line wall runs
with a door swing arc, one dimension line with extension lines and angled ticks,
and a stepped wireframe elevation with floor lines. No text, no numbers, no
furniture, and nothing that could be mistaken for a real plan somebody uploaded.

**The fade is a mask, not a gradient.** The band ends in a
`mask-image: linear-gradient(...)` that takes the drawing to nothing above the
strip. This does not loosen the flat rule and does not touch the ESLint rule that
fails `bg-gradient` in a `className`: a mask paints no colour, it only decides
how much of a layer survives, the rule matches class strings and this lives in
`app/app.css`, and nothing on screen has a gradient in it. The alternative was a
hard horizontal edge where the drawing stops, which reads as an unintended
border. Recorded here so the `mask-image` is not later read as the flat rule
slipping.

**Where the values come from**, extending `### Where each value comes from`:

| Treatment                      | Value              | Source                                                                  |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------- |
| The sketch stroke colour       | `--color-hairline` | the palette, unchanged                                                  |
| The sketch layer opacity       | `0.5`              | this amendment; the measured point where the ground is ivory            |
| The sketch's worst case ground | `--color-ivory`    | this spec's own surface guarantee, already measured by `npm run verify` |

### 2. Both bordered buttons grow a little under the pointer

**First, the half that needed no change.** This was raised as two asks, and the
first one turned out to be already true. `Sign in with Puter` and `Sign out` do
stay in the clay family on hover, and always have: `.btn-accent` and
`.btn-outline` share one hover rule that fills the control with `--color-clay`
and sets the label to `--color-bone`. `.btn-outline` differs from `.btn-accent`
at rest only, in which colour its border and label take, and every other state it
has is the accent button's, which is what spec 0010 wrote and what `app/app.css`
does today. Nothing is owed there, and nothing changed.

**The half that is genuinely new.** Nothing in this app scales on hover. This
adds that, as a second property on the hover row of `### The six interactive
states` rather than as a seventh state: there are still six states, and hover now
carries a size as well as a colour.

| State | Treatment, amended                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| hover | `.btn-accent` and `.btn-outline` fill clay with bone text **and take `scale: 1.02`**; `.btn-quiet` turns clay and underlines |

**It applies to both bordered classes, everywhere, and not to `.btn-quiet`.**
That exclusion is a rule with a reason, not an omission. `.btn-quiet` has no box:
it is text with padding, no border and no background, it appears inline beside
prose and inside failure sentences, and scaling a run of text against a flat page
softens the glyphs and nudges the line around it. So the rule a later reader
applies to a new control class is one sentence, "a bordered button grows, a text
button does not", rather than a list of buttons somebody has to keep current. The
alternative considered and rejected was scoping it to the two navigation buttons,
which would have left `Download` and every other bordered button in the app
answering the pointer differently from the navbar, and opened this spec's closed
matrix to per button exceptions.

The rest of it:

- **`scale: 1.02`**, on `--duration-quick` and `--ease-standard`, the same motion
  tokens every other transition in the file already uses. On a control of this
  height that is under a pixel of growth at each edge, which reads as the button
  answering rather than as the button moving.
- **The CSS `scale` property, not `transform: scale()`.** They do the same thing
  here, but `transform` is a single slot: a later rule wanting to nudge or rotate
  a button would silently drop the scale, and two rules quietly clobbering each
  other is the failure this avoids.
- **Active drops back to `1`.** The press already suppresses the transition; it
  also returns the control to full size, so pressing pushes the button down
  rather than leaving it reading as a larger hover.
- **Disabled and busy are excluded**, by the same `:not([disabled],
[aria-disabled="true"], [aria-busy="true"])` guard the hover colour already
  carries. A control that cannot act must not answer the pointer as though it
  can, and that already applied to the colour.
- **Reduced motion switches it off, rather than just un-animating it.** The
  existing `prefers-reduced-motion: reduce` block sets `transition: none` on the
  three classes, which would leave the size change happening instantly instead of
  not happening. An instant jump in size is precisely what that query is for, so
  the block also pins hover `scale` to `1`. The colour change stays: reduce is
  about motion, not about a control going quiet.
- **Nothing reflows.** `scale` paints outside the layout box, so the username
  beside `Sign out` and the state word beside `Download` do not move when a
  neighbour is hovered.

| Treatment             | Value             | Source         |
| --------------------- | ----------------- | -------------- |
| The hover scale       | `1.02`            | this amendment |
| Its duration and ease | the motion tokens | this spec      |

### 3. The accent is spent at rest, not held back for hover

> **The rule stated here was replaced by amendment 6.** Everything about
> mechanism (the two filled classes, the hover deepening, the busy fill
> recession, the focus-ring reasoning, the `CONTROL_FILLS` bucket) is unchanged
> and is documented here. Only the question of WHICH control gets which class
> moved.

A deliberate reversal of this spec, not a drift from it, and worth saying so
plainly: `### The six interactive states` held clay back until you reached for a
control, so at rest a screen showed you outlines and told you which one mattered
only once your pointer was already on it. The rule now is the opposite. The one
action a screen is asking you to take carries the accent from the moment the
screen loads, and everything else is quieter than it.

That costs something real, and the cost is the reason the old rule existed:
`scope.md` feature 4 chose the near monochrome palette so the uploaded floor plan
and the render would be the only saturated things on screen. A filled clay button
is now a third. It is a small one, it never sits inside a plate or a card, and it
is spent once per screen, but it is a genuine dent in that sentence rather than a
free change.

**The split, which is a rule and not a list of buttons.** Two new classes, one
deleted, one narrowed:

| Class          | At rest                      | What it is for                                         |
| -------------- | ---------------------------- | ------------------------------------------------------ |
| `.btn-primary` | filled clay, bone label      | the affirmative action: sign in, download, make public |
| `.btn-neutral` | filled warm grey, bone label | the undo direction: sign out, make private             |
| `.btn-accent`  | outlined clay, clay label    | the upload card's two controls, and nothing else       |
| `.btn-quiet`   | text, ink                    | an inline action inside prose, unchanged               |

`.btn-outline` is **deleted**. Spec 0010 introduced it for the sign out button,
and sign out is exactly the control that becomes `.btn-neutral` here, so after
the three call sites moved it had none left. Removing it is why the set is four
classes rather than five: this amendment adds a direction to the system, it does
not add a layer to it.

**Why grey and not black.** The neutral fill is `--color-ink-soft`. Measured, the
grey is L\* 44.3 and clay is L\* 44.0, so a primary and a neutral standing side by
side carry the same visual weight and differ only in hue, which leaves the accent
doing the whole job of saying which one the screen is pointing at. A near black
fill measures L\* 9.8 and would have made signing out the heaviest object in the
navbar, with the affirmative button beside it looking like the afterthought.

**Why the upload card keeps its outlines.** `.btn-accent` survives for
`Choose a floor plan` and `Generate the render`, which look exactly as they did.
That is an exception taken on purpose: the card already carries the app's one
shadow and its one clay wash, both named exceptions in spec 0010, and filling its
buttons as well would make the quietest screen in the app the loudest. It does
leave `Generate the render` reading as no more affirmative than the button that
replaces the file, which is the price and is recorded in Follow-up.

**A control at full colour needs a different hover, and here it is.** Inverting is
not available to a button that is already filled, so the two filled variants
deepen instead: one step along their own hue toward ink, mixed from the palette
at the point of use so retuning clay or ink-soft retunes the hover with it, and
no seventh colour enters `@theme`. The scale from amendment 2 carries the rest.

| Variant        | Rest      | Hover and active                           | Shift  | Bone label    |
| -------------- | --------- | ------------------------------------------ | ------ | ------------- |
| `.btn-primary` | `#a94d19` | `color-mix(clay 85%, ink)` → `#944619`     | 5 L\*  | 5.26 → 6.29:1 |
| `.btn-neutral` | `#6e685e` | `color-mix(ink-soft 70%, ink)` → `#555149` | 10 L\* | 5.20 → 7.44:1 |

Neither hover needs a measurement of its own, and that is an argument rather than
an oversight: both mixes move toward ink, so a bone label on either can only
measure better than it does at rest. If rest clears, hover clears.

**Busy is where a filled button actually breaks, and it is the one state worth
reading twice.** State 6 drops a control's label to clay at 55%. On a filled
control that is unreadable by construction: the label and its ground would be the
same colour at different alphas. So for the filled variants the recession moves
from the label to the FILL. The button fades to 55% of its own colour over bone
and the label comes back up to `--color-ink`. That is still scope.md's rule, the
accent quietly receding at 55% rather than a second hue appearing, applied to the
layer that actually carries the colour.

Both resulting grounds are precomputed as `@theme` tokens and measured on every
run, exactly as spec 0007's `--color-scrim-ground` is:

| Token                         | Value     | Is                        | `--color-ink` on it |
| ----------------------------- | --------- | ------------------------- | ------------------- |
| `--color-clay-busy-ground`    | `#cd9a7c` | clay at 55% over bone     | 6.97:1              |
| `--color-neutral-busy-ground` | `#ada9a2` | ink-soft at 55% over bone | 7.35:1              |

**Focus visible does not change, and that was checked rather than assumed.** A
clay ring around a clay button sounds like the same mark twice. It is not:
`--ring-offset` puts two pixels of the page between the control and its ring, so
the ring is measured against `--color-bone` at 5.26:1 exactly as it is for every
other control. The same offset is why neither fill needs measuring as a ring
background: a ring never touches one. So this spec's "one treatment for every
interactive element, never replaced per component" survives intact.

**The contrast script gained a bucket, and it had to.** Until now `bone` was only
ever a surface and never a text colour, so the script's "everything that is not a
surface is text" rule covered the whole app. A bone label on clay is the exact
pairing that model could not express, and it would have been skipped in silence.
`CONTROL_FILLS` maps each rest fill to the inks painted on it, and
`npm run contrast` now measures 16 pairs rather than 9.

### 4. Two building studies in the margins, replacing the hero sketch

> **Superseded in part by amendment 5.** The drawings, the recreate-do-not-trace
> argument, the crossing invariant and the "heavier is free, darker is not" rule
> all stand and are made here. The single flat opacity, the hairline stroke
> colour, the hero-only extent, the count of two, and the `TEXT_ONLY_SURFACES`
> exemption were all replaced.

A full rework of amendment 1 rather than a tweak to it. What that amendment
decided about _whether_ a drawing belongs on this screen stands, along with its
argument for why this is not the grid pattern `scope.md` feature 4 refused. What
it decided about the drawing and where it goes is replaced.

**Two drawings, not one, standing in the margins.** `TowerSketch` on the left and
`LatticeSketch` on the right, each running the full height of the hero band, from
the top of the hero down to where the projects strip begins. They frame the
content column rather than sitting behind it. Below `64rem` the layer is hidden
outright: there is no margin left to stand in at that width, and a building
elevation at six rem wide is a smudge rather than a drawing.

**Recreated, not traced.** Both are hand built SVG recreations of the references
in `assets/`: `image_6f1a843.jpg`, a pencil study of the Burj Khalifa, and
`Screenshot 2026-09-03 at 2.50.29 p.m..png`, one of 30 St Mary Axe. Recreating
rather than shipping the files is not extra work for its own sake. A raster
brings its own greys and its own paper tone into a palette that is closed, it
cannot take `--color-hairline`, and both references get their depth from graphite
shading, which is the one thing this system may not have. Spec 0010 made the same
call for the same reason when the AV mark arrived as a PNG.

What is taken from them: confident varied weight linework, converging
construction guides, and the specific thing that makes each building itself. For
the tower that is the setbacks stepping at DIFFERENT heights on each side,
because the real plan is a three winged spiral and no two wings stop at the same
floor; a first attempt with matched steps read as a wedding cake. For the lattice
it is the diagrid, computed rather than typed, since every line is a helix
wrapping a solid of revolution and its screen position is
`cx + rx(u) * cos(phase ± turns * u)`.

What is deliberately not taken: their shading, tone and depth fill. No fills, no
gradients, no washes, per this spec's flat rule. Three line weights do the work
shading did.

**The contrast rule, restated and now enforced rather than asserted.** The ceiling
is that every stroke inside the layer is fully opaque and the LAYER carries the
only transparency. That is what makes crossings free: opaque over opaque is
idempotent, so a hundred crossing lines composite to exactly what one line
composites to. Put the opacity on the strokes and two 55% lines make 80% where
they cross, which is most of a diagrid.

The layer sits at 0.55, and `--color-hairline` at 55% over `--color-bone` is
declared as `--color-sketch-ground` (`#edeae2`) and measured on every run:
`ink` 14.32:1, `ink-soft` 4.59:1, `clay` 4.64:1. Amendment 1 asserted its
equivalent in a comment; this one fails the build if it stops being true.

The token is listed in `TEXT_ONLY_SURFACES` rather than `SURFACES`, and the
reason differs slightly from `scrim-ground`'s: everything focusable inside the
hero band sits on `.plan-card`, which is opaque bone, so no control is ever
painted on the drawing and the ring minimum cannot apply. **If a link or button
is ever added to the hero outside that card, move the token into `SURFACES` and
recompute rather than keeping the exemption.**

**Heavier is free; darker is not.** The brief for this rework asked for heavier,
more legible linework. Line WIDTH does not change what a pixel of that line
composites to, so a 2.25px stroke is exactly as safe behind text as a hairline
one, and weight and density are where all of the extra presence comes from. Going
darker is the one thing the ceiling forbids: at full strength the same linework
puts `ink-soft` at 4.11:1 and fails.

**One bug found by building it, worth recording because it was invisible.**
Colour and weight are set on the container and inherited, never on the shapes.
`stroke` and `stroke-width` are inherited SVG properties, and a weight class is
often put on a `<g>` wrapping several shapes. Setting `stroke-width` in the shape
rule instead makes it win over the value inherited from that `<g>`, so every
grouped weight silently does nothing and the drawing renders flat. That shipped
in the first draft of these files. `vector-effect` has to stay on the shape rule
for the opposite reason: it is not inherited, so setting it on the root `<svg>`
would reach nothing.

**The fade is gone.** Amendment 1 masked its band out with a
`linear-gradient`. These drawings stand on a ground line at the bottom of the
band and are cropped at the top, which is how an elevation is cropped anyway, so
the mask has no work left to do and is deleted along with the argument that
justified it.

### 5. One drawing layer, two darknesses, and a pair per page length

Amendment 4's drawings were correct and nearly invisible. This fixes that, and
the fix is worth reading because the obvious version of it does not work.

**The behind-text zone was already at its ceiling, and could not be darkened.**
The constraint is on the composited GROUND, not on the ink used to reach it, so
no change of stroke colour buys anything where text sits. Amendment 4 ran
`--color-hairline` at 55%, which composited to `#edeae2`. The absolute limit,
where `--color-ink-soft` lands exactly on 4.5:1, is `#ece8df`. That is the whole
available headroom: 1.13:1 line contrast against bone versus 1.19:1. Darkening
the drawing uniformly was never on the table.

**So the layer carries two darknesses instead of one.** The drawings sit at 0.75
at the page edges and fade to an effective 0.10 across the content column:

| Zone                      | Effective alpha | Ground                  | Line against bone |
| ------------------------- | --------------- | ----------------------- | ----------------- |
| Page edges, no text       | 0.75            | `#918c84`               | **3.15:1**        |
| Across the content column | 0.10            | `--color-sketch-ground` | 1.13:1            |

That is about two and a half times the presence where it is free to have it, and
unchanged where it is not. The strokes moved from `--color-hairline` to
`--color-ink-soft` to make the dark end possible at all: hairline is the app's
border colour and at any alpha it is barely a line, so there was no headroom to
be dark in. The effective alpha fell from 55% to 10% to land the safe zone on the
same place it was.

**`--color-sketch-ground` is now `#eceae5`**, ink-soft at 10% over bone.
Measured: `ink` 14.32:1, `ink-soft` 4.59:1, `clay` 4.64:1, and `clay` as a focus
ring 4.64:1 against a 3:1 minimum.

**The two zones are one mask, not two layers.** A `linear-gradient` mask on the
layer, full strength at the edges and `--sketch-safe` across the middle. Its
stops are measured from the CENTRE rather than as percentages, because what has
to be protected is the content column, which is a fixed 56rem while the layer is
the whole viewport: safe out to 30rem either side, which is the column's 28rem
plus two rem of slack, fading to full by 34rem. Under a 68rem viewport the
negative stops clamp and the layer simply runs everywhere at the safe level,
which is right, because at that width there is no margin for a dark zone to be
in. The crossing invariant is untouched: opacity and mask both apply to the
flattened group, so strokes still composite exactly once.

**`--color-sketch-ground` is a SURFACE now, not a text-only ground.** This is the
part most worth carrying forward. Amendment 4 exempted it from the focus-ring
minimum on the argument that everything focusable in the hero sits on the opaque
upload card. Running the drawings the length of the page put the gallery's card
links and its `See all` link on top of them and killed that argument. The token
moved into `SURFACES`, which measures it against every text token and the ring
minimum, and `npm run contrast` now runs 17 pairs. The general lesson is written
into the script beside the two busy grounds that still hold such an exemption:
the argument is about where a thing is on screen, so it has to be re-made every
time the thing moves.

**The drawings run the whole page.** `.hero-band` is on `<main>` itself rather
than around the hero, so the layer's height is the page's height and the drawings
end where the content ends however long it turns out to be. Every card surface is
opaque (`.plan-card` bone, `.plate-frame` and `.plan-chip` ivory), so the only
thing the drawings ever sit behind is text.

**A pair per page length.** A signed in home screen with a projects strip is
about twice the height of a signed out one, and the two tall studies crop badly
into a short sheet. So there are four drawings in two pairs: `TowerSketch` and
`LatticeSketch` for the long page, `ColonnadeSketch` and `PavilionSketch`, both
squat, for the short one. The portico and the pavilion are deliberately opposed,
load bearing masonry against a slab on thin posts, so the pair reads as two ways
of standing something up rather than one drawing done twice.

Which pair appears is decided ONCE, by `homeStrip` in the home route, because the
same answer decides whether the strip renders at all. Asked separately, the two
would eventually disagree and the page would get the drawings for a length it is
not. This is the same rule spec 0011 applies to the visibility control.

**Each tall sheet gained a plan above its elevation**, and that is not decoration
for its own sake. The sheet is now about twice the height of the building on it,
and something has to occupy the upper half or the top of the page reads as blank.
A plan over an elevation is the oldest arrangement in architectural drawing, it
is the same building explained, and, unlike ruled lines, it is not the decorative
grid `scope.md` feature 4 refused. The tower's is the Y footprint its asymmetric
setbacks come from; the lattice's is a circle whose radials are the diagrid seen
from above, generated from the same `LINES_PER_FAMILY` as the elevation.

### 6. Clay marks the control a surface is for, not the affirmative direction

Amendment 3 split the two filled classes by direction: affirmative actions clay,
undo-direction actions grey. That rule did not survive being looked at. `Sign
out` is the undo direction and it is also the only thing the navbar is for, and
painting it grey while `Download` two hundred pixels below it was clay said the
wrong thing about both.

**The rule now:** `.btn-primary` is the control a surface exists to offer, and
`.btn-neutral` is a real button that is not it. That is much closer to this
spec's original accent rule, "clay marks the one thing on a screen you are being
pointed at", with the single change amendment 3 actually cared about: it is spent
at rest rather than held back for hover.

Applied, that moves two controls and leaves the rest:

| Control              | Was            | Now            | Because                                            |
| -------------------- | -------------- | -------------- | -------------------------------------------------- |
| `Sign in with Puter` | `.btn-primary` | `.btn-primary` | the navbar exists to get you in and out            |
| `Sign out`           | `.btn-neutral` | `.btn-primary` | same control, same job, other direction            |
| `Download`           | `.btn-primary` | `.btn-primary` | the file is what the project page is for           |
| `Make public`        | `.btn-primary` | `.btn-neutral` | visibility is a setting, not the point of the page |
| `Make private`       | `.btn-neutral` | `.btn-neutral` | unchanged                                          |

The visibility control therefore has no clay in it at all, in either direction,
which is the intended reading: on a project sheet the render is the point and who
can see it is a property of it.

One consequence worth naming rather than discovering: on a signed in project page
there are now two clay buttons on screen, `Sign out` in the navbar and `Download`
in the sheet. The rule holds because they belong to different surfaces, the app's
chrome and the page's content, and the navbar's is always the same single control
in one of its two states. If a second clay control ever appears within one page's
content, that is the rule breaking rather than bending.

Nothing else moves. `.btn-accent` still belongs to the upload card alone, and
`.btn-quiet` is untouched.

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
- [ ] From amendment 3: the upload card keeps `.btn-accent` for both of its
      controls, so once a plan is hosted `Generate the render` and
      `Replace floor plan` are still the same treatment, and the card gives no
      hint which of committing and undoing is the one it wants. That was chosen
      deliberately, to keep the quietest screen in the app quiet, but it is the
      one place the new direction rule is not applied. Worth looking at again on
      a real screen with a real plan in the card.

## Rationale

Reasoning, the options weighed, and the contrast measurements that drove the two
colour corrections: see [rationale.md](rationale.md).
