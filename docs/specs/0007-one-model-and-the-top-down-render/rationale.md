# 0007. Rationale

The reasoning, the options weighed, and the evidence behind
[`index.md`](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: dropping Claude removes the product's stated differentiator,
> not just a checkbox. `scope.md` opens with "pick Claude, Gemini, or both", and
> spec 0006 spent its whole design budget making a two model comparison honest:
> the model parity rule, one shared painter so neither model was handicapped, the
> stored scene prompt, the scene note on the page, and the line under the plates
> explaining that what differed was the reading and not the brush. All of that
> was built. What remains after this spec is a floor plan going into one model
> and a picture coming out, which is a smaller product than the one the scope
> describes. That is a legitimate thing to want, and the tutorial's approach is
> genuinely better at the actual job of matching a plan's geometry, but it should
> be chosen knowingly rather than arrived at. The right framing is that Roomify
> is now a floor plan to render tool, and the multi model comparison was a
> premise that did not survive contact with what the models can actually do.
>
> A second, smaller correction: the request for this revision assumed feature 8
> is a side by side comparison of two models' interpretations and therefore dies
> with the second model. It is not. `scope.md` line 765 defines feature 8 as a
> slider between the original floor plan and its rendered counterpart, so it
> survives untouched, and the top down square render actually makes it easier to
> build. The two model framing for feature 8 exists only in spec 0006's
> commentary and in one comment inside `record.ts`, and those are prose fixes.

Three changes arrived together, decided outside the conversation that produced
spec 0006, and each one pulls on something already shipped.

The first is that Gemini becomes the only model. `ModelId` is a union of two, and
that union is load bearing in more places than it looks: `models`, `renders`,
`PublicAssets.renderUrls` and `FeedEntry.renderUrls` are all keyed by it,
`checkRendersMatchModels` enforces an exact correspondence between two of those,
and `parseProject` refuses any record naming a model id it does not recognise.
So removing a member of the union is not a type edit, it is a change to what
counts as a readable stored record.

The second is that the two stage render goes. Spec 0006 built it because Claude
cannot produce an image and Gemini can only be reached for images through a
separate call, so the only way to compare two models was to have each one write a
description and let one shared image model paint both. With one model that
justification evaporates entirely, and the stage survives or dies on its own
merits rather than on the comparison it was built to enable.

The third is the render style. An eye level photorealistic interior was what the
old instruction asked for, and it makes a picture that cannot be checked against
the drawing it came from. A top down orthographic view with matching geometry
can be.

The fourth force is smaller but real: the project page currently reserves two
16:9 frames in a two column grid, and one plate in a two column grid is a layout
that has to change whatever else happens. So the busy state was going to be
touched anyway.

## Options considered

### Decision A: what shape the record keeps

**Option 1: keep the per model map, `ModelId` becomes a union of one.**

`MODEL_IDS` holds one entry, everything keyed by `ModelId` keeps its map shape,
and every invariant keeps working because a one member set is still a legal input
to all of them.

**Pros**

- No invariant in `invariants.ts` changes structure, so the file most likely to
  break silently is barely touched.
- Feature 9 builds against the `FeedEntry` and `PublicAssets` shapes it was
  already designed for.
- A second model is one line away if this decision is ever reversed.

**Cons**

- The machinery says many where the product says one, permanently.
- `checkRendersMatchModels` now enforces a correspondence that cannot fail.

**Option 2: collapse to a single `render`.**

Drop `ModelId` and `models` entirely, give a project one `RenderState` and one
`renderUrl`.

**Pros**

- Honest. The types would say exactly what the product does.
- Meaningfully less code: one invariant deleted, two simplified.

**Cons**

- Rewrites invariants that shipped and were reasoned about carefully, in the same
  change that is already rewriting the schema.
- Hardcodes the one model assumption into feature 9's `FeedEntry` before feature
  9 exists, which is deciding a future feature's shape as a side effect.

### Decision B: what happens to records already stored

**Option 1: accept the break silently.** No code change; a record naming Claude
just stops parsing and disappears from its gallery. Free, but the refusal happens
for an incidental reason (a stray model id) rather than a stated one, and nothing
records that it was expected.

**Option 2: bump `SCHEMA_VERSION` to 2.** Same visible outcome, but the refusal is
now deliberate and legible: a version 1 record is refused because it is version 1.
Costs one line, and gives a future migration something to hang off. `prompt`
leaving `RenderState` is independently a stored shape change, so the bump is owed
regardless.

**Option 3: migrate on read.** Teach `parseProject` to drop a legacy `claude` key
and keep the Gemini half. Preserves real data, at the cost of a tolerance branch
in the strictest function in the codebase, which is the one place this project has
twice been bitten by leniency.

### Decision C: one call or two

**Option 1: keep both stages.** Gemini reads the plan, writes a scene, and
`gpt-image-1-mini` paints it. Keeps `prompt` populated and the scene note on the
page, which is the only artifact that explains a render.

**Pros**

- The page can account for a render rather than just display it.
- The instruction the painter receives is adapted to the specific plan.

**Cons**

- Two provider calls, two latency budgets, two failure surfaces, for a
  justification (comparability) that no longer exists.
- Prose is a lossy channel for geometry. A paragraph describing a floor plan
  cannot carry wall positions, and geometry fidelity is now the point.

**Option 2: one direct image to image call.** The plan goes straight to a Gemini
image model with a fixed top down instruction.

**Pros**

- Half the calls, half the cost, half the failure surface.
- The model sees the drawing rather than a description of it, which is the right
  channel when the requirement is that walls do not move.
- Matches the tutorial's own approach, which is where the requirement came from.

**Cons**

- `prompt` becomes dead weight and the scene note leaves the page.
- No per plan adaptation of the instruction at all.
- One model, one provider, one point of failure.

### Decision D: how the busy state is drawn

**Option 1: the plate becomes the plan.** Full width frame holding the blurred
plan and the message, key hidden for that period. Chosen. One thing to look at,
no duplicate drawing, and the frame's reserved ratio means nothing moves when the
render lands.

**Option 2: keep the key, blur the plate.** Simplest to reason about, nothing
appears or disappears, but the same drawing is on screen twice, once small and
sharp above a large blurred copy of itself.

**Option 3: full sheet treatment.** The most cinematic and the furthest from the
understated register spec 0004 committed to.

On the blur mechanics, `filter` plus a fixed opacity scrim beat `backdrop-filter`
because the scrim makes contrast a property of the page rather than of the
upload, and `transform: scale()` can hide the blur's soft edges in a way a
backdrop filter cannot. A floating text plaque was the runner up and would have
kept more of the plan visible, but it guarantees contrast only inside the plaque.

## Rationale

**Keeping the map (A1) is chosen because the risk sits in the wrong place
otherwise.** `invariants.ts` is the file this project has twice been caught by:
spec 0005 dropped `FloorPlan.url` and the parser had to change with it or every
gallery went empty, and spec 0006 found `checkProject` demanding a `url` that
would have made every render it produced illegal to store. Both were failures of
the parser and the type drifting apart. This change already forces `prompt` out
of both halves; rewriting three invariant functions in the same commit doubles
the exposure to exactly that failure mode for a benefit that is aesthetic. The
honest shape is worth having, but it is worth having as its own change, once the
one model decision has proven stable.

**The version bump (B2) is chosen because the break happens either way and only
one option explains itself.** `prompt` leaving `RenderState` changes the stored
shape on its own, so `SCHEMA_VERSION` is owed whatever is decided about Claude.
Given that, the choice is between a record refused for a stated reason and one
refused for an incidental one, and `schemaVersion` exists precisely so a shape
this build does not understand is a refusal rather than a guess. Migrating on
read was tempting and is the right answer with real users; there are none.

**One call (C2) is chosen because the requirement changed underneath the two
stage design.** Two stages existed to make two models comparable on how they read
a plan. With one model there is nothing to compare, and what is left is a
requirement, geometry must match the drawing, that prose is actively bad at
carrying. A paragraph cannot say where a wall is. The image model looking at the
drawing itself can. Losing the scene note is a real cost and it was the page's
signature element, but it was evidence for a comparison that no longer happens.

**On the model id**, spec 0006's own selection rule (native provider prefix, not
a preview, nearest generation rather than newest) was applied to the image model
list instead of the chat list and picked `google:google/gemini-2.5-flash-image`
cleanly. That the rule survives being pointed at a different list is a small piece
of evidence that it was a good rule. Notably, no `google:` prefixed Gemini image
model existed on the **chat** list at all; the image ids there sit behind
`infron:` and `openrouter:` routers, which the parity rule would have excluded.
Only the image list carries the native one, which is why checking the right
endpoint mattered.

**On dropping `quality` and `ratio`**, the conservative call is to send the
minimum that is known to work and add options back once a real call confirms they
are accepted. An option that a provider rejects surfaces as `paintFailed` on every
single render, and the sentence behind that code says "try it again", which would
send someone in a loop against a request that can never succeed. Reserving the
frame at 1:1 with `object-fit: cover` means a non square return crops rather than
breaking anything, so nothing is blocked on the answer.

**On the busy state fitting spec 0004 rather than replacing it.** Spec 0004's
state 6 is the accent at reduced opacity plus a hairline sweep, never a spinner,
and that is a rule about the _signal_. The blur and the message are a treatment of
the _content_ inside the frame. Keeping the sweep underneath means the app still
has exactly one busy signal shared by buttons, the boot rule and the plate, and
the six states are extended rather than contradicted. The alternative, dropping
the sweep here, would have made the plate the one place in the app that says busy
in a different language.

## Evidence

### Puter image model list, fetched 2026-08-31

`GET https://api.puter.com/puterai/image/models` answers without a session and
returned 63 models. The Gemini and Google entries:

```
google:google/gemini-2.5-flash-image          <- chosen
google:google/gemini-3-pro-image-preview      preview
google:google/gemini-3.1-flash-image-preview  preview
google:google/gemini-3.1-flash-lite-image     lite tier
google:google/imagen-4.0 / -fast / -ultra     not Gemini
togetherai:google/flash-image-2.5             router prefix
togetherai:google/flash-image-3.1             router prefix
togetherai:google/gemini-3-pro-image          router prefix
```

`gpt-image-1-mini`, the painter spec 0006 pinned, is on the same list as
`openai:openai/gpt-image-1-mini`, so the list is the right one and the ids on it
are the ids `txt2img` takes.

The **chat** list (`GET https://api.puter.com/puterai/chat/models`, 852 models)
carries `infron:google/gemini-2.5-flash-image` and
`openrouter:google/gemini-2.5-flash-image` but no `google:` prefixed image
capable id. Spec 0006's model parity rule excludes router prefixes, so checking
only the chat list would have produced either a rule violation or a false
conclusion that no suitable model existed.

`GET https://api.puter.com/puterai/txt2img/models` does not exist and answers
`404 not_found`. The image list is served at `/puterai/image/models`.

### Contrast calculation for the scrim

Worst case ground: `--color-bone` (`#faf8f4`) at 72% over a solid black plan,
compositing to `#b4b2b0`. Relative luminance 0.4467. `--color-ink` (`#1c1b19`)
has relative luminance 0.01108. Contrast ratio `(0.4467 + 0.05) / (0.01108 +
0.05)` = **8.13:1**, against a 4.5:1 baseline. A normal pale floor plan lands far
above this floor. Same method spec 0004 used when it recomputed the two failing
tokens.

### First real render, 2026-08-31, after the one-call worker was deployed

The deploy settled build task 2's three open questions. Recorded here rather
than only in the conversation, the same habit the `/probe` result got.

- **The model id works through `txt2img`.** `google:google/gemini-2.5-flash-image`
  accepted the call and wrote the image to `puter_output_path`, so the path in,
  path out shape holds and the client's `parseRenderResponse` matched the echoed
  path.
- **The geometry premise holds.** The render came back top down with walls
  following the uploaded plan. This is the one thing no code review could answer
  and the entire reason for the change.
- **The output is square: 628x628.** It matches `.plate-frame`'s `1 / 1` exactly,
  so `object-fit: cover` crops nothing in practice. AC-8's reserved square was the
  right call.

**What this does NOT settle, and the distinction matters.** The deployed worker
passes **no `ratio` and no `quality` at all**; spec 0007 deliberately left both
out until a real call had been made. So the 628x628 is this model's own default
for a square-ish input, not evidence that `ratio: { w: 1, h: 1 }` is accepted.
The question "does this model honour `ratio`" is still open, because nothing has
ever sent it one.

That is a good outcome rather than a gap. The frame and the model already agree
without an option being passed, so adding `ratio` back would buy nothing
observable while reintroducing exactly the risk the omission was protecting
against: an option this model rejects turns into a `paintFailed` on every render
with nothing in the message saying why. The follow-up item is therefore answered
in the sense that matters, and the recommendation is to leave both options off
unless a non-square output actually shows up.

### Cross check, 2026-08-31

A second model read the drafted spec against the real code. Seven findings, all
folded into `index.md` and `verify.md` before the spec was accepted. The four
worth remembering, because each is a mistake that would have surfaced only during
the build:

- **The contrast fix would have broken the build.** `check-contrast.mjs` measures
  `--color-clay` as a focus ring at 3:1 against every entry in `SURFACES`, not
  just text at 4.5:1. Clay on the scrim ground is about 2.64:1, so the obvious
  change (add `scrim-ground` to `SURFACES`) fails `npm run verify` for a pairing
  that cannot occur, since the overlay holds nothing focusable. Hence the third
  bucket, `TEXT_ONLY_SURFACES`.
- **The build plan inverted its own migration plan.** The migration says deploy
  the client first; the numbered tasks deployed the worker in task 2 and only
  dropped `parseRenderResponse`'s `prompt` requirement in task 3. Exercising task
  2's real render through the app would have hit `badResponse` on every attempt
  with the image written anyway. The parser change moved into task 1.
- **"No window in which the chosen order is broken" was overstated.** In the gap
  between the client shipping and the worker being replaced, the old worker can
  still answer `visionRefused` to a client that has already deleted the code, and
  the accurate sentence degrades to the generic fallback. So the two codes are
  deleted last, after the deploy, not with the rest of the client changes.
- **Two stale comments no grep catches.** The `RENDER_ASPECT_RATIO` comment in
  `rules.ts` and `RenderPlate.tsx`'s file header both explain the deleted
  `PAINTER` and its 16:9, and contain neither `prompt` nor `claude`, so every
  grep in `verify.md` missed them. They have their own check now.

Three claims it confirmed rather than corrected: a version 1 record fails on the
version check before any field parsing, so there is no partial parse crash; the
`::after` sweep paints above the overlay's real DOM children without needing a
`z-index`, because a pseudo element paints after them in the same stacking
context; and there is no missed caller of `prompt`.

## Corrections made during the build

### `TEXT_ONLY_SURFACES` had to name its inks, not take all of them

The busy state section above specifies a third bucket in
`scripts/check-contrast.mjs`, `TEXT_ONLY_SURFACES`, "whose members are measured
for text contrast and skipped by the ring check". The skipped ring check is
right, and the reason given for it is right: clay measures 2.64:1 on the scrim
ground, under `RING_MINIMUM`, and a focus ring cannot appear over the scrim
because the overlay holds no interactive element at all.

The arithmetic during the build showed the same argument reaches further than
this spec took it. Measured against `--color-scrim-ground`:

| Token                    | Measured | Minimum | Ever painted there?   |
| ------------------------ | -------- | ------- | --------------------- |
| `--color-ink`            | 8.14:1   | 4.5:1   | Yes, `.plate-message` |
| `--color-ink-soft`       | 2.61:1   | 4.5:1   | No                    |
| `--color-clay` as text   | 2.64:1   | 4.5:1   | No                    |
| `--color-clay` as a ring | 2.64:1   | 3:1     | No                    |

A bucket that measures every text token against this ground fails
`npm run verify` on three pairings rather than one, and all three are impossible
for the same reason: the overlay is one paragraph in one colour. So the bucket is
implemented as a surface mapped to the closed set of inks that actually appear on
it, `{ "scrim-ground": ["ink"] }`, rather than as a surface name alone.

This keeps the guarantee the decision was made for, and it is the reason the
token exists rather than a comment: change `--color-ink`, or change
`.plate-veil`'s 72% and with it `--color-scrim-ground`, and the build fails
instead of a person quietly failing to read the message. It also keeps the
naming honest as a claim rather than an exemption. `ink` is listed because
`.plate-message` sets `--color-ink`; a second colour in the overlay has to be
added to the list before it is measured, so the list is what has to be kept
true, and `checkClassification` fails loudly if a name in it stops existing.

Unchanged: if the overlay ever gains a focusable control, move the token into
`SURFACES` and recompute rather than keeping the exemption.

Measured output of `npm run contrast` after the change, 9 pairs, all clear:
`--color-ink` on `--color-scrim-ground` at **8.14:1** against a 4.5:1 minimum.
The 8.13:1 computed at design time and the 8.14:1 measured here differ only in
the rounding of the composite, which the spec's `#b4b2b0` takes downward and so
conservatively.

## References

**Project sources**

- `CLAUDE.md`: no test runner and no browser automation, so verification is a
  hand walkthrough; the `frontend-design` plugin must be invoked directly for UI
  work; Puter's current docs over training data; tracer bullet ordering.
- Spec 0002, the `ModelId` field and the per model record shape being superseded.
- Spec 0004, the six interaction states, the two recomputed color tokens, and the
  rule that every text token clears 4.5:1 against both surface tones.
- Spec 0006, the model selection rule reapplied here, the two stage render being
  replaced, and the `FloorPlan.url` correction pattern this spec follows.
- `app/projects/invariants.ts`, the two recorded incidents of a type and its
  parser drifting apart.
- The `react-router` skill at `.agents/skills/react-router/`, framework mode.

**Practices and standards**

- WCAG 2.1 contrast minimum of 4.5:1 for body text, computed above rather than
  assumed.
- Decorative images carry an empty `alt`; a single live region per announced
  state change.
- Deploy the consumer before the producer when a response field is being removed,
  so no deployed client ever sees a response it rejects.
- Pin an exact model snapshot rather than a moving alias, so the output cannot
  change underneath the product without a commit.

**Links** (fetched and confirmed during this design)

- Puter image model list: https://api.puter.com/puterai/image/models
- Puter chat model list: https://api.puter.com/puterai/chat/models
