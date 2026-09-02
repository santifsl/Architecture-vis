# 0009 rationale: the side by side comparison view

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: this feature puts the render on the project sheet twice, which
> contradicts the rule `ProjectSheet` was built around. That page hides the small
> floor plan key for exactly the period the plate shows the blurred plan, on the
> stated grounds that the drawing must never be on screen twice at once, and
> `isWorkingView` exists as one shared fact so the two halves cannot drift. The
> same argument applies to the render. It was raised, and the engineer chose the
> duplication with the cost understood, after the one thing that would have made
> it expensive was ruled out: the promise cache in `app/storage/urls.ts` shares a
> single mint per path, so a second `<img>` on the same file costs one image
> decode and zero Puter calls. What remains is editorial, a taller page and the
> same picture twice, and that was judged an acceptable price for a page that
> reads "here is your render, and here is it against your drawing" in that order.
> The rule is not abandoned for the plan: AC-5 extends it so the plan is on
> screen exactly once in every state.

Roomify's only real claim is that the render's walls follow the uploaded
drawing. Until now nothing on any screen lets a person check that claim. The
project page shows the render large and the plan as a small key beside it, at
two different sizes and in two different places, which is enough to identify the
drawing and not nearly enough to compare against it. Feature 7 hit the same
question in the gallery and deliberately did not answer it: a card shows the
render big with the plan as a chip, and the scope row says in as many words that
the actual side by side belongs here.

Three things constrain the answer. First, spec 0004 closed the design system:
six colours, six type roles, a nine step spacing ladder, and ESLint rules that
fail the commit on a raw colour, an off ladder space or a stock type size inside
a `className`. A third party control that ships its own look is therefore not a
drop in, and the usual escape hatch, a few arbitrary Tailwind classes, is
blocked by the linter on purpose. Second, spec 0007 left the render square with
no ratio requested from the worker, while an uploaded floor plan is whatever
shape someone drew, so any frame holding both has to decide what to do about
that mismatch, and cropping the drawing defeats the point of the comparison.
Third, the accent is rationed: clay appears only on things you operate. A slider
divider qualifies, and scope.md's feature 8 already reserved this as the one
place besides buttons and links where it may appear.

Not deciding leaves the product without the screen that justifies it. A person
looks at a render, cannot tell whether it matches their plan, and has no way to
find out inside the app.

## Options considered

### Option 1: the slider replaces the plate, starting at 100% render

One frame, exactly where the plate is today, whose content when complete is a
slider positioned fully to the render side. On arrival the render fills the frame
and looks identical to today; the handle rests at the edge and pulling it left
wipes the plan in. A caption underneath says so.

**Pros**:

- The render appears exactly once, so the sheet's existing rule holds unbroken
  for both images.
- No new page furniture at all, and no extra height on a phone.
- The reserved square already exists, so there is nothing new to keep from
  shifting.

**Cons**:

- Discoverability rests entirely on someone noticing a hairline at the edge of a
  picture and a line of `type-meta` beneath it. Plenty of people will never drag
  it.
- The comparison is not visible as a comparison, which makes it hard to point at
  when showing the product to someone.

### Option 2: an unchanged plate, with a comparison section beneath it

The plate stays exactly as built and verified. Below it, a second square of the
same size holds the slider at the halfway point, with its own heading and label
row.

**Pros**:

- The comparison announces itself. Nothing has to be discovered.
- The plate is untouched, so nothing already verified in features 6, 7 and the
  0007 revision is put back at risk.
- Reads in the natural order: the render, then the render against the drawing.

**Cons**:

- The render is on screen twice, against the sheet's own rule.
- The page gets meaningfully taller, and on a phone the comparison sits below the
  fold.

### Option 3: its own route, `/project/:id/compare`

A dedicated full width comparison page reached from the project page.

**Pros**:

- The most room for the drawing, which is the thing hardest to read small.
- Keeps the project sheet exactly as it is.

**Cons**:

- A second route, a second `clientLoader`, a second failure path and a
  navigation, for what is arguably the point of the project page.
- Splits one project across two URLs for no gain a larger square would not
  already give.

### Option 4: a modal or lightbox over the page

Click the render, get a large overlay holding the slider.

**Pros**:

- Large without costing page height.
- Familiar interaction.

**Cons**:

- Introduces a focus trap, an escape path and a scroll lock, none of which exist
  anywhere in this app yet, so it adds an accessibility surface larger than the
  feature itself.
- Still requires the person to discover that the render is clickable.

## Rationale

Option 2 was chosen by the engineer over Option 1, which was the recommendation.
The deciding force is discoverability against the constraint that this palette is
deliberately quiet. In a near monochrome design where the only saturated things
on screen are the two images themselves, a hairline handle resting at the edge of
a picture is very close to invisible, and Option 1 asks that hairline to carry
the entire feature. Option 2 spends page height to make the comparison a thing
you can see rather than a thing you can find. The tradeoff was made with the real
cost on the table rather than the assumed one: the "duplicate fetch" objection
turned out not to exist, because `app/storage/urls.ts` caches the in flight
promise per path precisely so that several callers wanting the same uncached path
in the same tick share one mint.

Options 3 and 4 both answer a question nobody asked, which is how to get the
comparison bigger. Neither the plate nor the comparison is small; they are the
width of a `max-w-4xl` sheet. Both would add a whole new mechanism, a route or a
focus trap, to solve a size problem that does not exist yet.

Inside the chosen shape, the remaining calls follow from constraints already on
record. The plan is contained rather than cropped because the walls at the edge
of a drawing are exactly the walls being judged, and a cover crop on a portrait
plan hides them; the render still covers, so it matches the plate directly above
it. The handle is our own node rather than the library's, because the library
draws its default with inline styles and inline styles beat classes: recolouring
through `--rcs-handle-color` and `buttonStyle` would leave the shape a circle
with chevrons and a drop shadow, which is the exact generic look feature 4 spent
a whole section cutting, and it would put style objects in TSX where `app/app.css`
is supposed to hold every value. Replacing the visual handle costs nothing in
accessibility, because `role="slider"`, the aria values and the arrow keys all
live on the handle root that `ReactCompareSlider` renders around it. Plain `<img>`
elements are used instead of `ReactCompareSliderImage` for the same
inline styles reason: that component bakes in `object-fit: cover` inline, which
the contained plan could not override from a class.

Two things in the brief turned out to be wrong about the installed package, and
both are recorded as acceptance criteria so they cannot quietly come back. The
tutorial's `defaultValue={50}` is the v2 and v3 prop name; v4, which is what is
in `package.json`, calls it `defaultPosition`, and the old name would be
silently ignored rather than erroring. And the expectation that the handle would
need explicit overrides was right, but for a different reason than assumed: it is
not that a token override is hard, it is that CSS cannot reach the default handle
at all.

## Supporting evidence

Read from the installed package at
`node_modules/react-compare-slider/` at version 4.0.0, on 2026-09-01:

- `dist/types-W8QOPAhr.d.mts` names the props: `defaultPosition`, `disabled`,
  `portrait`, `transition`, `boundsPadding`, `changePositionOnHover`, `clip`,
  `handle`, `itemOne`, `itemTwo`, `keyboardIncrement` (default `'5%'`),
  `onlyHandleDraggable`, `onPositionChange`. There is no `defaultValue`.
- `dist/consts-c6F_VVWH.d.mts` declares `ReactCompareSliderCssVars`, including
  `--rcs-handle-color`, described as the colour of the handle border and arrows.
- `dist/provider-CAZsCNkf.d.mts` shows `HandleProps` as `buttonStyle` and
  `linesStyle`, both `CSSProperties`, which is what makes the default handle
  inline styled and therefore unreachable from a class.
- `dist/index.d.mts` exports `styleFitContainer`, which `ReactCompareSliderImage`
  applies, and which is why that component's fit cannot be overridden by a class.
- The compiled root in `dist/root-DkZVJzK1.mjs` contains `aria-valuenow`,
  `aria-valuemin`, `aria-valuemax`, `aria-orientation`, `aria-disabled`,
  `tabIndex: 0` and a default `aria-label` reading "Click and drag or focus and
  use arrow keys to change the position of the slider".
- The same handle root component sets `outline: 0` **inline and
  unconditionally**, in the same style object as `position: absolute`,
  `width: 100%`, `height: 100%` and `pointerEvents: none`. It is not applied on
  a focus condition, it is simply always there.
- `dist/index.mjs` shows `ReactCompareSlider` spreading its remaining props
  (`...S`, which carries `className`) onto the **root** element only. The handle
  root receives a single prop, `children`. So a class reaches the outer frame and
  nothing of ours reaches the handle root; its `data-rcs="handle-root"`
  attribute is the only selector into it.
- The item wrapper sets no explicit height, but the root is a CSS grid whose
  size is definite through `aspect-ratio`, and grid's default `align-items:
stretch` fills it. A plain `<img>` at `height: 100%; width: 100%` therefore
  fills the square, which is what makes `ReactCompareSliderImage` unnecessary.

### What the cross check found

An independent read of the draft, verified afterwards against the compiled
package and the app's own code, corrected three things and closed two gaps.

- The focus ring risk was misdiagnosed in the first draft as `:where()`'s zero
  specificity. It is the inline `outline: 0` above, which no stylesheet rule can
  win, on a root that is also the full size of the frame so a ring on it would
  not even mark the right thing. AC-8 now puts the indicator on our own grip
  through `[data-rcs="handle-root"]:focus-visible .compare-grip`.
- The first draft's "the plan is on screen exactly once" was false for two
  models: one complete and one running gives a large plan in a comparison and a
  blurred plan behind a scrim at the same time, because three components were
  each testing their own condition. AC-5 is now one sheet level
  `planPlacement`, resolved in order, which is the same argument that produced
  `isWorkingView`.
- `RenderState.path` is `string | null` and `complete` does not narrow it, so
  the mount gate carries the same double condition `RenderPlate` already writes.
- The one mint claim is true, and now the spec says why: `readStoredUrl` writes
  its cache entry synchronously before its first `await`, so the two images
  share a promise only while they mount in the same commit. That precondition is
  written into AC-4 as a ban on lazy mounting.
- `.plate-frame` on the slider root does survive. `className` is spread onto the
  root, and the inline styles shadow only `position`, `overflow` and `display`,
  with values compatible with what the class wants.

## References

**Project sources** (verifiable, in this repo):

- `scope.md` feature 8, which reserved this as the one non button use of the
  accent and confirmed the square top down render made it easier, not harder.
- `scope.md` feature 4, the palette, the accent rule and the structural
  reference that cut the generic decoration.
- Spec 0004, the closed token system, the six type roles and the six state
  matrix, plus `eslint.config.js`'s `DESIGN_SYSTEM_RULES` which enforce it.
- Spec 0006 and `app/render/rules.ts`, for `RenderView`, `plateView`,
  `isWorkingView` and `RENDER_ASPECT_RATIO`.
- Spec 0007, for the square render, the single model, and the busy plan layers.
- Spec 0008, for the precedent that a shared rule moves to the module it is keyed
  by rather than the module that happens to need it second, and for the read only
  no writes discipline this feature repeats.
- `app/storage/AGENTS.md` and `app/storage/urls.ts`, for the promise cache that
  makes the duplicated render free in Puter calls.
- `CLAUDE.md`, for the `frontend-design` requirement, the no test runner rule,
  and the rule that shared values live in `app/app.css` rather than as repeated
  Tailwind classes.
- `node_modules/react-compare-slider/` v4.0.0 type definitions and compiled
  output, as listed under Supporting evidence.

**Practices and standards**:

- WCAG's focus visible requirement, already answered app wide by the single
  `:focus-visible` ring in `app/app.css`; the only new question is whether a zero
  specificity `:where()` rule survives a third party component's own styles.
- The ARIA slider pattern, supplied here by the library rather than written by
  us.
- Progressive disclosure as the reason a comparison starts at the halfway point:
  the section has to read as a comparison before it is touched.
