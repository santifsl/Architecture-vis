# 0006. Create a project and generate the 3D render

**Date**: 2026-08-28
**Status**: In Progress

**Revised 2026-08-31 by [0007](../0007-one-model-and-the-top-down-render/index.md).**
Claude is dropped, so AC-2's independence between models, AC-6's picker, and the
two-model half of AC-7 no longer describe the product. The two-stage render is
replaced by one direct image-to-image call, so AC-3 and AC-5 go with it, along
with the Model parity rule and the `PAINTER` constant. Everything else in this
spec still stands, and it is kept as the record of what was actually built.

The decision history (the problem, the options weighed, the reasoning, and the
sources) lives beside this file in [`rationale.md`](rationale.md). The hand
walkthrough that proves the acceptance criteria lives in [`verify.md`](verify.md).

## Summary

Someone picks the models they want, presses Generate, and lands on a page where
each model renders their floor plan on its own. The scope assumed both models
paint an image. They do not: Claude has no image output at all, so a render is
made in two stages, the chosen model reads the plan and writes a description of
the space, then one shared image model paints that description with the plan as
a reference. What is being compared is therefore how Claude and Gemini each read
your floor plan, which is the honest version of what the product promises, and
both sides use the same brush so neither is handicapped. Every model call runs
inside a Puter worker billed to the person who asked for it, and the client
alone writes the project record.

## Requirements

**User stories**

- As someone with a hosted floor plan, I want to choose Claude, Gemini, or both
  and press one button, so that I get photorealistic renders of my space without
  deciding anything else first.
- As someone watching two models work, I want each one to show its own progress
  and its own outcome, so that a slow or broken model never hides the one that
  already finished.
- As someone whose render failed, I want a plain sentence and a retry on that
  model alone, so that I do not have to start a new project or re upload.

**Acceptance criteria**

- **AC-1**: Generate creates one project in the owner's own store: `visibility`
  `private`, `name` derived from the uploaded filename, `floorPlan` the path
  feature 5 produced, one `renders` entry per selected model, each `pending`.
  The browser then shows `/project/:id`.
- **AC-2**: Each selected model runs independently. One model failing, refusing,
  timing out, or being slow never changes the other's `status`, `path`,
  `prompt`, `errorCode`, or timestamps.
- **AC-3**: A render is produced in two stages inside the worker: the selected
  chat model reads the floor plan and writes a scene prompt, then the one shared
  image model paints that prompt with the plan passed as its input image.
- **AC-4**: The painted image lands in the owner's own Puter storage and
  `renders[model].path` points at it. No expiring URL is ever stored, matching
  the rule spec 0005 established for plans.
- **AC-5**: The scene prompt the model wrote is stored on
  `renders[model].prompt`, so a difference between two renders can be accounted
  for rather than guessed at.
- **AC-6**: The model picker starts with both models ticked. At least one must
  stay ticked, and unticking the last one is refused with a plain sentence
  rather than a button that silently does nothing.
- **AC-7**: The project page shows one card per requested model from its first
  paint, each in its own state, with the floor plan above them for reference. A
  card that is working shows spec 0004's busy hairline, never a spinner.
- **AC-8**: A failed render offers Retry. Retry moves that model `failed` to
  `pending` to `running` and touches no other model's render.
- **AC-9**: No provider text, exception, HTTP status, or model name from an
  error ever reaches the screen. Every failure arrives as one of the named codes
  below and is rendered as a plain sentence with something to do next.
- **AC-10**: A render still `running` more than ten minutes after its
  `startedAt` is shown as failed with a retry when the project is opened. The
  screen never claims work is happening when nothing is.
- **AC-11**: Generating requires a session. The worker refuses a `/render`
  request that carries none with 401, and the client never calls it while signed
  out.
- **AC-12**: The worker reads only a path inside the caller's own app data
  directory under `plans/`, and writes only inside the same directory under
  `renders/`. Anything else is refused before a model is called.
- **AC-13**: A client wait longer than 120 seconds is abandoned, recorded as
  `failed` with a timeout code, and offered a retry.
- **AC-14**: `/project/:id` for an id that is missing, unreadable, or not the
  caller's shows the store's own plain sentence, never a blank screen, a crash,
  or a raw error.
- **AC-15**: The worker's source lives in this repository and one command
  deploys it.
- **AC-16**: Every new control meets spec 0004: all six states defined, real
  contrast on both surface tones, full keyboard operation, visible focus.
- **AC-17**: A render left `pending`, because Generate was interrupted between
  creating the record and reaching the page, starts on the next visit to that
  project. A created project is never permanently unrendered.
- **AC-18**: One model can never have two renders running at once, whatever the
  cause: a double effect in development, a reload mid render, a retry after a
  timeout, or a second tab. A late answer from a superseded attempt is
  discarded rather than written.

## Decision

**Chosen option**: Option 2: two stage render, one shared painter, a stateless
worker, and the client owning the record.

Both models are asked to read the plan and write the scene, one image model
paints both scenes, the worker holds no state of its own, and the client alone
moves the project record through its states.

**Implementation skills**: `react-router` (`.agents/skills/react-router/`, plus
the v8 docs inside `node_modules/react-router/docs/`, framework mode) ·
`frontend-design` (Anthropic plugin, invoked for the project page and the
picker, per CLAUDE.md)

## Rationale

Reasoning, the options weighed, and the sources: see
[`rationale.md`](rationale.md).

## Feature design

**Data model sketch**

One change to the record decided in spec 0002, and nothing else. No stored
record exists yet, since feature 6 is what creates the first one, so there is no
migration and `SCHEMA_VERSION` stays at `1`.

| Entity        | Field                      | Type             | Required           | Note                                                                    |
| ------------- | -------------------------- | ---------------- | ------------------ | ----------------------------------------------------------------------- |
| `RenderState` | `prompt`                   | `string \| null` | required, nullable | **new**. The scene prompt this model wrote. Null until vision succeeds. |
| `RenderState` | `status`                   | `RenderStatus`   | required           | unchanged                                                               |
| `RenderState` | `path`                     | `string \| null` | required, nullable | unchanged. The painted image in the owner's storage.                    |
| `RenderState` | `url`                      | `string \| null` | required, nullable | unchanged, and stays `null` throughout feature 6, per AC-4              |
| `RenderState` | `errorCode`                | `string \| null` | required, nullable | unchanged. One of the codes below, never provider text.                 |
| `RenderState` | `startedAt` / `finishedAt` | `number \| null` | required, nullable | unchanged. Client clock.                                                |
| `Project`     | every other field          |                  |                    | unchanged from spec 0002                                                |

`parseProject` in `app/projects/invariants.ts` reads each render field at
runtime, so adding `prompt` to the type without adding it to the parser makes
every record unreadable rather than failing to compile. Spec 0005 was caught by
exactly this on `FloorPlan.url`; both places change together.

**State transitions**

Per model render, unchanged from spec 0002 and already enforced by
`isLegalRenderTransition`:

`pending` → `running` → `complete`, or `pending` → `running` → `failed`.
Retry is `failed` → `pending`. A stale `running` (AC-10) is **displayed** as
failed without a write; its retry writes `running` directly, which the machine
already permits.

Project visibility stays `private` for the whole of this feature. Publishing is
feature 9.

**API surface** (the worker, at `VITE_PUTER_WORKER_URL`)

| Endpoint  | Method | Key inputs                                                                         | Key outputs          | Auth                   | Key errors                                                                                                                                                                                   |
| --------- | ------ | ---------------------------------------------------------------------------------- | -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/render` | POST   | `plan:string` (req, absolute), `out:string` (req, absolute), `model:ModelId` (req) | `path`, `prompt`     | Puter session required | 400 malformed body, 401 no session, 403 path outside the caller's own `plans/` or `renders/`, 404 plan gone, 422 the model refused the plan, 502 the paint step failed, 507 out of allowance |
| `/probe`  | POST   | none                                                                               | `{ wrote: boolean }` | Puter session required | 403 the worker may not write there                                                                                                                                                           |

`/probe` exists only for build task 1 and is deleted once its answer is
recorded. The client reaches `/render` through `puter.workers.exec()` behind
`withPuter`, same as spec 0002 decided for the feed routes.

**Wire format.** JSON in both directions, `content-type: application/json`. The
request body is exactly `{ plan, out, model }` and nothing else; any other key
is ignored rather than trusted. The success body is exactly
`{ path: string, prompt: string }` and a failure body is
`{ errorCode: string }`, never a message.

The client does not trust either. `parseRenderResponse` narrows the body the way
`parseProject` narrows a stored record: a success needs a non empty `path` equal
to the `out` that was sent and a non empty `prompt`, an anything else, including
valid JSON of the wrong shape, a truncated body, or an HTML error page from
somewhere in between, becomes the client side code `badResponse`. A worker is
the one thing in this system with no types, no lint, and no local run, so its
answer is parsed rather than cast.

**What the vision call asks for.** Pinned here rather than left to the build,
because AC-3 and AC-5 are unverifiable without it. The worker sends the plan by
`puter_path` with an instruction to this effect:

> You are looking at a 2D architectural floor plan. Describe the same space as a
> single photorealistic interior photograph: the layout and how the rooms
> connect, the furniture and materials that suit the space, and the light. Write
> one paragraph of plain prose, no markdown, no lists, no preamble, and do not
> mention that this came from a floor plan.

The reply is trimmed and capped at 1200 characters before being used or stored.
A reply that comes back empty, or that is refused, is `visionRefused`. The exact
wording is a constant in the worker beside `VISION_MODELS`, and is expected to
be tuned once real output has been looked at.

**What comes back from the painter.** PNG, 16:9, medium quality, written to
`renders/<projectId>-<model>.png`. The render card reserves that ratio before
the image loads, so a slow mint does not shift the layout underneath someone.

**How a project gets its name.** `sanitisePlanName` from `app/upload/plan.ts`
already produces a safe non empty slug and already falls back when a filename
sanitises to nothing, so `NAME_MIN_LENGTH` cannot be tripped. On top of it:
hyphens become spaces, the first letter is capitalised, nothing else is
recased, and the result is cut to `NAME_MAX_LENGTH`. `ground-floor-plan.png`
becomes `Ground floor plan`.

Feature 9 adds `/feed`, `/feed/project/:id`, `/publish`, and `/unpublish` to the
same file. Nothing here forecloses that.

**Value sourcing**

| Action          | Value produced / displayed          | Source                                                                                                                                                     |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create project  | `id`, `owner`, `createdAt`          | `createProject` in `app/projects/store.ts`, already decided in spec 0002                                                                                   |
| create project  | `name`                              | derived: the uploaded filename through `sanitisePlanName`, hyphens to spaces, first letter capitalised, capped at `NAME_MAX_LENGTH`                        |
| create project  | `models`                            | the picker's ticked set, at least one (AC-6)                                                                                                               |
| create project  | `floorPlan.path`                    | the `HostedPlan` feature 5's hook already hands back                                                                                                       |
| start a render  | the plan's **absolute** path        | `fs.stat(floorPlan.path)` on the client, read once per project and reused. A relative path means something different inside the worker, see Key invariants |
| start a render  | the render's **absolute** out path  | derived: the plan's absolute path with its trailing `plans/<file>` replaced by `renders/<projectId>-<model>.png`                                           |
| start a render  | `startedAt`                         | the client's clock at the moment it writes `running`                                                                                                       |
| worker, stage 1 | `prompt`                            | the chat model's reply to the vision call, trimmed and capped                                                                                              |
| worker, stage 2 | `path`                              | `puter_output_path`, the value the client sent as `out`, echoed back only after the write succeeded                                                        |
| finish a render | `finishedAt`                        | the client's clock when the worker's answer arrives or the wait ends                                                                                       |
| finish a render | `errorCode`                         | the worker's code for a model or platform failure; the client's own code for a timeout, an unreachable worker, or a lost session                           |
| a render card   | the image to show                   | `readStoredUrl(renders[model].path)`, a freshly minted short lived URL, never a stored one                                                                 |
| a render card   | the failure sentence                | a lookup on `errorCode` in `app/render/failures.ts`. There is no path from a provider string to the screen                                                 |
| a render card   | whether a `running` render is stale | derived: `Date.now() - startedAt > 10 minutes`                                                                                                             |
| start a render  | whether this attempt may start      | derived: the stored status is `pending`, or `running` and already stale. Plus `singleFlight` on `${projectId}:${model}`                                    |
| finish a render | whether this attempt may write      | derived: the stored `startedAt` still equals the one this attempt began with                                                                               |
| a render card   | the image's aspect ratio            | fixed at 16:9 by `PAINTER`, reserved by the card before the image loads                                                                                    |
| the worker      | which chat model to call            | the `VISION_MODELS` constant, keyed by `ModelId`                                                                                                           |
| the worker      | which image model to call           | the `PAINTER` constant: model, quality, ratio, in one place so a swap is one line                                                                          |

**Key invariants**

- A relative Puter path resolves against **the calling app's** data directory. A
  worker runs under its own app identity, so `plans/x.png` inside the worker is
  not the file the client wrote. Every path crossing this boundary is absolute,
  and the worker rejects a relative one outright rather than reading whatever it
  resolves to.
- `out` must share the plan's app data root and sit under `renders/`. A request
  where it does not is refused before any model is called (AC-12).
- `renders[model].status` is `complete` if and only if `path` is non null. A
  `complete` render with no path is impossible by construction: the worker
  returns a path only after the image is written, and the client writes
  `complete` only when it has one.
- `prompt` non null means stage one succeeded. A `failed` render may still carry
  a prompt, which is exactly the case where the model read the plan fine and the
  painter fell over, and keeping it is what makes that distinguishable.
- One `renders` key per entry in `models`, still enforced by `checkProject`.
- **A `pending` render is work not started, not work lost.** The project page
  starts every `pending` render whenever it mounts, so a Generate interrupted
  between the write and the navigation resolves itself on the next visit rather
  than stranding a paid for plan (AC-17). This is also why the ten minute stale
  rule is scoped to `running`: `pending` needs no rule, it just runs.
- **At most one attempt per model at a time** (AC-18), held four ways, because
  no one of them covers all the causes:
  1. `singleFlight` from `app/auth/singleFlight.ts`, keyed
     `${projectId}:${model}`, collapses a double effect in development and any
     two starts in the same tab into one call.
  2. A start is refused when the stored status is already `running` and not yet
     stale, which is what a second tab sees.
  3. Every write carries the `startedAt` its attempt began from, and is
     abandoned when the stored `startedAt` has moved on. A compare and swap in
     the client, and the thing that makes a late answer from a timed out attempt
     harmless: retry stamps a new `startedAt`, so the old attempt's `complete`
     write finds a value that is not its own and drops it.
- A client timeout aborts its own request through `AbortController` as well as
  giving up on it. The worker may keep working regardless, which is exactly why
  the stamp above exists rather than the abort being trusted to end things. 4. A leased claim on `puter.kv.incr`, in `app/render/claim.ts`. `incr` is
  atomic on the server and returns the new value, so exactly one caller is
  ever handed `1` for a key that does not exist yet, and that caller owns the
  render. The key carries a `kv.expire` lease of `STALE_AFTER_MS`, so a tab
  that dies mid render frees the model instead of wedging it, and the lease
  and the record's own staleness rule expire together. Released in a
  `finally` so a retry never waits out a lease nobody is using. Added after
  the first version shipped, in the review below.
- Two tabs now coordinate. This paragraph used to say the opposite, that a stale
  write is discarded but two tabs do not coordinate, on the mistaken basis that
  Puter KV offers no compare and swap; it ships `incr`, which is one. Guard 3
  stays as the backstop for a late answer from an attempt whose lease ran out,
  which is what it was always for.
- A claim that cannot be reached is not a render that cannot start. Guard 4
  degrades to the other three rather than refusing, because a KV hiccup blocking
  every render would be worse than the duplicate it prevents, and a real outage
  still surfaces one step later when `commitRenderStart` cannot write.
- The worker writes no key, no record, and no file outside `out`. It is a pure
  function of its request as far as this app's state is concerned.
- `SCHEMA_VERSION` stays `1`. Adding `prompt` before any record exists is not a
  shape change anyone can observe.

**Security model**

- `/render` requires a Puter session. Without one there is no `user.puter`, so
  the worker cannot reach any storage or any model, and it answers 401 rather
  than attempting anything (AC-11).
- The worker acts **as the caller** through `user.puter`, so it can only ever
  touch that person's own files and their own model allowance. It has no
  ambient credential and cannot read anyone else's plan even if handed a path,
  which is what makes the path check a guard against mistakes rather than the
  only thing standing between users.
- The path check is still enforced (AC-12), because a caller could otherwise ask
  the worker to overwrite one of their own unrelated files.
- Model calls are billed to the caller under Puter's user pays model. Nothing in
  this app holds an API key, and there is no key to leak.
- A minted view URL reads a private file without authentication, so it is short
  lived and never stored, per spec 0005.
- No regulated data. A floor plan is a drawing of a room the person chose to
  upload, and the project stays private for the whole of this feature.

**Failure vocabulary**

Codes the worker returns: `planUnreadable`, `visionFailed`, `visionRefused`,
`paintFailed`, `paintRefused`, `outOfAllowance`, `badRequest`.
Codes the client decides for itself: `timeout`, `unreachable`, `signedOut`,
`stalled`, `badResponse`. Each maps to one plain sentence in `app/render/failures.ts`, the same
shape as `app/upload/failures.ts` and `app/projects/store.ts` already use.

**Model parity on the reading side**

The two reads are the comparison, so anything that differs between them other
than the model itself is a confound, the same reasoning that put both prompts
through one painter. Three things are held equal, and they are constraints on
`VISION_MODELS` rather than preferences.

- **Same capability tier.** Google's lineup is Flash then Pro; Anthropic's is
  Haiku, then Sonnet, then Opus. Pro sits at the top of Google's, so its
  counterpart is Opus, not Sonnet. Pairing `gemini-2.5-pro` with a Sonnet tier
  Claude would put Google's flagship against Anthropic's middle model and every
  difference in the two renders would be partly that.
- **Same routing.** `google:` is the native provider, not the `infron:` or
  `openrouter:` routes to the same weights. The Claude id is pinned in its
  native provider form too. A router can differ in infrastructure, defaults, and
  how it handles a system prompt, which is the same class of confound one step
  further down.
- **Same settings.** One shared instruction constant for both, and no per model
  sampling or output settings at all: whatever Puter's defaults are, both models
  get them. A temperature set on one side only would be indistinguishable from a
  difference in judgment.

Generation is the one axis that cannot be held equal cleanly, and it is worth
naming rather than pretending otherwise. The two vendors do not version in step,
so an exact match does not exist; the rule applied is to pair the chosen Gemini
generation with the **nearest** Claude generation rather than the newest
available one, so neither side gets a frontier advantage the other lacks.

Both ids are now settled, confirmed against `puter.ai.listModels()`:

| `ModelId` | Puter id                              | Tier                                                                    |
| --------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `gemini`  | `google:google/gemini-2.5-pro`        | Google Pro, native provider, non preview                                |
| `claude`  | `anthropic:anthropic/claude-opus-4-5` | Anthropic Opus, native provider, non preview, dated snapshot `20251101` |

Two things about the Claude pick are worth writing down, because the reason
matters more than the id if either lineup moves.

- **Why 4.5 and not the newest.** Opus 4.5 is the closest of the five listed
  Opus releases in calendar time to the 2.5 series; 4.6, 4.7, 4.8, and 5 all
  came after. The rule is nearest, not oldest. Those coincide today, and if
  Puter ever exposes an older Opus they will stop coinciding, at which point
  nearest is still the right answer and oldest is not.
- **The date suffix is a feature here.** `claude-opus-4-5` is the only candidate
  carrying an explicit date, which means pinned weights rather than an alias
  that can move under the comparison. For a feature whose entire purpose is
  attributing a difference to one model rather than another, a model that cannot
  silently change beneath it is worth more than a newer one.

`claude-fable-5` is excluded deliberately: it is a tier above Opus, so it would
break the tier rule in the other direction. Older Anthropic models also carry an
older request surface (fixed thinking budgets rather than adaptive thinking, a
narrower effort range), which costs nothing here precisely because the settings
rule above sends no per model options at all.

The cost of this rule is real and lands on the person generating: an Opus tier
read costs materially more of their Puter allowance than a Sonnet tier one, and
a two model project pays it twice on top of two image generations. That is the
price of an attributable comparison, and it is the reason this is written down
as a decision rather than left as a default.

**Configuration required**

- No new environment variable. `VITE_PUTER_WORKER_URL` already exists and is
  already checked at startup by `app/platform/env.ts`. Feature 6 is simply the
  first time anything is deployed behind it.
- Worker side constants: `VISION_MODELS` (which chat model each `ModelId` means)
  and `PAINTER` (image model, quality, ratio). Neither is a secret.
- **Prerequisite, a person does this once**: run `npm run deploy:worker`, then
  put the URL it prints into `.env` as `VITE_PUTER_WORKER_URL` and into the
  Vercel project's environment. Deploying requires a verified Puter account. The
  script also creates a `roomify` app the first time, which is what the worker is
  deployed under; see Corrections for why that is not left to the SDK.

**Critical test scenarios**

- Happy path: upload a plan, leave both models ticked, press Generate, land on
  `/project/:id`, watch two cards work independently and both fill with a
  render, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**.
- Failure case: force one model to fail while the other succeeds, and confirm
  the good card is untouched and the bad one shows a sentence and a working
  Retry, verifies **AC-2**, **AC-8**, **AC-9**.
- Failure case: close the tab mid render, reopen the project after ten minutes,
  and confirm the abandoned render reads as failed with a retry rather than as
  still working, verifies **AC-10**.
- Failure case: open the same project in two tabs while it is generating, and
  confirm the second tab does not start a second run and the record ends with
  one coherent result per model, verifies **AC-18**.
- Failure case: interrupt Generate between the record being written and the page
  loading, then open the project again, and confirm both renders start rather
  than sitting `pending` forever, verifies **AC-17**.
- Auth and permission: call `/render` with `curl` and no session and get a 401
  with no body worth having; call it with a session but an `out` path outside
  `renders/` and get a 403, verifies **AC-11**, **AC-12**.

## Build plan

CLAUDE.md's approach is a thin working slice first, one floor plan actually
reaching a model and coming back as a hosted render, so this is ordered as a
tracer bullet: one model end to end through every layer before anything is made
fuller.

1. **[needs a deploy]** **Prove the write direction.** Deploy a throwaway worker with `/probe` that
   tries `user.puter.fs.write` into this app's data directory as the caller.
   Record the answer in `rationale.md`. If it is refused, switch to the recorded
   fallback (the worker returns the image bytes and the client writes them) and
   note the change here before continuing, satisfies **AC-4**, **AC-12**
2. **[built]** **`worker/roomify.js` and its deploy script.** `router.post('/render')` with
   the session check, the absolute path and `renders/` prefix check, stage one
   (`user.puter.ai.chat` with the plan by `puter_path`), stage two
   (`user.puter.ai.txt2img` with `input_image` and `puter_output_path`), and the
   provider failure to code mapping. Plus `scripts/deploy-worker.mjs` and
   `npm run deploy:worker`. Confirm the two `VISION_MODELS` ids against
   `puter.ai.listModels()` rather than trusting the ones written here,
   satisfies **AC-3**, **AC-9**, **AC-11**, **AC-12**, **AC-15**
3. **[built]** **The record change.** `prompt` onto `RenderState` in
   `app/projects/record.ts` **and** into `parseProject` in
   `app/projects/invariants.ts`, both together. Note the change in spec 0002 the
   way spec 0005 noted its own, satisfies **AC-5**
4. **[built]** **The shared URL minting.** Move the promise cache out of
   `app/upload/store.ts` into `app/storage/urls.ts` as `readStoredUrl`, and
   point the upload card at it. Two features now mint view URLs, and CLAUDE.md
   forbids the copy, satisfies **AC-7**
5. **[built]** **`app/render/` pure layer.** The out path builder, the project name
   derivation, the ten minute stale rule, and the failure sentences. No I/O, so
   it is checkable by hand, satisfies **AC-1**, **AC-10**, **AC-13**
6. **[built]** **`app/render/store.ts`.** `requestRender` over `puter.workers.exec` behind
   `withPuter`: the 120 second timeout with a real `AbortController`,
   `parseRenderResponse` narrowing the body rather than casting it, and every
   throw turned into a code. Nothing escapes, satisfies **AC-2**, **AC-9**,
   **AC-13**
7. **[built]** **The thin thread, one model.** The `/project/:id` route, its `clientLoader`
   reading the record, `RequireUser`, and a `useProjectRenders` hook that starts
   every `pending` render on mount and writes `running`, then `complete` or
   `failed`. The three start guards go in here, not later: `singleFlight`, the
   already running refusal, and the `startedAt` stamp on every write. Prove one
   Claude render end to end before touching the second model, satisfies
   **AC-1**, **AC-4**, **AC-7**, **AC-14**, **AC-17**, **AC-18**
8. **[built]** **Both models, in parallel, plus Retry.** Fan the hook out over `models`, one
   independent wait each, and wire Retry on a failed or stale card, satisfies
   **AC-2**, **AC-8**, **AC-10**
9. **[built]** **The picker and Generate on the upload card.** Both ticked by default, the
   refusal sentence on unticking the last, `createProject` on Generate, then
   navigate. The card stays outside `RequireUser` for the reason spec 0005 gave,
   satisfies **AC-1**, **AC-6**
10. **[built]** **The design pass.** Invoke `frontend-design` before writing this markup,
    per CLAUDE.md. Six states on the picker, the Generate button and Retry, the
    busy hairline on a working card, contrast on both surface tones, keyboard
    operation end to end, satisfies **AC-7**, **AC-16**
11. **[partly done, `npm run verify` passes]** **`npm run verify`**, then the walkthrough in `verify.md`. Fix whatever
    fails before calling this done, satisfies every AC by way of the
    walkthrough.

## Corrections made during the build

Four things this spec got wrong or left open, found while building rather than
while designing, and fixed in the spec as well as in the code. Same habit
feature 5 used on `puter.fs`, and the same reason: a plan that stays wrong after
the code is right is worse than no plan.

**The plan reaches a model as a data URI, not by `puter_path`.** This spec said
the worker would hand the plan to the chat model by `puter_path`. The installed
SDK does not offer that on `ai.chat` at all: chat takes an image as a URL, a
`File`, or a data URI, and `txt2img`'s `input_image` specifically wants base64
or a data URI for the `gpt-image-*` family. So the worker reads the plan's bytes
once through `user.puter.fs.read`, as the caller, and the same data URI feeds
both stages. Nothing about the decision changes: the worker still takes a path
and returns a path, and a private file is still never handed around as an
anonymous link. `puter_output_path` on the paint call was right and is unchanged.

**`checkRenderStates` would have refused every render this feature makes.** Spec
0002 wrote `RenderState.url` as an owner-readable URL set on `complete`, and
`checkProject` enforced it: a complete render without a `url` was `invalid`.
AC-4 here says no expiring URL is ever stored, so every single render would have
been refused on the write that finished it, and the message would have named a
rule rather than the platform fact behind it. `url` is now the hosted public copy
feature 9 writes at publish, `complete` requires only `path`, and spec 0002
carries the amendment as its footnote ².

**The worker's codes are the client's vocabulary, exactly.** Earlier drafts of
the worker answered `noSession` and `badPath`, neither of which is in the Failure
vocabulary above. A code with no sentence behind it reaches
`app/render/failures.ts`, misses, and lands on "something unexpected", which is
worse than the answer it had. A lost session now answers `signedOut`, the same
code the client decides for itself when it notices the same thing, and a path the
guard refuses answers `badRequest` with a 403.

**Two renders finishing at once needed the answer spec 0002 handed to this
feature.** Spec 0002's Follow-up left `updateProject` explicitly unsafe against
two renders completing together, said that feature 6 breaks the "one person, one
action at a time" reasoning it was built on, and handed the decision here. It is
taken: every write for one project goes through a per-project serial queue
(`createSerialQueue` in `app/auth/singleFlight.ts`), so two completions cannot
interleave their read, modify, write and lose one model's render. That is AC-2 at
the record level. It serialises one tab, not two; two tabs are handled by the
leased claim in `app/render/claim.ts` (guard 4, added in review), with the
`startedAt` stamp still discarding a stale write from an attempt whose lease ran
out.

**The worker is deployed under a named app, because the SDK's sandbox path is
broken.** `workers.create(name, path)` with no third argument auto-provisions a
`sandbox-<name>` app and then checks `sandboxApp.owner.uuid` against the caller.
That check cannot pass: it reads the app through `apps.get`, and creates it
through `apps.create`, which go to the app driver's `read` and `create` methods,
and neither returns an `owner` field at all. `puter.apps.list()` does return one,
but that is the driver's `select` method and a different shape, which is why the
field looks present when you check it by hand in a browser console and is absent
on the object the SDK actually holds. Every deploy dies on `Cannot read
properties of undefined (reading 'uuid')` before anything is sent, in Node and in
a browser alike.

The deploy script names an app explicitly instead. The SDK's third argument, when
it is a string, is resolved through `apps.list()` and only its `uid` is read, so
the broken branch is never entered. The script creates the `roomify` app once and
reuses it, which also gives the worker a stable identity rather than one
generated per worker name. `npm run deploy:worker -- --diagnose` prints what each
driver method returns, and `--user-scoped` deploys with no app identity at all as
an escape hatch. That escape hatch costs feature 9 its store B namespace, so it
is for getting unblocked rather than for staying that way.

**Retry takes two routes, because the state machine has two.** AC-8 says a
failed render goes failed, pending, running, and that is what a `failed` card
does: it writes `pending`, and the same mount effect that starts every pending
render starts it. A stale `running` render cannot take that route, because
`running` to `pending` is not a legal transition and should not become one, so it
starts directly and writes `running` with a fresh `startedAt`. One start path
either way.

## Consequences

**Positive**

- The product's central claim becomes true and demonstrable: two named models,
  two independent renders, one plan.
- The worker holds no state, so it can be redeployed, rolled back, or rewritten
  without any thought about data. Every invariant stays in the one client module
  that already enforces them.
- No API key exists anywhere in this system, and no cost accrues to whoever
  deploys it. Both follow from the worker acting as the caller.
- Storing the prompt turns feature 8's comparison from two pictures into an
  account of two readings, at the cost of one nullable string.
- The worker file and its deploy script are the exact scaffolding feature 9
  needs, built once here.

**Negative and tradeoffs**

- Two stages means two chances to fail and roughly twice the wait. A render is a
  vision call plus an image call, and the person watches both.
- The scope's promise is quietly narrowed. "Claude rendered this" means Claude
  described it and a third model painted it. The project page has to say so
  honestly rather than imply Claude drew the picture.
- A closed tab abandons a render. Nothing resumes it, and the ten minute rule
  reports that fact rather than fixing it. Work already paid for is lost.
- Both models painting through one image model means a weakness in that painter
  shows up in both renders and cannot be told apart from a weakness in the
  reading.
- The 120 second timeout is a guess. Puter publishes no worker limit, so the
  real ceiling is unknown until it is hit in practice.
- One more hand step before anyone can run this: the worker has to be deployed
  and its URL configured, and nothing works at all until that is done.

**Neutral**

- The first server side code in the repository, and with it a second deploy
  target that is not Vercel.
- `renders[model].url` stays `null` for the whole feature. It is spec 0002's
  field for a public copy and belongs to feature 9.
- Regenerating a render that already succeeded is deliberately out of scope,
  though `complete` → `pending` already permits it.

## Follow-up

- [x] Both `VISION_MODELS` ids pinned, confirmed against
      `puter.ai.listModels()`: `google:google/gemini-2.5-pro` and
      `anthropic:anthropic/claude-opus-4-5`. See Model parity for the rule and
      why each was chosen. `claude-sonnet-4-6`, which earlier drafts carried
      from Puter's own documentation example, is a Sonnet tier id and was the
      wrong pairing; it must not come back.
- [x] Record the `/probe` answer in `rationale.md` and delete the route, so a
      later reader knows the write direction was proved rather than assumed.
      Done: the answer was yes, `200 {"wrote":true}`, and the route is gone from
      `worker/roomify.js` and from the deployed worker.
- [ ] Revisit the 120 second timeout once real generations have been timed. It
      is a placeholder, not a measurement.
- [x] Spec 0002's Follow-up asks for a `curl` against a real worker with no
      session. Feature 6 deploys the first one, so that check becomes possible
      here and should be run while the worker is fresh. Done: an anonymous
      `curl -X POST .../render` reaches the route and returns
      `401 {"errorCode":"signedOut"}`, and a route that does not exist returns
      `404 Path not found`, so the two are distinguishable.
- [ ] `app/render/AGENTS.md` does not exist and this project has no
      `AGENTS.md` convention yet. If nested context files are ever adopted, the
      absolute path rule at the worker boundary is the first thing that belongs
      in one.
- [ ] Decide where regenerate lives once the gallery exists. It is one
      transition away and will be asked for.
