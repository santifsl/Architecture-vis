# 0006 rationale: create a project and generate the 3D render

The decision itself, and everything a build needs, is in
[`index.md`](index.md). This file is the record of why.

## Context

> ⚠️ Premise note: the scope says a project "generates against whichever
> model(s) were selected, Claude, Gemini, or both", and the record already has a
> `renders` map keyed by `ModelId` with a path and a URL per model. Read
> literally that means each model paints an image. Claude cannot. Puter reaches
> image generation only through `puter.ai.txt2img`, an image model call, and
> Claude is reachable only through `puter.ai.chat`. The feature therefore cannot
> be built as written, and the choice is not a detail of implementation: it
> decides what the product is actually comparing. That is the first question
> this spec answers, and the scope's wording needs correcting to match whatever
> it decides.

Features 1 through 5 built everything around the render and nothing of it. Auth
resolves at boot, the project record and its per model state machine exist and
are enforced, the design system is closed and checkable, and a floor plan can be
uploaded and hosted by path. `VITE_PUTER_WORKER_URL` has been required at
startup since feature 1, and nothing has ever been deployed behind it. This
feature is where the product either works or does not.

Three forces shape it.

**The platform decides more than the design does.** Puter is the whole backend,
and its actual capabilities were read from the installed SDK rather than assumed
from the scope: `txt2img` accepts `input_image`, a `model`, a `ratio`, a
`quality` tier, and `puter_output_path`; `chat` accepts an image by URL, by
`File`, or by `puter_path`; a worker handler receives `{ request, user, params }`
and `user.puter` acts as the caller, billed to the caller. Every one of those
facts landed in the design, and one of them, that Claude has no image output,
overturned the feature's premise.

**Paths mean different things on different sides of the worker boundary.** A
relative Puter path resolves against the calling app's data directory. Feature 5
stores plans at `plans/<id>-<name>.<ext>`, relative, resolving against this app's
directory. A worker runs under its own app identity, so the same string inside
the worker points somewhere else. This is the kind of mistake that compiles,
deploys, and then produces a render nobody can find.

**Nothing about a render is fast or reliable.** Two model calls per render, no
published worker timeout, a browser tab that can close at any moment, and two
models running at once that must not be able to touch each other's state. The
record's per model status was designed for exactly this, and this feature is the
first thing to actually rely on it.

## Options considered

### Option 1: keep the scope literally, drop Claude

Compare two models that can genuinely paint, for instance a Gemini image model
against an OpenAI one, both doing image to image from the plan.

**Pros**

- The simplest possible pipeline: one call per render, no intermediate artifact.
- Fastest, cheapest, and the least that can go wrong.

**Cons**

- Contradicts the scope, CLAUDE.md, and the `ModelId` union in
  `app/projects/record.ts`, all of which name Claude.
- Throws away the more interesting comparison. Two image models differ mostly in
  rendering style; two reasoning models differ in how they understand a plan,
  which is the thing a person actually wants to know.

### Option 2: both models write the scene, one shared model paints it (chosen)

Each selected model reads the plan through a vision chat call and writes a
detailed prompt describing the space. Both prompts go to the same image model,
with the plan as the input image.

**Pros**

- Both models genuinely contribute, and both are used at what they are good at.
- Identical pipeline on both sides, so a difference between two renders is a
  difference between the models rather than between two code paths.
- The prompt is a real artifact worth keeping: it explains the difference the
  comparison view exists to show.

**Cons**

- Two stages, so roughly twice the latency and twice the failure surface.
- A weakness in the shared painter appears in both renders and is
  indistinguishable from a weakness in the reading.
- "Claude rendered this" becomes a claim the UI has to phrase carefully.

### Option 3: asymmetric, Gemini paints directly, Claude goes through a painter

Gemini's own image model does image to image from the plan; Claude writes a
prompt that a separate image model paints.

**Pros**

- Uses each model at its strongest, and is one call shorter on the Gemini side.

**Cons**

- The two renders come from different pipelines, so any difference between them
  may be the pipeline rather than the model. That undermines the one thing the
  product is selling.
- Two code paths, two failure vocabularies, two sets of options to tune.

## Rationale

**Why option 2.** The product's value is the comparison, and a comparison is
worthless if the two sides are not made the same way. Option 3 reads as the
pragmatic choice and is the trap: the moment the two renders differ, nobody can
say whether that is Claude versus Gemini or one pipeline versus another, and the
feature stops answering the question it exists to ask. Option 1 answers a
question nobody asked. Option 2 costs a second call per render and one honest
sentence in the interface, and in exchange every difference on screen is
attributable.

**Why the worker stays stateless and the client owns the record.** Spec 0002
named `app/projects/store.ts` as the only writer of the owner's store, and put
the invariants, the size check, and the legal transition check behind that one
door. A worker writing through `user.puter.kv` would be a second writer that
cannot reuse any of it, and the two would drift the first time a rule changed.
The worker taking a path and returning a path is also the smallest possible
contract, which matters because the worker is the piece with no types, no lint,
and no local run.

**Why the client awaits rather than polls.** A polling design survives a closed
tab only if something keeps running after the response, and nothing guarantees a
serverless worker does. So polling would buy a loop, a second source of truth
about status, and the same stuck job problem anyway. Awaiting one request per
model, each with its own timeout, gives the per model independence AC-2 demands
for free, and the ten minute stale rule handles the abandoned case honestly
without a background process. The real cost is named plainly in Consequences:
work already paid for can be lost.

**Why the write direction gets proved first.** Whether a worker running as its
own app may write into this app's data directory under the caller's permissions
is not documented, and it is the hinge the whole storage story hangs on. Guessing
right saves an hour; guessing wrong is discovered late, after the code that
depends on it is written. A throwaway `/probe` route costs one deploy and turns
the unknown into a recorded fact, with the fallback (the worker returns the bytes
and the client writes them, exactly as feature 5 writes a plan) already chosen in
case the answer is no.

**Why gpt-image-1-mini at medium.** It is `txt2img`'s default family, and using a
third party as the painter keeps either compared model from being on both sides
of its own render. Medium is the judgment call: low is visibly poor on interiors
and high roughly doubles what a two model generation takes out of someone's
monthly allowance for a difference most people will not see on a card. It sits in
one named constant so a swap after seeing real output is one line, which is the
right shape for a choice that should be revisited with evidence rather than
argued about now.

## The `/probe` result

**Yes. A worker running under its own app identity can write into the caller's
app data directory as the caller. The primary design holds and the fallback was
not needed.**

What was tried. A throwaway `POST /probe` route was deployed as part of the real
worker, taking an absolute `out` path under `renders/`. It called
`user.puter.fs.write(out, "roomify probe", { overwrite: true, dedupeName: false,
createMissingParents: true })`, read the file back with `user.puter.fs.read`,
compared the text, and deleted it. Reading back rather than trusting the write
to not throw is what makes the answer mean something: a `true` says the bytes
were really there afterwards.

What came back. `200 {"wrote":true}`, against a real signed-in session and the
deployed worker at `https://architecture-vis-roomify.puter.work`.

What it settles. `user.puter` really is the caller's own Puter, for writes and
not only for reads and model calls, so the render lands in the caller's storage
by the worker writing it directly. `txt2img`'s `puter_output_path` therefore
works as the design assumed, the image bytes never travel back through the
worker, and AC-4 and AC-12 stand as written. The recorded fallback, the worker
returning bytes for the client to write exactly as feature 5 writes a plan, is
not needed and is kept in this document only as history.

The route has since been deleted from `worker/roomify.js` and the worker
redeployed without it, which is the whole of its intended life. Getting it live
took three attempts and taught more than the question did: see `scope.md`'s
feature 6 entry on Puter's global app and worker name namespaces, and on why
`apps.get` is not an ownership test.

## References

**Project sources**

- `app/projects/record.ts` and `app/projects/invariants.ts`, the `RenderState`
  shape, the legal transitions, and the runtime parser that `prompt` must be
  added to in both places.
- `app/upload/store.ts`, the promise cache for minted URLs that build task 4
  moves out to be shared, and the failure vocabulary shape reused here.
- `app/platform/puter.ts`, `withPuter` as the only doorway to the SDK, and
  `PuterGateError` as the signed out signal.
- Spec [0002](../0002-project-records-and-public-feed-index/index.md), the
  record, the store A single writer rule, and the worker API surface feature 9
  extends.
- Spec [0005](../0005-upload-and-host-a-floor-plan/index.md), storing a path
  rather than an expiring URL, and the correction habit this spec follows.
- Spec [0004](../0004-design-system-tokens-and-states/index.md), the busy
  hairline and the six state requirement.
- `CLAUDE.md`, the thin working slice first, the worker rather than direct model
  calls, no raw provider errors, and `frontend-design` invoked for UI work.
- The installed SDK, read directly rather than from memory:
  `node_modules/@heyputer/puter.js/src/modules/ai/image.js` and
  `.../ai/types.js` for the `txt2img` options including `input_image` and
  `puter_output_path`, and `.../Workers.js` for `exec` attaching the session and
  `x-puter-no-auth` removing it.

**Practices and standards**

- A stateless service with a single stateful owner, so invariants live in one
  place.
- Prove the load bearing unknown with a throwaway spike before building on it.
- Fail closed at a trust boundary: reject a path that is not provably inside the
  caller's own directory rather than resolving it and hoping.
- Never show a raw upstream error; map to a closed set of internal codes at the
  boundary.

**Links** (verified during this design conversation)

- Puter workers router and handler shape: https://docs.puter.com/Workers/router/
- `puter.workers.exec` and the session it attaches: https://docs.puter.com/Workers/exec/
- `puter.workers.create`: https://docs.puter.com/Workers/create/
- The user pays model: https://docs.puter.com/user-pays-model/
- `puter.ai.txt2img`: https://docs.puter.com/AI/txt2img/
- `puter.ai.chat`, including passing an image by `puter_path` and the
  `claude-sonnet-4-6` model id: https://docs.puter.com/AI/chat/
