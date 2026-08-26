# Scope: Roomify

Upload a 2D floor plan, pick Claude, Gemini, or both, and get back a
photorealistic 3D render of the space. Every upload and render gets permanent
hosting with a real public URL, every project persists in a personal gallery,
and a project can be made public to sit in a shared community feed. Over
time that feed becomes the place anyone can browse to see what the tool
actually produces.

Build it in a thin, working slice first, one floor plan actually reaching a
model and coming back as a hosted render, before making any single part of
it fuller. Then thicken it piece by piece. Before building anything, decide
what you're doing and why in a few plain sentences, then build it, and if
the plan turns out wrong once it's actually built, say so and fix the plan
too, not just the code.

Whenever a "build it" style step actually gets underway, break it into its
own short list of what's genuinely being done, and check each part off as
it's finished, right in this file. That way this file can be opened fresh, in
a brand new conversation, and it's obvious what's already done and what's
still left, without anyone re-explaining the feature from scratch.

## Stack

Already decided, nothing open here: React 19, React Router v8 in framework
mode (the `@react-router/dev` Vite plugin, `app/routes.ts` route config, route
modules with generated `./+types/*` types), running as a **static SPA**
(`ssr: false`), Vite, TypeScript, TailwindCSS v4.

No traditional backend: Puter is the entire server-side surface, auth,
permanent file storage, a key-value database, serverless workers, and hosted
AI models, all called from the client through the Puter.js SDK. Claude and
Gemini are both wired in as render options, called through the same worker
rather than two separate integrations.

## Deployment

Static SPA on Vercel. Not SSR, and that follows directly from the stack
above rather than being a separate preference.

Puter.js is a client-only SDK. Auth holds a session in the browser, `puter.fs`
and `puter.kv` are called from the browser against Puter's own servers, and
the render worker is invoked from the browser too. There is no data a server
of ours could fetch that the client can't fetch itself, no secret to keep off
the client (Puter meters the model calls against the signed-in user, not
against a key we hold), and no request a Node process would add anything to.
Running a server would mean paying for a hop that does nothing but forward.

What that means concretely:

- `react-router.config.ts` sets `ssr: false`. React Router still renders the
  root route **at build time** into `build/client/index.html`, so
  `@react-router/node` stays a dependency and every route must remain
  SSR-safe: no `window`, `document`, or `puter.*` during the initial render.
  Puter has to be reached from an effect or an event handler, never at module
  scope or in a render body. This is the one real constraint the SPA choice
  puts on feature code.
- `build/client/` is the deployed artifact. A `build/server/` directory is
  still emitted as a build-time byproduct of that root-route render; it is
  not deployed and nothing runs it.
- Only `clientLoader` and `clientAction` are available. A server `loader` in
  any route other than root is not supported in SPA mode.
- `vercel.json` rewrites every path to `/index.html`. Without it, any URL
  other than `/` 404s on a hard refresh once there is more than one route.
- There is no `npm run start` and no Dockerfile. There is no server to start.

Reversible if it ever needs to be: flipping `ssr` back to `true` restores
server rendering without changing any UI, which is exactly why this is a
cheap decision to make now.

## At a glance

| #   | Feature                                              | Phase      | Status      |
| --- | ----------------------------------------------------- | ---------- | ----------- |
| 1   | Connecting to Puter                                  | Foundation | not started |
| 2   | Coding standards & tooling                           | Foundation | not started |
| 3   | Data model                                           | Foundation | not started |
| 4   | Design & look                                        | Foundation | not started |
| 5   | Upload & host a floor plan                           | Slice 1    | not started |
| 6   | Create a project & generate the 3D render            | Slice 1    | not started |
| 7   | App shell & project gallery                          | Slice 2    | not started |
| 8   | Side-by-side comparison view                         | Slice 3    | not started |
| 9   | Public/private visibility & the community feed       | Slice 4    | not started |
| 10  | Export                                               | Slice 4    | not started |

## Foundation

### 1. Connecting to Puter · needs a decision

The Vite project itself gets created manually first, `npm create vite@latest`,
fast and simple, no reason to spend agent time or tokens on something that
easy.

The real decision here is how the app authenticates a user through
`puter.auth`, and how the rest of the app treats "signed in" as a fact it can
trust everywhere, the navbar, the gallery, the create-project flow, without
re-checking it in five different places. Decide that shape once, then wire
`puter.fs`, `puter.kv`, and `puter.workers` into the project alongside it,
since all four are really one connection to the same platform.

- [ ] Decide the approach
- [ ] Write the spec

### 2. Coding standards & tooling

Write down the real conventions for this project once it actually exists,
then install linting, formatting, and a pre-commit hook that actually
enforces them. See `docs/coding-standards.md` for the long version, already
written ahead of the tooling it describes.

- [ ] Decide the approach
- [ ] Install lint, format, and whatever else is needed, and write it up in
      `docs/coding-standards.md`

### 3. Data model · needs a decision

There's no relational database here, Puter's KV store is the only
persistence layer, so the "data model" is really the shape of the keys and
values everything else depends on: a project record (owner, name, the
floor-plan file URL, the render URL or URLs if both models ran, which
model(s) were used, a status per model, public or private, timestamps), and
however the community feed actually finds public projects without scanning
every key a user has ever written. That lookup shape is worth deciding
carefully now, since it's the one part of a KV store that doesn't come for
free the way a relational query would.

- [ ] Decide the approach
- [ ] Build it

### 4. Design & look

A near-monochrome, gallery-quality palette: bone/ivory backgrounds
(`#FAF8F4` background, `#EFEBE3` surfaces), near-black warm ink for text
(`#1C1B19` primary, `#8A8478` secondary), a barely-visible hairline border
(`#E3DED3`), and exactly one accent, a deep burnt-clay orange (`#B5551F`),
used only for things you interact with, buttons, links, the upload/generate
call to action, focus states, nothing else.

A generation-in-progress state is the same accent color at roughly 55%
opacity rather than a second hue, the accent quietly recedes while working
instead of competing with a different color. An error is the same primary
ink color plus a thin accent-outlined icon with no fill, no red, no alert
box, errors here read as understated, not urgent. There is no dedicated
color for public versus private, that's a fact about a project, not a status
that needs alarm-style signaling, it's shown with a label or an open/closed
icon in the existing text colors.

Because the palette is this quiet on purpose, the uploaded floor plan and
the AI-rendered image are the only genuinely saturated things on any screen,
that's deliberate, not an oversight to fix later.

#### Structural reference for the home screen

Adapted from the real Roomify tutorial project, not copied from it.

The real project's home screen: navbar, then a hero section with a
pill-shaped announcement badge (pulsing dot + text), a headline, a subtitle,
two CTAs side by side (a text link and an outlined "Watch Demo" button), and
an upload card sitting directly under the hero with a decorative
grid-pattern background behind it. Below that, a "Projects" section: a grid
of cards, each showing an image, a "Community" badge, the project name, and
a clock-icon-plus-date-plus-author meta line.

Our version keeps the good structural bones and cuts the generic-SaaS
decoration that doesn't fit the palette's restraint:

- **No pill badge with a pulsing dot**, in the navbar or the hero. That's a
  startup-launch decoration that fights the near-monochrome, gallery-quality
  restraint already decided above.
- **One CTA in the hero, not two.** The upload card sitting right there in
  the hero already is the demo; a separate "Watch Demo" button is a
  marketing-site reflex this product doesn't need.
- **The upload card keeps its icon, heading, file-type note, and drop
  zone**, but no decorative grid-pattern background behind it. A plain
  hairline border (`#E3DED3`), consistent with every other surface in the
  app, replaces it.
- **The projects grid keeps the card-grid shape** (image, name, date) but
  drops the "Community" badge from every card. That word is reserved for the
  actual public community feed (feature 9); a personal gallery showing your
  own private projects should never imply they're already shared. The meta
  line under each card shows something specific to Roomify instead of a
  generic clock-and-author line: which model rendered it (Claude, Gemini, or
  both), or a small before/after thumbnail pair.

This section governs feature 5 (Upload) and feature 7 (App shell & gallery)
the way the sketches governed LLM Arena's arena screen, leaderboard, and
models page: it's structure only. Nothing here overrides the palette,
typography, or accent rules already decided above.

- [ ] Decide the approach
- [ ] Build it

## Slice 1: Core render loop

### 5. Upload & host a floor plan

A user uploads a 2D floor plan image. It's written to permanent storage
through `puter.fs`, which returns a real public URL, that URL is what
everything downstream (the worker, the KV record, the comparison view) 
actually points at, never a local blob URL that dies when the tab closes.

The upload card's layout is governed by feature 4's structural reference for
the home screen: icon, heading, file-type note, drop zone, hairline border,
no grid-pattern background.

- [ ] Decide the approach
- [ ] Build it

### 6. Create a project & generate the 3D render

The heart of the product. A project is created once a floor plan is hosted,
and generation kicks off against whichever model(s) were selected, Claude,
Gemini, or both, through a Puter serverless worker rather than calling a
model directly from the browser. Each model's render, if both are running,
proceeds and fails independently, exactly like Roomify's own two-model
option implies, one being slow or erroring never blocks or corrupts the
other. The project's KV record tracks a status per model (pending, complete,
failed) so the gallery can show real progress rather than a single spinner
that hides which one is actually done.

- [ ] Decide the approach
- [ ] Build it

## Slice 2: App shell & gallery

### 7. App shell & project gallery

The frame everything else sits inside: a navbar, and a personal gallery of a
signed-in user's own past projects, each card showing its floor plan
thumbnail, its render (or its in-progress state) and which model(s) it used.
This is what makes the tool feel like a real workspace across visits, not
just a single one-off generation.

The navbar and the card grid are governed by feature 4's structural
reference for the home screen: no pill badge, no per-card "Community" badge,
and a meta line naming the model(s) rather than a generic clock-and-author
line.

- [ ] Decide the approach
- [ ] Build it

## Slice 3: Comparison

### 8. Side-by-side comparison view

An interactive view, a slider or toggle, between the original floor plan and
its AI-rendered counterpart. This is the one place besides buttons/links
that the accent color is allowed to appear on, since the slider itself is an
interactive element, the images on either side never get their own tinted
frame or border, they carry the visual distinction on their own.

- [ ] Decide the approach
- [ ] Build it

## Slice 4: Sharing & export

### 9. Public/private visibility & the community feed

A project owner can flip a project public or private at any time. Public
projects show up in a global community feed anyone can browse, without
needing an account, that's what actually makes the feed work as discovery.
Only creating a project and toggling its visibility need sign-in. The
owner's own view is identical to what anyone else sees, plus the ability to
actually edit or regenerate.

- [ ] Decide the approach
- [ ] Build it

### 10. Export

A way to download a generated render at full resolution for use outside the
app, a presentation, a portfolio, a client deck. Straightforward once the
render already has a permanent public URL from feature 5's storage approach.

- [ ] Decide the approach
- [ ] Build it

## Not doing right now

Kept here so the plan stays honest about what's deliberately left out.

- Any render style or model beyond Claude and Gemini.
- Commenting, liking, or any social feature on the community feed beyond
  browsing public projects.
- An admin or moderation page for public content.
- A public API for the community feed.
- Multiple floor plans per project, or re-uploading a corrected plan into an
  existing project.
- Privacy policy and terms pages.
- Analytics or session-replay tooling. Nobody's asked for this yet.
