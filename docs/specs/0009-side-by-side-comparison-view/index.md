# 0009. The side by side comparison view

**Date**: 2026-09-01
**Status**: In Progress

## Summary

The project page gets a before and after. Under the render plate, once a render
has finished, a second square holds your floor plan and your render with a
draggable divider between them: pull it left and right to check that the walls
really did follow your drawing. It adds no data, no writes and no worker calls,
and it is the one place besides buttons and links where the accent colour is
allowed to appear, because the divider is something you operate. The render is
deliberately on the sheet twice, once as the plate above and once inside the
comparison, and that costs nothing but page height: the URL cache in
`app/storage/` already shares one mint per file path.

## Requirements

**User stories**:

- As someone who just got a render back, I want to slide between my drawing and
  the render so I can judge whether the walls actually follow the plan, which is
  the only claim this product makes.
- As someone showing the result to a client, I want the comparison to be the
  obvious thing on the page rather than something I have to hunt for.
- As someone using a keyboard, I want to move the divider with arrow keys and see
  where the focus is.

**Acceptance criteria**:

- **AC-1**: On `/project/:id`, a comparison section appears directly beneath a
  render's plate when, and only when, that render's `plateView` is `complete`,
  its `render.path` is not `null`, and **no** render anywhere on the sheet is
  working. There is one comparison per qualifying render, so the
  `project.models` seam spec 0007 left open survives. The `path` check is the
  same double guard `RenderPlate` already applies, because `RenderState.path`
  is typed `string | null` and `complete` does not narrow it.
- **AC-2**: The comparison shows the floor plan on the left and the render on the
  right, split by a divider that starts at the halfway point. Pointer down and
  drag anywhere inside the frame moves the divider, and it tracks the pointer
  with no easing.
- **AC-3**: The comparison frame is the same square as the plate, `.plate-frame`
  and its `aspect-ratio: 1 / 1`, reserved from first paint so a slow mint never
  shifts the page. Inside it the render is `object-fit: cover` and fills the
  square exactly as it does in the plate; the floor plan is `object-fit:
contain` on the ivory surface, so the whole drawing is always visible and is
  never cropped.
- **AC-4**: The plate above is unchanged in every state. The render is therefore
  on the sheet twice when complete, and that is deliberate. Both `<img>` elements
  read the same path through `useStoredUrl`, so exactly one view URL is minted
  per path and no extra Puter call is made. This holds because `readStoredUrl`
  writes its cache entry synchronously before its first `await`, so two callers
  whose effects flush in the same commit share one promise. The comparison must
  therefore mount in the same commit as the plate: **no lazy mounting on scroll,
  no intersection observer**, or the two copies become two mints.
- **AC-5**: The floor plan is on screen **exactly once in every state of the
  sheet**, and where it appears is one sheet level decision, not three
  independent ones. In order: if any render on the sheet is working, the plan
  appears only as the blurred plan behind that plate's scrim and no comparison
  renders anywhere; otherwise if any render is complete, the plan appears only
  inside the comparison; otherwise the small floor plan key shows. This is
  `planPlacement(views: readonly RenderView[]): "busy" | "comparison" | "key"`
  in `app/render/rules.ts`, beside `isWorkingView`. Sheet level rather than per
  render, because with two models one working and one complete, three
  independent checks put a blurred plan and a large plan on screen at the same
  time.
- **AC-6**: The section carries an `h2` reading `Before and after` in
  `type-heading`, and a label row under the frame with `Floor plan` on the left
  and `Render` on the right, both `type-meta text-ink-soft`, mirroring the
  plate's own label row. Nothing is drawn over either image, so no scrim and no
  contrast question arises inside the frame.
- **AC-7**: The divider and handle are our own node passed to the `handle` prop,
  never the library's default. A clay hairline the full height of the frame, with
  a small grip at the middle drawn in the same stroke weight as `.plan-mark` and
  `.notice-mark`. No circle, no drop shadow, no chevrons. Every value comes from
  a token declared in `app/app.css`; no inline `style` object and no raw value in
  any `className`, so `eslint.config.js` passes without an exception.
  _Amended 2026-09-02, during feature 11's build, in two steps, and the second
  reverses this criterion rather than narrowing it. First the two ticks were too
  quiet to read as draggable on a busy render, so a shaft and an arrowhead were
  added either side of them. That was still judged too subtle in use, so the
  mark is now the plain icon this criterion refused: a 40px bone disc with a clay
  ring and a clay double arrow across it. **"No circle" no longer holds**, and
  the drawing vernacular is gone from this one element. What still holds is
  everything about the library: this remains our own node, one flat disc in two
  palette colours, with none of `ReactCompareSliderHandle`'s 3.5rem circle,
  backdrop blur or two drop shadows, and no drop shadow of its own. The opaque
  disc also retired `.compare-grip-casing`: the ring and the arrow now sit on
  bone whatever render is underneath, which is what the doubled strokes existed
  to fake. The focus indicator stays on our grip and is now a round ring, the one
  place `--radius` does not draw the corner._
- **AC-8**: The handle root takes keyboard focus and moves the divider 5% per
  arrow key press, and focusing it puts a visible clay indicator **on our own
  grip**, drawn by `[data-rcs="handle-root"]:focus-visible .compare-grip` in
  `app/app.css`. It is deliberately not the app wide outline ring, and that is
  not a style choice. The library's handle root sets `outline: 0` **inline and
  unconditionally**, which no stylesheet rule can win without `!important`, and
  `ReactCompareSlider` passes only `children` to that root, so no `className` or
  `style` of ours can reach it either; its `data-rcs` attribute is the only
  selector there is. On top of that the root is `width: 100%; height: 100%` of
  the frame, so a ring on it would draw a rectangle the size of the whole square
  rather than mark the grip. Styling our own child element instead wins cleanly,
  needs no `!important`, and puts the indicator where the person is looking. The
  indicator uses `--ring-width` and `--color-clay`, so it reads as the same
  system treatment. The `role="slider"`, `aria-valuenow`, `aria-valuemin`,
  `aria-valuemax`, `aria-orientation` and `aria-label` on that root are left
  alone and not overridden.
- **AC-9**: No `transition` prop is passed, so the divider never animates and
  nothing new needs switching off under `prefers-reduced-motion`.
- **AC-10**: Exactly one `Try showing it again` exists per failed file, and
  every failed file has one. If the RENDER's view URL fails, the comparison
  section is not rendered at all: the plate above already carries the sentence
  and the button for that same file, and `useStoredUrl` retries by path, so the
  plate's button brings this section back with it. If the PLAN's view URL fails,
  the comparison carries the sentence and the button itself, because the sheet
  only mounts a comparison when `planPlacement` returns `"comparison"`, which is
  precisely when `FloorPlanKey` is off the page and no other surface offers the
  plan a retry.

  Revised during review. The original read "if a view URL for EITHER the plan or
  the render is missing or failed, the comparison section is not rendered at
  all", and justified it with "the plate above already carries one sentence and
  one `Try showing it again` for that same file". That justification is true of
  the render and false of the plan: the plate shows the plan only while it is
  working, and the key that owns the plan's retry is hidden for the whole of the
  `"comparison"` placement. Followed literally, a failed plan mint removed the
  comparison and left no way back short of a reload. The rule the AC was reaching
  for was one button per file, not no button in the section, so it now says
  that.

- **AC-11**: The feature adds no persisted state. No write goes through
  `app/projects/store.ts`, no render is claimed or started, and no worker route
  is called. `app/render/` stays the only place a render is claimed.
- **AC-12**: The installed `react-compare-slider` is v4, where the starting
  position prop is `defaultPosition`. `defaultValue`, the v2 and v3 name the
  tutorial uses, is not present anywhere in the code. `ReactCompareSliderImage`
  is not used; both items are plain `<img>` elements carrying our own classes.
- **AC-13**: Both images carry real alt text naming the project, not empty
  strings. The plan is not decorative here, unlike the blurred plan behind the
  busy scrim.

## Decision

**Chosen option**: Option 2: a separate comparison section under an unchanged
plate.

The project sheet keeps its plate exactly as it is, and gains a second square of
the same size directly underneath it, holding a `react-compare-slider` at the
halfway point, with a handle and frame built entirely from spec 0004's tokens.

**Implementation skills**: `frontend-design` (`anthropics`, plugin skill) ·
`react-router-framework-mode` (`remix-run/agent-skills`,
`.agents/skills/react-router-framework-mode/`)

`frontend-design` is a hard gate here, not a suggestion: `CLAUDE.md` requires it
to actually fire before any UI is written, and this feature's whole risk is a
control that looks bought rather than designed. `react-router-framework-mode` is
listed only because the project page is a route module; this feature adds no
route, no loader and no action, so it should have nothing to say.

## Feature design

**Data model sketch**:

No schema change. Nothing is written, nothing is added to the project record, and
no new key is stored. The feature reads three values that already exist:

| Value                    | Where it already lives                         | Shape                                      |
| ------------------------ | ---------------------------------------------- | ------------------------------------------ |
| `project.floorPlan.path` | the project record, spec 0002 schema 2         | absolute Puter path, required              |
| `renders[model].path`    | the project record, written by the render loop | absolute Puter path, `null` until complete |
| `project.name`           | the project record                             | string, required, used for alt text        |

**State transitions**:

No state machine of its own. Where the plan appears is one sheet level decision
over every render's `plateView`, resolved in order, so exactly one of the three
places ever holds it:

```
planPlacement(views)
  any view is pending or running  → "busy"        plate shows the blurred plan
                                                  NO comparison renders at all
  else any view is complete       → "comparison"  the comparison holds the plan
                                                  key hidden
  else                            → "key"         failed or stalled only
```

Then per render, given `planPlacement(views) === "comparison"`:

```
plateView(render, blocked) === "complete" && render.path !== null
  → that render gets a comparison beneath its plate
  → otherwise nothing beneath it
```

The `render.path !== null` half is not belt and braces. `RenderState.path` is
typed `string | null` and `complete` does not narrow it, which is why
`RenderPlate` already writes the same double condition before rendering its
image.

**API surface**:

None. There is no endpoint, no worker route and no store call. The whole surface
is two component props:

| Component          | Props                                                           | Returns                                | Auth                                      | Key failure                                                                                                   |
| ------------------ | --------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `RenderComparison` | `planPath: string`, `renderPath: string`, `projectName: string` | the section, or `null`                 | inherited from `RequireUser` on the route | render URL failed, returns `null`; plan URL failed, returns the section carrying the plan's own retry (AC-10) |
| `CompareHandle`    | none                                                            | the divider node for the `handle` prop | n/a                                       | n/a                                                                                                           |

`renderPath` is `string`, never `string | null`. `ProjectSheet` narrows it at the
call site, so the component never has to ask, and a `null` path cannot reach a
slider that would then have nothing to show on one side.

**Value sourcing**:

| Action                                      | Value produced or displayed                                         | Source                                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decide where the plan appears at all        | `planPlacement(views)`                                              | new pure function in `app/render/rules.ts`, taking `readonly RenderView[]`; `ProjectSheet` maps `project.models` through `plateView(render, blocked[model] !== undefined)` first, exactly as its current `working` check does |
| Decide whether one render gets a comparison | `plateView(render, blocked) === "complete" && render.path !== null` | `plateView` from `app/render/rules.ts`, spec 0006; the null check from `RenderState.path`'s own type                                                                                                                          |
| Show the floor plan                         | image URL                                                           | `useStoredUrl(project.floorPlan.path)`, the shared promise cache in `app/storage/urls.ts`                                                                                                                                     |
| Show the render                             | image URL                                                           | `useStoredUrl(render.path)`, same cache, same mint as the plate above                                                                                                                                                         |
| Place the divider on arrival                | `50`                                                                | `COMPARE_START_POSITION` in `app/compare/rules.ts`, passed as `defaultPosition`                                                                                                                                               |
| Move the divider by keyboard                | 5% per press                                                        | the library default; `keyboardIncrement` is deliberately not passed, so no value is asserted twice                                                                                                                            |
| The two side labels                         | `Floor plan`, `Render`                                              | `COMPARE_LABELS` in `app/compare/rules.ts`, alongside the words themselves rather than inline in the markup                                                                                                                   |
| Alt text for both images                    | project name                                                        | `project.name`, passed down as `projectName`                                                                                                                                                                                  |
| Handle and divider colour                   | `var(--color-clay)`                                                 | `app/app.css`, spec 0004's single accent                                                                                                                                                                                      |
| Mark the focused handle                     | the grip's focus treatment                                          | `[data-rcs="handle-root"]:focus-visible .compare-grip` in `app/app.css`, using `--ring-width` and `--color-clay`; the `data-rcs` attribute is the library's own and the only selector that reaches that root                  |

**Key invariants**:

- The floor plan is on screen exactly once in every state of the sheet, decided
  in one place by `planPlacement` rather than by three components each testing
  their own condition. Three independent checks is exactly how a working render
  and a complete one end up showing a blurred plan and a large plan side by side
  (AC-5).
- The render may be on screen twice, and when it is, both copies read one minted
  URL. Two mints for one path in one tick would mean the promise cache in
  `app/storage/urls.ts` had regressed, or that the comparison stopped mounting
  in the same commit as the plate (AC-4).
- Nothing in `app/compare/` writes. A `grep` for `updateProject`, `claim` or
  `startRender` under `app/compare/` returns nothing (AC-11).
- The comparison never renders with one image missing. Both URLs, or no section
  (AC-10).
- No raw colour, size, weight or radius appears in a `className` or an inline
  `style` in `app/compare/`. Every value is a token in `app/app.css` (AC-7).

**Security model**:

Unchanged from the project page. The route already sits inside `RequireUser`, the
files are private Puter files reached through short lived view URLs that are
never persisted, and this feature adds no new read path: it asks
`useStoredUrl` for two paths the same page already asks for. No regulated data,
no compliance scope. When feature 9 makes a project public, the same component
takes two paths and no ownership, so it can be reused unchanged.

**Configuration required**:

None. No new environment variable, no credential, no worker constant.

**Critical test scenarios**:

- Happy path: open a project whose render is complete, see the render plate, and
  under it a square split down the middle with the drawing on the left and the
  render on the right; drag the divider both ways and both images stay put
  inside a frame that does not move, verifies **AC-1**, **AC-2**, **AC-3**.
- Shape case: a tall portrait plan and a wide landscape plan both show whole,
  letterboxed on ivory, while the render still fills the square, verifies
  **AC-3**.
- Failure case: a render that failed or stalled shows no comparison and does show
  the small plan key, and a project mid render shows neither, verifies **AC-1**,
  **AC-5**.
- Mint failure, twice, because the two files behave differently. With the RENDER
  URL failing, the comparison is absent and exactly one sentence with one retry
  is on screen, not two, and pressing it brings the comparison back as well as
  the plate's image. With the PLAN URL failing, the comparison is still on the
  sheet carrying its own sentence and its own retry, and that button is the only
  one for the plan. Verifies **AC-10**.
- Keyboard: tab reaches the handle, the clay focus ring is visible against bone,
  and each arrow press moves the divider one twentieth of the frame, verifies
  **AC-8**.
- Duplication cost: with the network panel open, loading a complete project makes
  one `getReadURL` call per file path, not two, verifies **AC-4**.
- Auth: signed out, the route still shows the sign in prompt and no part of this
  section renders, verifies **AC-11**.

## Build plan

End to end thread first, then thicken, the project default. The thread here is
worth insisting on: a crude slider actually on the page under a real render
answers the two questions that could sink the design, whether `.plate-frame`
survives the library's own inline styles on its root, and whether a plain `<img>`
fills the item wrapper. Both are cheap to find out and expensive to discover
after the styling is written.

1. The thread: `app/compare/RenderComparison.tsx` with `ReactCompareSlider`,
   `defaultPosition` from `COMPARE_START_POSITION`, two plain `<img>`, mounted
   directly (never lazily) from `ProjectSheet`'s existing `models.map` so it sits
   under its own plate, gated on `plateView(...) === "complete" && render.path
!== null`. Library defaults for everything else. Walk it in a browser before
   going further, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-12**
2. The frame and the two fits: `.plate-frame` on the slider root, and
   `.compare-image`, `.compare-plan` and `.compare-render` in `app/app.css`, with
   the plan contained on ivory and the render covering. Confirm here that the
   class based `aspect-ratio` and border are not lost to the library's inline
   styles; if they are, wrap the slider in a `.plate-frame` div rather than
   fighting specificity, satisfies **AC-3**, **AC-13**
3. The handle: `app/compare/CompareHandle.tsx` plus `.compare-divider` and
   `.compare-grip` in `app/app.css`, passed to the `handle` prop. This is the
   step `frontend-design` must actually have fired for, satisfies **AC-7**
4. The heading and the label row, in the plate's own idiom, satisfies **AC-6**
5. The one plan rule: `planPlacement(views: readonly RenderView[])` in
   `app/render/rules.ts` beside `isWorkingView`, and `ProjectSheet` switched onto
   it for all three places at once, so the key, the busy plan and the comparison
   are decided together rather than each testing its own condition. `ProjectSheet`
   maps `project.models` through `plateView(render, blocked[model] !== undefined)`
   first, exactly as its current `working` check does, and its existing `working`
   boolean is replaced rather than joined by a second one. Pure, so it is
   checkable against the State transitions table by hand rather than by
   manufacturing a two model project, satisfies **AC-5**
6. The guards: the both URLs or nothing early return, and a read through of
   `app/compare/` confirming it writes nothing and starts nothing, satisfies
   **AC-10**, **AC-11**
7. The keyboard, focus and motion pass. Do **not** expect the app wide outline
   ring to land here and do not spend time making it: the library's handle root
   carries `outline: 0` inline, unconditionally, and takes no `className` or
   `style` from us, so no outline rule can reach it without `!important`. Write
   `[data-rcs="handle-root"]:focus-visible .compare-grip` in `app/app.css`
   instead, marking our own grip in `--color-clay` at `--ring-width`. Confirm
   arrow keys move the divider and no `transition` prop is passed, satisfies
   **AC-8**, **AC-9**
8. `npm run verify` clean, then the hand walkthrough in
   [verify.md](verify.md)

## Consequences

**Positive**:

- The product's actual claim, that the walls follow your drawing, becomes
  checkable on screen instead of being something a person has to hold in their
  head while looking at two pictures.
- The accent gets its first genuinely interactive non button use, which is what
  scope.md's feature 8 already reserved for it.
- No new data, no new backend call, no new failure mode in the render loop. The
  second feature in a row that adds no write path.
- The component takes two paths and a name and owns nothing, so feature 9's
  public project view can reuse it without a rewrite, and feature 10's export can
  sit beside it without touching it.

**Negative and tradeoffs**:

- The render is on the project sheet twice. That breaks the rule the sheet's own
  key and plate were built to hold, consciously and with the cost understood: the
  page gets taller, and someone scrolling fast sees the same picture twice. It
  was chosen over a single frame that starts at 100% because the sequence
  "render, then comparison" is worth more than the rule.
- `react-compare-slider` is the first runtime dependency in the browser bundle
  that is not React or the router. Its size is unmeasured; check the build
  output.
- The library draws its default handle **and its handle root** with inline
  styles, so any future attempt to restyle either from CSS will silently lose.
  The custom `handle` node avoids that for the visual, and the focus treatment
  moves onto our own grip for the same reason. The reason needs to stay written
  down or someone will spend an afternoon on an outline rule that cannot win.
- This app now has one interactive element whose focus indicator is not the
  shared outline ring. It is built from the same two tokens so it reads as the
  same treatment, but it is a genuine exception to spec 0004's "one treatment for
  every interactive element", forced by a third party's inline styles rather than
  chosen.
- A third square on a page that already has one plate means more vertical
  scrolling on a phone, and the comparison is the part below the fold.

**Neutral**:

- `ProjectSheet`, in `app/render/`, imports a component from `app/compare/`.
  That is a page composer reaching for a presentational component, which is a
  different thing from the dependency spec 0008 refused: there the problem was a
  shared **rule** living in the wrong module, so `STATE_WORDS` moved into
  `app/render/`. The two new predicates here follow that same precedent and live
  in `app/render/rules.ts` beside `isWorkingView`, not in `app/compare/`.
- The library supplies `role="slider"` and its aria values, so the accessibility
  baseline here is inherited rather than written. That is a dependency on
  someone else's markup for an accessibility promise, which is worth knowing
  even though it is currently correct, and the focus indicator has already had to
  work around that same markup once.
- `planPlacement` replaces `ProjectSheet`'s current sheet wide `working`
  boolean rather than sitting beside it. One decision, not two that can disagree,
  which is the same argument that put `isWorkingView` there in the first place.
- No route, no loader, no action changes, so nothing about the static SPA build
  or `vercel.json` is touched.

## Follow-up

- [ ] Invoke Anthropic's `frontend-design` plugin before build task 3, per
      `CLAUDE.md`. If it does not fire on its own, say so and invoke it
      directly. The handle is exactly the kind of element that defaults to the
      generic look.
- [ ] `/sync` should write `app/compare/AGENTS.md` and its sibling `CLAUDE.md`,
      and add the pointer line to the root `CLAUDE.md` context file list, once
      this is built.
- [ ] Measure `react-compare-slider`'s contribution to the bundle from the real
      `npm run build` output and record it, since it is the first dependency of
      its kind here.
- [ ] Feature 9's public project view should reuse `RenderComparison` rather than
      building a second one. Note it in that feature's row when it is enrolled.

## Rationale

Reasoning, the options weighed, and the references: see [rationale.md](rationale.md).
