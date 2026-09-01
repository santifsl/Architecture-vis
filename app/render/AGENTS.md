# Render

## Overview

The heart of the product: a hosted floor plan goes to the Puter worker and a
photorealistic top down render comes back. This directory holds the pure rules,
the worker call, the state machine that starts renders and waits on them, and
the project sheet that shows them.

## Key files

| File                                   | Owns                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules.ts`                             | Pure, no I/O. Out path derivation, project naming, the stale rule, `mayStartRender`, `renderView` / `plateView` / `isWorkingView`, and the timing and ratio constants |
| `store.ts`                             | The worker call, its `AbortController` timeout, and `parseRenderResponse`                                                                                             |
| `claim.ts`                             | Guard 4, the cross tab lease on `puter.kv.incr`                                                                                                                       |
| `useProjectRenders.ts`                 | The engine: starts renders, moves the record through its states, holds all four guards                                                                                |
| `useGenerate.ts`                       | The Generate action on the upload card                                                                                                                                |
| `failures.ts`                          | Every worker failure code and its one sentence                                                                                                                        |
| `RenderPlate.tsx` / `ProjectSheet.tsx` | The plate (including the blurred busy plan) and the drawing sheet page                                                                                                |

## Conventions

- The client owns the record; the worker owns nothing. Every write goes through
  `app/projects/store.ts`.
- Anything checkable without starting the app lives in `rules.ts` as a pure
  function. There is no test runner here, so a path derivation or a staleness
  rule has to be readable against a table by hand.
- The worker's answers are parsed, never trusted. It is the one thing in the
  system with no types, no build, and no local run.
- A person never sees a raw exception, a provider message, an HTTP status, or a
  model name. The worker returns a code and no message at all, so there is no
  path from a provider string to a screen even by accident.
- `plateView` and `isWorkingView` exist so the plate and the key agree about one
  fact. Written twice they could drift and the page would show the plan twice or
  not at all.

## Gotchas

- **Four guards keep one render from starting twice, and no one of them covers
  every cause.** Do not remove one because another looks sufficient:
  1. A keyed latch per `${projectId}:${model}`, collapsing a development double
     effect and any two starts in the same tab.
  2. A refusal when the stored status is already `running` and not yet stale.
     That is what a second tab sees.
  3. A `startedAt` stamp compared before every write, a compare and swap in the
     client. It is what makes a late answer from a timed out attempt harmless.
  4. The leased claim in `claim.ts`, the only one that reaches past one tab.
- **`claim.ts` is a lease, not a lock, and its margin is load bearing.**
  `LEASE_SECONDS` is `STALE_AFTER_MS` minus a minute, deliberately shorter, so a
  claim always runs out before the record stops believing the render it stands
  for. Equal values would leave a window where Retry on a stalled card is
  silently refused by a lock nobody owns.
- **A release only deletes a claim young enough to still be its own.** The key
  holds a count, not an owner, so an attempt that outlived its lease must let the
  key expire rather than delete a successor's live claim.
- **An unreachable claim is `unguarded`, not `won`.** An attempt holding no key
  must release nothing. Reporting `won` there would take out a live claim another
  tab legitimately owns.
- **`stalled` is display only.** A stale `running` render is shown as failed with
  no write, because writing would mean every viewer racing to record the failure.
- **`renderOutPath` returns `null` rather than guessing.** Both paths are
  absolute and share an app data root, which is what makes the worker's guard
  possible. A relative path means something different inside the worker.
- `RENDER_ASPECT_RATIO` (`1 / 1`) and `.plate-frame` in `app/app.css` name each
  other. Change one and change the other.

## Related specs

- [0006 Create a project and render](../../docs/specs/0006-create-a-project-and-render/index.md)
- [0007 One model and the top down render](../../docs/specs/0007-one-model-and-the-top-down-render/index.md), which supersedes parts of 0006

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
