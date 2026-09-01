# 0007 verify: one model, one direct call, and the top down render

Hand walkthrough, per `CLAUDE.md`: a real dev server, a real browser, a real
deployed worker, and `curl`. No test runner, no browser automation.

Each step names the acceptance criterion it proves. Run the command and code
shape steps first, they are cheap and they catch the mistakes that make the
runtime steps meaningless.

## Before you start

- [x] You are signed in with a Puter account with some model allowance left.
- [x] You have at least two floor plans to hand: one normal pale drawing, and one
      deliberately very dark or near black image. The dark one is the only way to
      check AC-6 for real.
- [x] `npm run dev` boots to the home screen rather than `ConfigScreen`.

## Commands and code shape

- [x] `npm run verify` passes clean: typecheck, lint, format, contrast, build.
- [x] `grep -rni "claude" app/ worker/ | grep -v "CLAUDE.md"` returns nothing.
      Not a type, not a comment, not a display name, **AC-1**.
- [x] `grep -n "SCHEMA_VERSION" app/projects/record.ts` reads `2`, **AC-12**.
- [x] `grep -rn "prompt" app/projects/record.ts app/projects/invariants.ts app/render/ worker/roomify.js`
      returns nothing except `RENDER_PROMPT` in the worker. If `record.ts` and `invariants.ts` disagree about `prompt`,
      stop: every stored record is about to become unreadable. This is the exact
      trap spec 0005 and spec 0006 both hit, **AC-4**.
- [x] `worker/roomify.js` holds no `describeScene`, no `SCENE_INSTRUCTION`, and
      no `PAINTER`, and exactly one `puter.ai` call in the whole file, **AC-2**.
- [x] `VISION_MODELS` is gone and `RENDER_MODELS` has taken its place with one
      entry, and the `/render` guard still reads `model in RENDER_MODELS` rather
      than a hardcoded string.
- [x] `RENDER_MODEL` reads exactly `google:google/gemini-2.5-flash-image`.
- [x] That id is still on `https://api.puter.com/puterai/image/models`. If it has
      gone, re pick by spec 0006's rule (native `google:` prefix, not a preview,
      nearest generation rather than newest) rather than by grabbing whatever is
      newest.
- [x] `RENDER_PROMPT` matches the pinned text in `index.md` character for
      character, including the typographic hyphens in `top‑down` and the arrows
      in the mapping list, **AC-3**.
- [ ] `grep -n "visionFailed\|visionRefused" app/ worker/ -r` returns nothing,
      and `RENDER_MESSAGES` has a sentence for every remaining code.
- [x] `grep -n "aspect-ratio" app/app.css` shows `1 / 1` on `.plate-frame`, and
      `RENDER_ASPECT_RATIO` in `app/render/rules.ts` agrees with it, **AC-8**.
- [ ] `grep -rn "16:9\|16 / 9\|PAINTER" app/ worker/` returns nothing. Two
      comments name the old ratio and the deleted constant without containing
      either `prompt` or `claude`, so the greps above miss them on purpose: the
      `RENDER_ASPECT_RATIO` comment in `app/render/rules.ts` and
      `RenderPlate.tsx`'s file header. Both should read as though 1:1 was always
      the plan, **AC-8**.
- [x] `grep -n "model-toggle\|plate-note" app/app.css` returns nothing, and
      neither class is referenced anywhere in `app/`, **AC-11**.
- [x] `--color-scrim-ground` is in the `@theme` block, and
      `scripts/check-contrast.mjs` carries it in `TEXT_ONLY_SURFACES`, **not** in
      `SURFACES`. In `SURFACES` it drags the clay focus ring check onto a ground
      the ring never appears over, measures about 2.64:1, and fails the build for
      nothing. `npm run contrast` passes, **AC-6**.
- [x] Temporarily darken `--color-scrim-ground` by hand and confirm
      `npm run contrast` **fails**. A check that cannot fail is not a check.

## The upload card

- [x] Upload a plan. There are no model toggles anywhere on the card, and no
      sentence about keeping at least one model ticked, **AC-11**.
- [x] Generate is the only control once the plan is hosted, and pressing it goes
      straight to `/project/:id`, **AC-11**.

## The busy state

Do this with the **pale** plan first.

- [ ] From the first paint, before anything has been fetched, the frame is a
      square and it is the full width of the sheet. There is no second empty
      plate beside it, **AC-8**.
- [x] Within a moment the frame fills with your own floor plan, blurred, with
      `Generating your 3D render` centred on it, **AC-5**.
- [ ] The small `Floor plan` key is **not** on the page while this is happening.
      The drawing is on screen exactly once, **AC-5**.
- [ ] The blur reaches the frame's edges. There is no pale border or soft halo
      inside the frame where the image ran out, **AC-5**.
- [ ] Throttle the network hard, or point the plan at a path that cannot be
      minted, and start a render. The scrim and the words appear over plain ivory
      with no image, rather than an empty frame or a broken image icon, **AC-5**.
- [ ] The clay hairline is still sweeping along the bottom edge of the frame, and
      there is no spinner anywhere on the page, **AC-7**.
- [ ] The state word beside the title still reads `Working`.
- [ ] Turn on the system's reduce motion setting and reload a working project.
      The sweep stops. The blur and the message stay, **AC-7**.
- [ ] With a screen reader on, the page announces `Working` once. It does not
      also announce the overlay sentence, **AC-7**.

Now repeat with the **dark** plan.

- [x] `Generating your 3D render` stays comfortably readable over the blurred
      dark image. If it is even slightly hard to read, the scrim percentage and
      `--color-scrim-ground` are both wrong and need recomputing together,
      **AC-6**.

## The render itself

- [x] It arrives. Nothing else on the page moved when it did, **AC-8**.
- [x] It is a top down view, seen from straight above, with no perspective tilt,
      **AC-3**.
- [x] Hold it against the original plan. The walls are where the plan puts them,
      the rooms are the same proportions, and no room has been invented, **AC-3**.
- [ ] There is no text, no dimension, and no label anywhere in the render. The
      floor is continuous where the plan had writing, **AC-3**.
- [ ] The key returns above the frame once the render is complete, **AC-10**.
- [x] There is no scene note under the render, and no `Read what Gemini wrote`
      button, **AC-10**.
- [x] The closing line under the plate says Gemini rendered it directly from your
      floor plan. It does not mention two models, reading, or a shared brush.

## Failure and retry

- [x] Force a failure. Signing out in another tab mid render is the cheapest way,
      or point `VITE_PUTER_WORKER_URL` at a dead URL and reload.
- [x] The frame is empty ivory. The blurred plan and the message are both gone,
      so the page does not look like it is still working, **AC-9**.
- [x] A plain sentence and `Try this render again` are underneath. No provider
      text, no exception, no HTTP status, no model name, **AC-9**.
- [ ] Retry puts the busy state back exactly as it was, blurred plan and all,
      **AC-5**, **AC-9**.

## The migration

- [ ] Find a project created before this change, or fake one by writing a version
      1 record by hand into `puter.kv`.
- [ ] Open the gallery. That project is simply not listed. No crash, no blank
      screen, no half rendered card, **AC-12**.
- [ ] Open its `/project/:id` directly. It shows the store's own plain sentence,
      not an error, **AC-12**.

## The worker, by hand

- [x] `curl -X POST "$VITE_PUTER_WORKER_URL/render" -H 'Content-Type: application/json' -d '{}'`
      answers `401 {"errorCode":"signedOut"}`. No session, no work.
- [ ] The same call with a session and `{"model":"claude", ...}` answers
      `400 {"errorCode":"badRequest"}`. Claude is not a model this worker knows,
      **AC-1**.
- [ ] A successful `/render` response body is `{"path":"..."}` and nothing else.
      No `prompt` key, **AC-4**.

## Deploy order

- [ ] The client shipped before the worker was replaced, per the migration plan.
      If the worker went first, every render in that window failed as
      `badResponse` with the image written anyway, so check for orphaned files
      under `renders/` before moving on.
- [x] `visionFailed` and `visionRefused` were removed only after the new worker
      was live and proven, not alongside the rest of the client changes.

## Worth doing properly whatever else gets waived

Two steps carry the risk in this change and neither is provable by reading code:

- **The dark plan contrast check.** The 8.13:1 figure is computed, not observed,
  and it assumes the scrim renders at the alpha the CSS asks for. One look at a
  real dark upload settles it.
- **The geometry check against the original plan.** Whether the model actually
  respects the strict requirements in the prompt is the entire premise of this
  change, and it is the one thing no amount of code review can tell you.
