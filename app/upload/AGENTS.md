# Upload

## Overview

A 2D floor plan goes from a file picker into permanent Puter storage. What
everything downstream points at is the **file path**, never a local blob URL that
dies when the tab closes and never a minted URL that expires.

## Key files

| File                 | Owns                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `plan.ts`            | Pure rules: allowed types and size, the MIME to extension map, the filename sanitiser, the path builder |
| `store.ts`           | The Puter calls: the `fs.space()` pre check, `write` with progress and abort, an idempotent delete      |
| `usePlanUpload.ts`   | The state machine, including the file held across sign in                                               |
| `failures.ts`        | Every upload failure and its one sentence                                                               |
| `PlanUploadCard.tsx` | The card on the home route, including the determinate progress hairline                                 |

## Conventions

- Puter is reached only through `withPuter`, same as `app/projects/store.ts`.
- `plan.ts` touches no Puter, no network, and no clock unless a caller hands it
  one, so the awkward cases (an emoji only filename, a name over the cap, `.jpeg`
  against `.jpg`) are checkable against a table by hand.
- Nothing here writes to `puter.kv`. This feature hands back a `FloorPlan` and
  stops; `app/render/useGenerate.ts` creates the project.
- Nothing here stores a URL. Minting lives in `app/storage/urls.ts`.
- The failure sentences follow the same shape as `app/projects/store.ts` and
  `app/render/failures.ts`. Match them rather than inventing a fourth convention.

## Gotchas

- **`fs.space()` is read before every write, and not for tidiness.** A storage
  refusal makes the SDK show Puter's **own** usage dialog and then reject as
  well. `promptIfStorageLimitError` prompts **and** rejects, never prompts
  instead of rejecting, so an app cannot suppress it. Checking first makes that
  dialog rare, not impossible: two tabs uploading at once can still hit the
  genuine race, so the rejection is handled too.
- **Cancel an in flight upload through `write`'s `init`, not its `abort`.**
  `abort` is a _notification_ fired after a cancellation completes, typed
  `(operationId: string) => void`. It reports a cancellation and cannot cause
  one. `init` is handed the `XMLHttpRequest` whose `abort` the SDK overrides.
- **Replace must validate the new file before deleting the old one**, or a
  cancelled picker destroys the plan the person already had.
- **The allowed type list is deliberately narrow.** A `.tiff` or `.heic` would
  upload happily and then fail inside the render, where it reads as "generation
  broke" rather than "that file was never going to work".
- The file input's `accept` attribute filters some rejected types out of the
  picker before validation ever runs, so a few refusal paths cannot be reached by
  hand.
- The card is not wrapped in `RequireUser`. That would unmount it and discard a
  file held across sign in.

## Related specs

- [0005 Upload and host a floor plan](../../docs/specs/0005-upload-and-host-a-floor-plan/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
