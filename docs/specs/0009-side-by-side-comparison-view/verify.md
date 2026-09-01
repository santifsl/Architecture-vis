# 0009 verify: the side by side comparison view

Hand walkthrough, per `CLAUDE.md`: a real dev server and a real browser. No test
runner, no browser automation.

Each step names the acceptance criterion it proves. Run the command and code
shape steps first. They are cheap, and two of them catch mistakes that would make
every runtime step below look fine while being wrong.

## Before you start

- [ ] `npm run dev` boots to the home screen rather than `ConfigScreen`.
- [ ] You are signed in and have **four** projects to hand: one with a complete
      render, one mid render, one failed or stalled, and one whose floor plan is
      clearly **portrait** rather than square. The portrait one is the only way to
      see the contain decision actually working.

## Commands and code shape

- [ ] `npm run verify` passes clean: typecheck, lint, format, contrast, build.
- [ ] `grep -rn "defaultValue" app/` returns nothing. The v4 prop is
      `defaultPosition`; `defaultValue` would be silently ignored and the divider
      would sit wherever the library defaults, which happens to also be 50, so
      this cannot be caught by looking at the screen, **AC-12**.
- [ ] `grep -rn "ReactCompareSliderImage\|styleFitContainer" app/` returns
      nothing. Both bake in inline styles that the contained plan cannot override,
      **AC-12**, **AC-3**.
- [ ] `grep -rn "updateProject\|createProject\|putProject\|claim\|startRender\|useGenerate" app/compare/`
      returns nothing. The comparison is read only and never touches the render
      loop, **AC-11**.
- [ ] `grep -rn "style={{" app/compare/` returns nothing, and
      `grep -rn "#\|rgb(\|rounded-\|text-sm\|text-lg" app/compare/` finds no raw
      value in any `className`. Every value lives in `app/app.css`, **AC-7**.
- [ ] `grep -rn "transition" app/compare/` shows no `transition` prop passed to
      `ReactCompareSlider`, **AC-9**.
- [ ] `grep -rn "keyboardIncrement" app/` returns nothing. The 5% default is
      inherited, not restated, **AC-8**.
- [ ] `planPlacement` is in `app/render/rules.ts` beside `isWorkingView`, not in
      `app/compare/`, takes `readonly RenderView[]`, and returns one of `"busy"`,
      `"comparison"` or `"key"`. Read it against the table in the spec's State
      transitions section. It is pure, and this is the only practical way to
      check the two model case without manufacturing a two model project,
      **AC-1**, **AC-5**.
- [ ] `ProjectSheet` has **one** sheet wide plan decision, not two. The old
      `working` boolean is gone rather than sitting beside the new function; two
      of them is exactly how a blurred plan and a large plan end up on screen
      together, **AC-5**.
- [ ] The comparison's mount gate reads `=== "complete" && render.path !== null`.
      `complete` alone does not narrow `RenderState.path`, which is why
      `RenderPlate` already writes both halves, **AC-1**.
- [ ] `grep -rn "lazy\|IntersectionObserver\|loading=\"lazy\"" app/compare/`
      returns nothing. The single mint in AC-4 holds only while the comparison
      mounts in the same React commit as the plate, **AC-4**.

## The comparison itself

- [ ] Open the project with a complete render. The plate is there, unchanged,
      with the render filling its square. Directly beneath it: an `h2` reading
      `Before and after`, then a second square the same width, split down the
      middle, plan on the left and render on the right, **AC-1**, **AC-2**.
- [ ] Under the frame, `FLOOR PLAN` on the left and `RENDER` on the right, in the
      uppercase annotation role, matching the plate's own label row. Nothing is
      drawn on top of either image, **AC-6**.
- [ ] Drag the divider all the way left and all the way right. It follows the
      pointer with no lag and no easing, and it stops at each edge without the
      frame moving, **AC-2**, **AC-9**.
- [ ] Reload the page with the network throttled to slow 3G. The comparison
      square is reserved at full size before either image arrives, and nothing on
      the page jumps when they land, **AC-3**.

## The shapes

- [ ] Open the project with the **portrait** floor plan. Push the divider fully
      to the render side, then fully to the plan side. The whole drawing is
      visible with ivory either side of it, no part of it cropped away, **AC-3**.
- [ ] In the same project, the render side still fills the square edge to edge,
      identical to the plate above it, **AC-3**.

## The states

- [ ] Open the project mid render. The plate shows the blurred plan under the
      scrim, there is no comparison section, and there is no small plan key,
      **AC-1**, **AC-5**.
- [ ] Open the failed or stalled project. No comparison section, and the small
      floor plan key **is** on screen with the failure sentence and its retry,
      **AC-1**, **AC-5**.
- [ ] Back on the complete project, the small plan key is **not** on screen. The
      plan appears exactly once, inside the comparison, **AC-5**.
- [ ] The two model case, by hand rather than in a browser: read `planPlacement`
      against a views array of `["running", "complete"]`. It must return `"busy"`,
      meaning the blurred plan only and **no** comparison anywhere on the sheet.
      Returning `"comparison"`, or deciding the three places separately, puts a
      blurred plan and a large plan on screen at once. There is one model today
      so this cannot be walked, which is exactly why the rule is pure, **AC-5**.

## The handle

- [ ] The divider is a clay hairline running the full height of the frame, with a
      small grip at the middle in the same thin stroke as the upload card's room
      mark. No white circle, no drop shadow, no chevrons, **AC-7**.
- [ ] Tab through the page. The handle root takes focus and **the grip** picks up
      a clay indicator, clearly visible against both the drawing and the render.
      It is deliberately not the app's offset outline ring: the library sets
      `outline: 0` inline on that root and accepts no class from us, so an
      outline there is unreachable. If you find yourself trying to make the
      outline work, stop and read AC-8, **AC-8**.
- [ ] In the elements inspector, confirm the rule doing the work is
      `[data-rcs="handle-root"]:focus-visible .compare-grip` in `app/app.css`,
      with no `!important` anywhere, **AC-8**.
- [ ] With the handle focused, press right arrow five times. The divider moves
      about a quarter of the frame, roughly 5% per press. Left arrow returns it,
      **AC-8**.
- [ ] With the handle focused, read the element in the accessibility inspector:
      `role="slider"` with `aria-valuenow` updating as you press, plus
      `aria-valuemin`, `aria-valuemax` and `aria-orientation`, none of them
      overridden by us, **AC-8**.
- [ ] Turn on reduce motion at the system level and drag again. Nothing changes,
      because nothing here animates, **AC-9**.

## The duplication, and its cost

- [ ] Open the network panel, clear it, and load the complete project fresh.
      Count the calls that mint view URLs: **one per file path**, not one per
      `<img>`. Two for the render means the promise cache in `app/storage/urls.ts`
      has regressed and this feature just doubled the page's Puter calls,
      **AC-4**.
- [ ] Throttle the network hard enough that a view URL fails, then reload. The
      comparison section is absent entirely, and there is exactly **one** failure
      sentence with **one** `Try showing it again` on the page, not two, **AC-10**.

## Access

- [ ] Sign out on the project page. The sign in prompt replaces the sheet and no
      part of the comparison renders, **AC-11**.

## The record

- [ ] `npm run build` output noted: record what `react-compare-slider` adds to
      the bundle, per the spec's Follow-up. It is the first runtime dependency
      here that is not React or the router.
