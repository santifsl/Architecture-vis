# Projects

## Overview

The project record: its shape, what makes it legal, and the only module that
writes it. Features 5, 6, 7, 9 and 10 all read and write the same record, so the
types, the id generator, and the key builders live here rather than being
re derived per feature.

## Key files

| File            | Owns                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `record.ts`     | Shapes and pure functions only. `SCHEMA_VERSION`, `ModelId`, `RenderState`, the legal transitions, key builders, `FeedEntry` |
| `invariants.ts` | `parseProject` (is this the right shape) and `checkProject` (is this record self consistent), both pure                      |
| `store.ts`      | The only writer of the owner's `puter.kv`, and the only place a failure becomes a sentence                                   |

## Conventions

- **Two stores are named here and only one is written from the client.** Store A
  is the owner's own `puter.kv`, the system of record, and `store.ts` is the only
  thing that writes it. Store B is the app account's `puter.kv`, reachable only
  from inside the Puter worker, which is the only thing that writes it.
- **Single writer.** Every invariant a project has to satisfy is enforced here,
  behind one door. The worker holds no state and writes no key.
- `record.ts` and `invariants.ts` touch no I/O and import no SDK, so they can be
  reasoned about by hand and reused by the worker later.
- Nothing throws at a caller and nothing raw escapes. Every store function
  returns a result carrying a plain sentence a person can read.
- `parseProject` narrows a stored `unknown`; `checkProject` runs before a write.
  Keep the two jobs apart.

## Gotchas

- **This is the file the project has been caught by twice.** Spec 0005 on
  `FloorPlan.url` and spec 0006 on `checkProject` demanding a `url` on every
  `complete` render, which would have refused every render on the write that
  finished it. Change a type here and change its parser in the same breath, or a
  record compiles fine and is unreadable at runtime.
- **`SCHEMA_VERSION` is 2, and version 1 records are refused on read.** That is
  intended: spec 0007 removed `prompt` from `RenderState`, so a version 1 project
  stops appearing rather than being half read.
- **`MODEL_IDS` is a union of one (`gemini`), and the map shape around it stays.**
  `models`, `renders` and `renderUrls` were deliberately not collapsed into
  single fields: it is the seam a second model comes back through, and feature 9
  builds against the `FeedEntry` shape as designed.
- **`complete → pending` is legal, `complete → running` is not.** A regenerate
  goes back to the start of the machine rather than jumping into the middle.
- The store's real size ceiling is `399 * 1024` bytes, not the 400 KB the spec
  quotes. That is what the installed SDK actually refuses.

## Related specs

- [0002 Project records and public feed index](../../docs/specs/0002-project-records-and-public-feed-index/index.md)
- [0007 One model and the top down render](../../docs/specs/0007-one-model-and-the-top-down-render/index.md), schema 2

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
