# Roomify

## What this is

Upload a 2D floor plan, press one button, and get back a top-down 3D render
of the space whose walls follow your drawing. Gemini is the only render
model; Claude was an option until spec 0007 dropped it, and it is not coming
back. Every upload and every render gets
permanent hosting with a real public URL, every project persists in a
personal gallery, and a project can be made public to sit in a shared
community feed alongside everyone else's. Read `scope.md` before building
anything, it's the living plan, broken into features, and it tracks what's
actually done versus what's still open. Keep it up to date as you go, that's
not optional housekeeping, it's how a fresh conversation picks this up
without anyone re-explaining the project.

## How to work

Before building anything, decide what you're doing and why, in a few plain
sentences, out loud or in a short note. Don't write code yet at that point.
Report the decision, then stop and wait, don't move on to building until
you're told to go ahead. Every feature, no exceptions, even ones that look
obvious.

If something genuinely forks, where a reasonable person could actually go two
different ways and it matters which, ask about it, one question at a time,
with two or three concrete options to pick from, so a short reply settles it.
Not a long list of questions needing a written response, and not silence when
a real fork exists, either extreme is the wrong move. Most things don't need
asking, decide those and just say what you decided. Save an actual question
for the ones that do.

Then build it. If the plan turns out wrong once it's actually built, or
contradicts something already in the codebase, say so and fix the plan too,
not just the code. Don't quietly work around a contradiction.

When you report back, especially anything that needs a person to actually go
do something, verify by hand, test a real flow, make a choice, write that
part as a short bulleted list of concrete steps, not a paragraph to read
through. Someone should be able to scan it and know exactly what to go do
next. The detailed reasoning still belongs in `scope.md` as the permanent
record, dense is fine there. What comes back in the reply should be the short
version.

When a build step is actually underway, break it into its own short checklist
of what's genuinely being done, and check items off in `scope.md` as they're
finished.

Specs live in `docs/specs/NNNN-slug/`, one directory per feature, written by
`/architect` and nobody else. That is a reversal, and it is worth knowing it was
one: this file originally said there was no formal spec-file system here, no
numbered acceptance criteria and no separate directory per feature. The
"Workflow skills" section below then required an `/architect` pass before any
load-bearing code, and `/architect` writes exactly those files, so the two
paragraphs contradicted each other from the day this was written. Nine specs,
0001 through 0009, settled it in practice long before anyone noticed the
sentence. The specs won, so the sentence is gone.

What survives from it is the standard the prose is held to. A spec earns its
place by recording a decision somebody actually had to make and the reasoning
that would otherwise be lost, not by filling in a template. A short, real,
plain-language decision still beats a long templated one every time; it just
gets a numbered file now. `scope.md` stays the coarse living plan and the entry
point, and every feature there links to its spec rather than restating it.

## Rules

- Functional style: pure functions by default, no shared mutable state, side
  effects pushed to the edges.
- Immutable data, `const` and `readonly`, prefer `map`/`filter`/`reduce` over
  mutating loops.
- Folder by feature, not by shared layer-wide folders.
- Strict TypeScript, no `any`.
- No traditional backend. Auth, file storage, the KV database, and the AI
  model calls all run through Puter.js directly from the client. Don't reach
  for an API route or a real database "just in case," Puter is the backend
  here, that's the whole point of the stack.
- Fail fast on a missing environment variable (`VITE_PUTER_WORKER_URL`) at
  startup, don't let it fail silently the first time a render is requested.
- An accessibility baseline on every screen: real contrast, visible focus,
  full keyboard operation.
- Gemini is reached only through the worker interface, never from the browser.
  A render carries its own result, its own status, and its own failure, so one
  render failing never takes a project or another render down with it.
- Never show a raw exception or a provider error to the user. A plain, human
  sentence and a retry action, always.
- Shared values, spacing, color, repeated UI patterns, live in `globals.css`
  or a shared component, never copy-pasted as raw Tailwind classes across
  files. If the same handful of classes show up in three places, that's a
  component, not a coincidence.
- After building or changing anything, actually run it, typecheck, lint, and
  a real build, not just read the code and assume it's right. Fix whatever
  fails before calling the step done.
- No test runner, no browser automation framework, for this project. Verify
  manually, a running dev server and a real browser, or something as light as
  `curl` against the worker. That's already decided, not something to add
  later, don't install one to check something works.

## Design

Colors and the accent rules are decided in `scope.md`'s design feature, read
that before touching any styling, don't guess or restate it here. The
short version: a near-monochrome bone/ivory palette with a single burnt-clay
accent used only for interactive elements, nothing else. Anthropic's
`frontend-design` plugin must actually be invoked for any UI work, not just
assumed active, it commits to a real visual direction before writing code
instead of defaulting to the generic AI look. If it doesn't fire on its own,
say so and invoke it directly before building any screen.

## Workflow skills, actually run them this time

Nine global skills are installed and reachable in any Claude Code session on
this machine: `/scope`, `/audit`, `/architect`, `/develop`, `/check`, `/test`,
`/document`, `/sync`, `/debug`. LLM Arena had the exact same skills installed
the whole time and never ran a single one, `CLAUDE.md` and `scope.md` there
were written by hand in conversation instead, which is why they live at the
project root rather than in `docs/scope/` and `docs/specs/`. Installed and
reachable is not the same thing as used, and that's the mistake this project
does not repeat.

For Roomify, the actual build loop is the skill's loop: run `/architect` on
any feature or decision tagged `needs a decision` below before writing code
for it, `/develop` to build a feature once its decision exists, `/check
verify` to confirm it against a real running app, `/test` and `/check
review` if the feature's workflow tier calls for them, and `/document` and
`/sync` at a real handoff point. `/debug` any time something is just broken,
no scope or spec required first.

This file and `scope.md` stay hand-written and at the root, same convention
as LLM Arena, that part isn't changing. What changes is that the two open
decisions flagged in `scope.md`, Puter auth and the community-feed lookup
shape, get an actual `/architect` pass before `/develop` touches them,
instead of being decided in the same freeform conversation that wrote this
file.

## Tools

Puter.js is the entire backend surface here, auth, storage, KV, and the
worker that actually calls Gemini. Puter is a smaller, faster
moving platform than something like Next.js or Prisma, so its own current
docs are the reference for `puter.auth`, `puter.fs`, `puter.kv`, and
`puter.workers`, not general training data, which can be stale on exactly
this kind of tool. Pull the current docs when wiring any of these up rather
than assuming the API shape from memory.

React Router is the other tool with real docs on disk. A `react-router` skill
is bundled with this project at `.agents/skills/react-router/`, and React
Router v8 ships its own markdown docs inside the package at
`node_modules/react-router/docs/`. That skill plus those docs are the
reference for routing, loaders, actions, and rendering mode, not training
data. This app is Framework Mode, so `references/framework-mode.md` is the
one that applies.

Alongside it, the official `react-router-framework-mode` skill from
`remix-run/agent-skills` is installed at
`.agents/skills/react-router-framework-mode/`, pinned in `skills-lock.json`.
It is the deeper reference for the mode this app actually uses, one file per
topic under `references/`: `routing.md`, `route-modules.md`,
`data-loading.md`, `actions.md`, `navigation.md`, `pending-ui.md`,
`error-handling.md`, `sessions.md`, `middleware.md`,
`rendering-strategies.md`, `special-files.md`, and `type-safety.md`. Reach
for it whenever routing, loaders, actions, forms, or `react-router.config.ts`
are in play. Both skills are tracked in the repository, so they travel with a
clone; the `.claude/` directory that symlinks them into Claude Code is local
tool configuration and is not committed.

The long-form coding conventions live at `docs/coding-standards.md`.

## Context files

Durable, area specific context lives in a nested `AGENTS.md` beside the code it
describes, each with a sibling `CLAUDE.md` that imports it. This file stays the
project wide one.

- [app/platform/AGENTS.md](app/platform/AGENTS.md): the only module allowed to
  import the Puter SDK, the `withPuter` gate, and the startup env check.
- [app/auth/AGENTS.md](app/auth/AGENTS.md): the auth fact resolved at boot, and
  the three concurrency primitives (latch, keyed latch, serial queue).
- [app/projects/AGENTS.md](app/projects/AGENTS.md): the project record, schema 2,
  its invariants, and the single writer rule.
- [app/render/AGENTS.md](app/render/AGENTS.md): the render loop, the four start
  guards, and the leased cross tab claim.
- [app/storage/AGENTS.md](app/storage/AGENTS.md): view URLs minted on demand, the
  promise cache, and why none of it is ever persisted.
- [app/upload/AGENTS.md](app/upload/AGENTS.md): getting a floor plan into Puter
  storage, and the `fs.space()` and cancellation traps.
- [worker/AGENTS.md](worker/AGENTS.md): the serverless worker, `npm run
deploy:worker`, and Puter's global app and worker namespaces.
