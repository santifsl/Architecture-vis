# 0007. One model, one direct call, and the top down render

**Date**: 2026-08-31
**Status**: In Progress

Supersedes parts of [0006](../0006-create-a-project-and-render/index.md): AC-2,
AC-3, AC-5, AC-6 and AC-7, the two stage render, the Model parity rule, and the
`PAINTER` constant. Supersedes `ModelId` as spec
[0002](../0002-project-records-and-public-feed-index/index.md) defined it.
Everything else in both specs still stands.

The decision history (the problem, the options weighed, the reasoning, and the
sources) lives beside this file in [`rationale.md`](rationale.md). The hand
walkthrough that proves the acceptance criteria lives in [`verify.md`](verify.md).

## Summary

Roomify renders with Gemini and nothing else. Claude is dropped as a model
option, so the model picker goes away and Generate is the only control on the
upload card. The render also stops being made in two stages: instead of one
model writing a description of the space and a second model painting it, a
single Gemini image model takes the floor plan directly and returns a top down
3D view whose walls, doors and windows follow the drawing. And while that is
happening the page shows your own floor plan blurred behind a pale scrim with
`Generating your 3D render` on top of it, rather than an empty frame.

## Requirements

**User stories**

- As someone with a hosted floor plan, I want one button and no choices, so that
  getting a render is a single decision rather than a form.
- As someone waiting on a render, I want the page to show me my own plan while it
  works, so that the wait feels like something happening to my drawing rather
  than a blank rectangle.
- As someone comparing the render to the plan, I want the render seen from
  straight above with the same walls in the same places, so that I can actually
  hold the two against each other.

**Acceptance criteria**

- **AC-1**: Gemini is the only model. `ModelId` is `"gemini"`, `MODEL_IDS` holds
  one entry, and no screen, no stored record, no instruction sent to a provider,
  and no code comment names Claude as a render option.
- **AC-2**: A render is one provider call. The worker calls one Gemini image
  model once, with the plan as `input_image` and the pinned instruction as the
  prompt. No model writes a scene description first, and no second model paints.
- **AC-3**: The instruction sent is the pinned `RENDER_PROMPT` below, verbatim,
  with nothing appended or interpolated per request.
- **AC-4**: `prompt` is gone from `RenderState`, from `parseRenderState`, from
  the worker's response body, and from the project page. A stored render is a
  status, a path, an error code and its timestamps.
- **AC-5**: While the render is `pending` or `running`, the plate spans the full
  sheet width and holds the uploaded floor plan blurred, behind a bone scrim
  carrying the words `Generating your 3D render`. The small floor plan key is not
  on screen during that period, so the drawing is never shown twice at once. When
  the plan's view URL has not been minted yet, or the mint failed, the scrim and
  the words render over plain ivory with no image behind them. The busy state
  never depends on the image arriving.
- **AC-6**: The overlay words clear 4.5:1 contrast against the scrim for any
  uploaded plan, including a solid black one. Contrast is a property of the
  scrim, never of what somebody uploaded.
- **AC-7**: The clay hairline still sweeps along the bottom edge of the frame
  while the render works, and no spinner appears anywhere. Spec 0004's six states
  are unchanged; the blur and the message are a content treatment layered inside
  state 6, not a replacement for it.
- **AC-8**: The frame reserves a 1:1 square from its first paint, and a render
  arriving shifts nothing else on the page.
- **AC-9**: A `failed` or `stalled` render shows an empty ivory frame, the plain
  sentence, and Retry. The blurred plan and the message are gone, so a stopped
  render never looks like a working one.
- **AC-10**: A `complete` render shows the painted image in the frame, the small
  key returns above it, and there is no scene note anywhere on the page.
- **AC-11**: The upload card has no model picker. There are no toggles, no
  `LAST_MODEL_NOTICE`, and Generate is the only control after a plan is hosted.
- **AC-12**: `SCHEMA_VERSION` is `2`. A record written under version 1 is refused
  by `parseProject` because of its version, and the gallery simply does not list
  it. No crash, no blank screen, no half read record.

## Decision

**Chosen option**: Option 3: one direct image to image call on Gemini, with the
per model record shape kept intact.

Gemini becomes the only model and the only provider call: `puter.ai.txt2img`
against `google:google/gemini-2.5-flash-image`, with the floor plan as
`input_image` and one pinned top down instruction, replacing the read then paint
pair. The record keeps its per model map shape with a union of one, so no
invariant in `invariants.ts` changes structure, and the schema version goes to 2
because `prompt` leaves `RenderState`.

**Implementation skills**: `react-router` (`.agents/skills/react-router/`, plus
the package's own docs at `node_modules/react-router/docs/`, framework mode)

## Feature design

### The model

```js
/** The one model, and the only provider call a render makes. */
const RENDER_MODEL = "google:google/gemini-2.5-flash-image";
```

Chosen off `puter.ai.txt2img`'s real model list, fetched live during this design
(63 image models). It is the only Gemini image id that is all three of: a native
`google:` provider prefix rather than a router such as `togetherai:`, not a
preview, and the nearest generation rather than the newest. That is exactly spec
0006's own model selection rule, applied to the image list instead of the chat
list. The newer Gemini image ids on that list,
`google:google/gemini-3.1-flash-image-preview` and
`google:google/gemini-3-pro-image-preview`, are both previews, so the rule
excludes them and their weights could move under the render.

### The pinned instruction

Used verbatim, per AC-3. It lives in `worker/roomify.js` as `RENDER_PROMPT` and
replaces `SCENE_INSTRUCTION` entirely.

```
TASK: Convert the input 2D floor plan into a **photorealistic, top‑down 3D architectural render**.
STRICT REQUIREMENTS (do not violate):
1) **REMOVE ALL TEXT**: Do not render any letters, numbers, labels, dimensions, or annotations. Floors must be continuous where text used to be.
2) **GEOMETRY MUST MATCH**: Walls, rooms, doors, and windows must follow the exact lines and positions in the plan. Do not shift or resize.
3) **TOP‑DOWN ONLY**: Orthographic top‑down view. No perspective tilt.
4) **CLEAN, REALISTIC OUTPUT**: Crisp edges, balanced lighting, and realistic materials. No sketch/hand‑drawn look.
5) **NO EXTRA CONTENT**: Do not add rooms, furniture, or objects that are not clearly indicated by the plan.
STRUCTURE & DETAILS:
- **Walls**: Extrude precisely from the plan lines. Consistent wall height and thickness.
- **Doors**: Convert door swing arcs into open doors, aligned to the plan.
- **Windows**: Convert thin perimeter lines into realistic glass windows.
FURNITURE & ROOM MAPPING (only where icons/fixtures are clearly shown):
- Bed icon → realistic bed with duvet and pillows.
- Sofa icon → modern sectional or sofa.
- Dining table icon → table with chairs.
- Kitchen icon → counters with sink and stove.
- Bathroom icon → toilet, sink, and tub/shower.
- Office/study icon → desk, chair, and minimal shelving.
- Porch/patio/balcony icon → outdoor seating or simple furniture (keep minimal).
- Utility/laundry icon → washer/dryer and minimal cabinetry.
STYLE & LIGHTING:
- Lighting: bright, neutral daylight. High clarity and balanced contrast.
- Materials: realistic wood/tile floors, clean walls, subtle shadows.
- Finish: professional architectural visualization; no text, no watermarks, no logos.
```

The non ASCII characters in it (the typographic hyphens in `top‑down` and the
arrows in the mapping list) are part of the pasted text and are kept as they are.
The file is UTF-8 and the string is a template literal, so nothing needs escaping.

### Data model

Schema version 2. Only two things change; the shape is otherwise exactly what
spec 0002 and spec 0006 left.

| Entity         | Field                  | Change                                 | Note                                                                                                                                                    |
| -------------- | ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record.ts`    | `SCHEMA_VERSION`       | `1` to `2`                             | A version 1 record is refused on read, by version, per AC-12                                                                                            |
| `record.ts`    | `MODEL_IDS`            | `["claude", "gemini"]` to `["gemini"]` | `ModelId` becomes a union of one                                                                                                                        |
| `RenderState`  | `prompt`               | removed                                | Nothing writes it once the reading stage is gone                                                                                                        |
| `Project`      | `models`, `renders`    | unchanged shape                        | Still an array plus a map, now always one entry                                                                                                         |
| `PublicAssets` | `renderUrls`           | unchanged shape                        | Feature 9 builds against the shape it already has                                                                                                       |
| `FeedEntry`    | `models`, `renderUrls` | unchanged shape                        | Same reason                                                                                                                                             |
| `FeedEntry`    | `schemaVersion`        | is `2`                                 | It is typed `SchemaVersion`, so it follows the bump. Nothing reads it today, feature 9 is unbuilt, but the worker that writes feed entries must stamp 2 |

`invariants.ts` changes in exactly two places, and neither is structural:
`parseRenderState` stops narrowing `prompt`, and the comments that explain the
rules stop describing two models. `checkRendersMatchModels`, `checkRenderStates`
and `checkPublicAssets` keep working unaltered, because a one member union is
still a legal input to every one of them.

### State transitions

Unchanged from spec 0006. `pending` to `running` to `complete` or `failed`,
`complete` or `failed` back to `pending` on a retry, a status staying put is
always legal. The ten minute stale rule and the 120 second client timeout are
unchanged.

### Worker surface

| Endpoint  | Method | Key inputs                                                                       | Key outputs | Auth                    | Key errors                                                                                                                                         |
| --------- | ------ | -------------------------------------------------------------------------------- | ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/render` | POST   | `plan` (abs path, req), `out` (abs path, req), `model` (req, must be `"gemini"`) | `{ path }`  | Puter session, else 401 | 400 `badRequest`, 403 `badRequest` on a path outside the guard, 404/502 `planUnreadable`, 502 `paintFailed` / `paintRefused`, 507 `outOfAllowance` |

The response loses `prompt` and returns `{ path }` alone. The `model` field stays
in the request body even though there is one legal value: it keeps the guard that
refuses a body this worker does not understand, and it is the seam a second model
would come back through.

`describeScene`, `SCENE_INSTRUCTION`, `PROMPT_MAX_LENGTH` and `PAINTER` are all
deleted. `readPlanAsDataUri`, `checkPaths`, `mimeTypeFor`, `describeFailure` and
`isMissingFile` are all kept exactly as they are: the base64 and mime handling is
already correct for `input_image` and needs nothing.

`VISION_MODELS` is **renamed rather than deleted**, to `RENDER_MODELS`, and keeps
its one entry:

```js
const RENDER_MODEL = "google:google/gemini-2.5-flash-image";
const RENDER_MODELS = { gemini: RENDER_MODEL };
```

The guard at the top of `/render` then stays literally as it is,
`if (typeof model !== "string" || !(model in RENDER_MODELS)) return
refuse("badRequest", 400);`. Deleting the map and hardcoding `model !== "gemini"`
would say the same thing today and close the seam a second model comes back
through, for no gain.

The single call:

```js
await puter.ai.txt2img({
  prompt: RENDER_PROMPT,
  model: RENDER_MODEL,
  input_image: planUri,
  input_image_mime_type: mimeTypeFor(plan),
  puter_output_path: out,
});
```

`quality` and `ratio` are deliberately **not** passed on the first version.
Whether a Gemini image model honours, ignores, or rejects the options that
`gpt-image-1-mini` accepted is unverified, and an option that gets rejected turns
into a `paintFailed` on every render with nothing in the message saying why. Build
task 2 makes one real call and settles it; if `ratio: { w: 1, h: 1 }` is accepted,
it goes back in as a second commit. Until then the frame's own 1:1 with
`object-fit: cover` absorbs whatever shape comes back.

### Failure vocabulary

`visionFailed` and `visionRefused` are deleted from `WORKER_CODES` and from
`RENDER_MESSAGES`. There is no reading stage left for them to describe, and a
code with no stage behind it is a sentence nobody can ever reach.
`paintFailed` and `paintRefused` carry every provider failure now, and their two
sentences are already written for exactly that. Every other code, on both the
worker side and the client side, is unchanged.

**They come out last, after the worker is deployed, not with the rest of the
client changes.** Between the client shipping and the worker being replaced, the
old two stage worker is still live and can still answer `visionRefused` on a plan
it will not read. A client that has already forgotten the code drops that on
`renderMessage`'s fallback and says "the render service sent back something this
app couldn't read", which is both wrong and less useful than the sentence it
replaced. So the deletion is build task 7, not build task 3.

### The busy state

The plate has three layers inside the existing `.plate-frame`, present only while
the view is `pending` or `running`:

```css
/* The frame. 1:1 now, reserved before there is anything to put in it. */
.plate-frame {
  aspect-ratio: 1 / 1; /* was 16 / 9 */
}

/* Layer 1: the person's own plan, blurred. Scaled past its own soft edges so
   the blur never shows a pale border inside the frame. */
.plate-plan {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  object-fit: cover;
  filter: blur(1.25rem);
  transform: scale(1.12);
}

/* Layer 2: the scrim. This is what makes the words legible, so legibility is a
   property of this layer and never of whatever somebody uploaded. */
.plate-veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background-color: color-mix(in srgb, var(--color-bone) 72%, transparent);
}

/* Layer 3: the words. */
.plate-message {
  color: var(--color-ink);
  text-align: center;
}
```

Layer 4 is the clay hairline sweep, which is the existing
`.plate-frame[data-busy="true"]::after` rule, unchanged and still sitting on top.

**Why 72%.** At 72% bone over the worst possible plan, a solid black one, the
composite ground is `#b4b2b0`, and `--color-ink` (`#1c1b19`) on that measures
**8.13:1**. That is the floor, reached only by a fully black upload; a normal
white floor plan lands far above it. AC-6 is therefore satisfied by construction
rather than by hoping people upload pale drawings, which is the same reasoning
spec 0004 used when it recomputed the two failing tokens.

The cheapest way to keep that true is to make it a token rather than a comment.
Add `--color-scrim-ground: #b4b2b0` to the `@theme` block, the precomputed worst
case ground, so `scripts/check-contrast.mjs` measures every text token against it
on every `npm run verify` and a later change to `--color-ink` or to the scrim's
alpha fails the build instead of quietly failing a person. The token's value and
`.plate-veil`'s percentage are two halves of one fact, so the CSS carries a
comment naming the other half.

**It cannot simply join `SURFACES`.** That script's `pairs()` measures two things
against every surface: each text token at 4.5:1, and `--color-clay` as a focus
ring at 3:1. Clay on this ground measures about 2.64:1, under `RING_MINIMUM`, so
adding `scrim-ground` to `SURFACES` fails the build. That failure would be
meaningless: a focus ring cannot appear over the scrim, because the overlay holds
no interactive element at all. So the script gains a third bucket beside
`SURFACES` and `DECORATIVE`, `TEXT_ONLY_SURFACES`, whose members are measured for
text contrast and skipped by the ring check, and `checkClassification` learns
about it so an unclassified token still fails loudly. If the overlay ever gains a
focusable control, the right move is to move the token into `SURFACES` and
recompute, not to keep the exemption.

**Accessibility.** The blurred plan is decorative and carries `alt=""`, because
it duplicates the key and the words carry the meaning. The overlay message is
`aria-hidden="true"`: the label row already has a `role="status"` paragraph
saying `Working`, and two live regions announcing the same fact at the same
moment is noise. `prefers-reduced-motion` needs no new rule, because the blur is
static and the sweep is already covered by the existing media block.

**The state word.** `STATE_WORDS.running` stays `Working`. Its old justification
in the code comment, that the model is reading first, is gone with the reading
stage, and the comment is rewritten to say the word is simply the honest one.

### Page composition

`ProjectSheet.tsx`:

- The `md:grid-cols-2` grid goes. There is one plate and it spans the sheet.
- `FloorPlanKey` renders only when the render's view is `complete`, `failed` or
  `stalled`. While working, the blurred copy inside the frame is the only place
  the plan appears (AC-5).
- The `One model / Two models · Private` line becomes `Private` alone. Counting
  models is not information when there is one.
- The closing paragraph, currently about two models reading one plan, is replaced
  by one quiet line in the same `type-body text-ink-soft` role: `Gemini rendered
this directly from your floor plan.`

`RenderPlate.tsx`:

- `SceneNote` and its expand button are deleted, along with `.plate-note` and
  `.plate-note[data-expanded]` in `app.css`.
- `MODEL_NAMES` keeps its one entry, so the label row still reads `Gemini`.
- The plate needs the plan's path to blur, which it does not currently receive.
  `RenderPlate` takes a new `planPath: string` prop, and `ProjectSheet` passes
  `project.floorPlan.path`.

`useGenerate.ts` and `PlanUploadCard.tsx`:

- `models`, `isPicked`, `toggle` and `LAST_MODEL_NOTICE` are deleted from the
  `Generate` type and the hook. `createProject` is still called with
  `models: MODEL_IDS`, which is now the constant `["gemini"]`.
- The toggle markup, the card's own `MODEL_NAMES`, and the `.model-toggle` block
  in `app.css` are deleted.

### Value sourcing

| Action         | Value produced or displayed | Source                                                                           |
| -------------- | --------------------------- | -------------------------------------------------------------------------------- |
| Create project | `models`                    | `MODEL_IDS`, no longer a picked value                                            |
| Create project | `renders.gemini`            | Built as `pending` by `createProject`, unchanged                                 |
| Start render   | `out` path                  | `renderOutPath(appDataDir, project.id, "gemini")`, unchanged                     |
| Start render   | request `model`             | The literal `"gemini"` from the loop over `project.models`                       |
| Worker         | the instruction             | `RENDER_PROMPT`, pinned in `worker/roomify.js`, never from the request           |
| Worker         | `input_image`               | `readPlanAsDataUri(user.puter, plan)`, unchanged                                 |
| Worker         | response `path`             | The `out` it was given, echoed only after the write succeeded                    |
| Busy overlay   | the blurred image           | `project.floorPlan.path`, minted through `useStoredUrl`, the new `planPath` prop |
| Busy overlay   | the words                   | The literal `Generating your 3D render`                                          |
| Busy overlay   | contrast                    | The `.plate-veil` scrim, not the image                                           |
| Plate          | state word                  | `renderView(render)` into `STATE_WORDS`, unchanged                               |
| Plate          | failure sentence            | `renderMessage(blocked ?? errorCode ?? "stalled")`, unchanged                    |

Two values that used to have a source and now have none, deliberately: the scene
note's text (there is no reading stage) and the picked model list (there is no
picker). Both are removed rather than defaulted.

### Key invariants

- `renders` holds exactly one key per entry in `models`, and no others. Unchanged,
  and still enforced by `checkRendersMatchModels` even though the set has one
  member.
- A `complete` render has a stored `path`. Unchanged.
- Publishing state agrees with itself. Unchanged.
- `parseProject` refuses any record whose `schemaVersion` is not `2`.
- The worker touches nothing outside the caller's own app data directory, reading
  under `plans/` and writing under `renders/`. Unchanged, and still checked before
  any model is called.

### Security model

Unchanged from spec 0006 in every respect. A session is required, the worker
refuses a request carrying none with 401 `signedOut`, path guards run before the
provider call, and no provider text, exception, HTTP status or model name ever
reaches a screen. Nothing here touches regulated data.

### Configuration required

No new environment variables. `VITE_PUTER_WORKER_URL` is unchanged, and the
worker still deploys with the existing `scripts/deploy-worker.mjs`.

### Critical test scenarios

- Happy path: upload a plan, press Generate with no choices to make, watch the
  blurred plan and the message for the duration, and get a square top down render
  whose walls follow the drawing. Verifies **AC-2**, **AC-3**, **AC-5**,
  **AC-8**, **AC-10**, **AC-11**.
- Contrast: run the same render with a near black floor plan and confirm the
  message stays readable. Verifies **AC-6**.
- Failure: force a failure and confirm the frame empties to ivory with the plain
  sentence and Retry, no blurred plan left behind. Verifies **AC-9**.
- Migration: open a project record written before this change and confirm the
  gallery simply omits it rather than breaking. Verifies **AC-12**.
- Reduced motion: with the system setting on, confirm the sweep stops and the
  blur and message stay. Verifies **AC-7**.

## Migration plan

**Strategy**: version gated, deploy the client before the worker.

**Phases**:

1. Ship the client at schema version 2, with build task 1's parser change
   included. Its `parseRenderResponse` reads `path` and ignores any extra key, so
   it works against the worker still deployed. In this window renders are still
   made the old way and still store correctly.
2. Deploy the worker. From here every render is the single Gemini call at the top
   down prompt.
3. Only now delete `visionFailed` and `visionRefused` from `failures.ts`, which is
   build task 7.

**Why that order.** The reverse breaks. A worker deployed first returns `{ path }`
with no `prompt`, and the client still in production requires a non empty
`prompt` before it will accept a response, so every render in that window fails
as `badResponse` even though the image was written.

The chosen order has one imperfect window rather than a broken one. Between phase
1 and phase 2 the old two stage worker is still live, so renders come out in the
old style, and that is expected. The one thing to keep out of that window is
phase 3: a client that has already forgotten `visionRefused` while a worker that
can still emit it is live turns an accurate sentence into the generic fallback.
That is why the code deletion trails the deploy instead of travelling with the
rest of the client changes.

**Rollback**: revert both commits and redeploy the worker. Any record written at
version 2 then becomes unreadable to the reverted client in the same way version
1 records are unreadable to this one, which is the cost of the version bump and
is accepted below.

**Risks**: the model id or the `txt2img` option shape could behave differently
from `gpt-image-1-mini`, which is what build task 2 exists to find out before
anything else is built on top of it.

## Build plan

Tracer bullet per `CLAUDE.md`: the provider call is the riskiest unknown and the
one everything else hangs off, so it goes end to end early, before any of the UI
is made fuller. The order also honours the migration plan above: every client
change that makes a promptless response acceptable lands in task 1, **before** the
worker that produces one is deployed in task 2.

**Progress**, `/develop`, 2026-08-31. All seven tasks are built,
`npm run verify` is green, and the worker is deployed and proven by a real
render: 628x628, top down, walls following the plan. The migration ran in its
designed order, client first, then the worker, then task 7's code deletion.

1. Record, invariants, and the response parser, in one commit: `SCHEMA_VERSION`
   to `2`, `MODEL_IDS` to `["gemini"]`, `prompt` out of `RenderState` **and** out
   of `parseRenderState`, `prompt` out of `RenderProduct` and out of
   `parseRenderResponse`'s requirement, `useProjectRenders` stopping committing
   it, and every comment in `record.ts` and `invariants.ts` that describes two
   models or feature 8's two model premise rewritten. The parser change belongs
   here rather than later precisely so that nothing in the tree requires a
   `prompt` by the time a worker stops sending one. **Built.** Satisfies **AC-1**,
   **AC-4**, **AC-12**.
2. **Built and deployed.** One real render came back 628x628, top down, with
   matching geometry. `ratio` and `quality` are still not sent, so the square is
   the model's own default rather than an honoured option, and the recommendation
   is to leave both off; see `rationale.md`. Worker: delete `SCENE_INSTRUCTION`, `PROMPT_MAX_LENGTH`, `describeScene` and
   `PAINTER`, rename `VISION_MODELS` to `RENDER_MODELS` with its one entry, add
   `RENDER_MODEL` and the pinned `RENDER_PROMPT`, collapse `/render` to the single
   `txt2img` call, return `{ path }`. Deploy and make one real render. That call
   settles three things at once: the model id works through `txt2img`, whether
   `ratio` and `quality` are accepted, and what aspect actually comes back. Record
   the answer in `rationale.md`, the same habit the `/probe` result got. Satisfies
   **AC-2**, **AC-3**.
3. Ratios and the stale prose they leave behind: `RENDER_ASPECT_RATIO` to
   `"1 / 1"` in `app/render/rules.ts`, and the comments that explain it. Two
   docblocks name the deleted `PAINTER` and its 16:9 and contain neither
   `prompt` nor `claude`, so no grep in `verify.md` catches them: the
   `RENDER_ASPECT_RATIO` comment in `rules.ts` and `RenderPlate.tsx`'s own
   header. Both are rewritten here. **Built.** Satisfies **AC-8**.
4. The busy state: `.plate-frame` to `1 / 1`, the three new classes, the
   `--color-scrim-ground` token, and `RenderPlate` rendering the blurred plan plus
   scrim plus message while `pending` or `running`, the scrim over plain ivory
   when the mint has not landed or failed, the empty ivory frame while `failed` or
   `stalled`, and the image while `complete`. `SceneNote` and `.plate-note`
   deleted. The new `planPath` prop added. Then extend
   `scripts/check-contrast.mjs` with the `TEXT_ONLY_SURFACES` bucket described
   above, so AC-6 is checked by `npm run verify` on every run rather than once by
   hand. **Built**, with one correction: `TEXT_ONLY_SURFACES` names the inks that appear on the scrim rather than taking every text token, because `ink-soft` at 2.61:1 and clay at 2.64:1 would otherwise fail `npm run verify` on pairings that cannot occur. Recorded in `rationale.md`. Satisfies **AC-5**, **AC-6**, **AC-7**, **AC-9**.
5. `ProjectSheet`: single full width plate, key rendered only when the render is
   not working, the meta line reduced to `Private`, and the closing paragraph
   rewritten. **Built.** The `is it working` derivation moved into `rules.ts` as `plateView` plus `isWorkingView`, so the plate and the key read one fact and cannot disagree about when the plan is on screen. Satisfies **AC-5**, **AC-10**.
6. Picker removal: `useGenerate` loses `models`, `isPicked`, `toggle` and
   `LAST_MODEL_NOTICE`, `PlanUploadCard` loses the toggle markup and its own
   `MODEL_NAMES`, and `.model-toggle` comes out of `app.css`. **Built.** Satisfies
   **AC-11**.
7. **Built**, and in the right order: the deletion trailed the deploy, so no
   client ever forgot a code a live worker could still emit. Delete
   `visionFailed` and
   `visionRefused` from `failures.ts`, per the reasoning in the failure vocabulary
   section. Then the `frontend-design` pass over the new busy state and the
   reshaped sheet, invoked directly per `CLAUDE.md` rather than assumed active,
   then `npm run verify` in full, and fix whatever fails before this is called
   done. Satisfies **AC-5**, **AC-7**, **AC-9**.

## Consequences

**Positive**

- One provider call per render instead of two: half the latency budget, half the
  cost, and one fewer place to fail. The two `vision*` failure codes disappear
  along with the stage that produced them.
- The render is now checkable against the plan. A top down orthographic view with
  matching geometry can be held against the drawing and judged, which an eye level
  interior photograph never could.
- The wait shows the person their own drawing instead of an empty rectangle, which
  is the cheapest way to make a two minute wait feel like work on their file.
- Feature 8 gets easier, not harder. It compares the plan against the render, and
  two images now sharing a top down framing and a square ratio is exactly what a
  slider wants.
- The record's per model machinery survives untouched, so feature 9 builds against
  the shape it was already designed for.

**Negative**

- Every project record written before this is unreadable. Any project created
  during feature 6's build simply stops appearing. This is accepted on the
  understanding that no one outside this machine has created a project.
- Gemini is now a single point of failure. There is no second model to fall back
  to, so a Gemini outage is a total outage, and AC-2 of spec 0006, one model
  failing never touching the other, is a rule about a situation that can no longer
  arise.
- The scene note is gone, and with it the only thing on the page that explained
  why a render came out the way it did. A surprising render is now just surprising.
- The record still carries a `models` array and a `renders` map for a set that
  always has one member. The machinery says many where the product says one, and
  anyone reading `record.ts` cold will wonder why.
- `quality` and `ratio` are dropped from the request until build task 2 says
  otherwise, so the first working version has less control over the output than
  the version it replaces.
- Two of the four options `puter.ai.txt2img` was being given are now unverified
  against this model rather than known good, which is a real reduction in
  certainty even though it is a small one.

**Neutral**

- The base64 and mime handling in the worker is untouched, and so are the three
  concurrency guards, the timeout, the stale rule and every path guard.
- `MODEL_NAMES` survives in `RenderPlate` with one entry rather than being
  inlined, which keeps the seam a second model would return through.
- The `model` field stays in the `/render` request body despite having one legal
  value, for the same reason.

## Follow-up

- [x] `scope.md`'s product line, `### 6`'s two model prose, and `### 8`'s wording
      still describe picking Claude, Gemini, or both. Update alongside the build.
      Note that feature 8's premise is **not** affected: it compares the plan
      against the render, not two models against each other. Done: the product
      line, the stack note and `### 8` were all rewritten with the revision, and
      `### 6`'s two model prose is kept under a banner marking it as the
      superseded record of what was built first rather than the current plan.
- [ ] `CLAUDE.md` line 5 and the Claude and Gemini rule at line 68 both describe
      two models. `/sync` owns that file, so it is flagged here rather than
      edited.
- [ ] Spec 0006's `index.md` needs a dated pointer line to this spec, and spec
      0002's `ModelId` field needs the same, in the pattern spec 0005 and 0006
      already set.
- [x] Build task 2's real call answers whether `ratio: { w: 1, h: 1 }` and
      `quality` are accepted by this model. If they are, add them back in a second
      commit and record the finding in `rationale.md`. Answered sideways: the call
      was made with neither option and came back a genuine 628x628 square, so the
      frame and the model already agree and **neither option is being added
      back**. Whether this model would honour an explicit `ratio` is still
      untested, because nothing has sent it one, and there is now no reason to.
- [ ] `scripts/check-contrast.mjs` and the `@theme` block belong to feature 4's
      design system, not to this feature. The `TEXT_ONLY_SURFACES` bucket and
      `--color-scrim-ground` are additions to shared machinery made from inside a
      feature build, so spec 0004 should gain a line recording that its script now
      has a third classification and why. Flagged rather than edited, because
      0004 is `Accepted`.
- [ ] If a second model is ever wanted again, this spec is what to supersede. The
      record shape is deliberately still capable of it.

## Rationale

Reasoning, the options weighed, and the sources: see [`rationale.md`](rationale.md).
