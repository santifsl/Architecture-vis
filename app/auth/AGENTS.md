# Auth

## Overview

Who is signed in, resolved once at boot and held in root loader data, plus the
screens and controls around that fact. It also holds the project's three
concurrency primitives, which live here because the first one was a guard on a
sign in double click and the rest grew from it.

## Key files

| File                                                                                             | Owns                                                                        |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `state.ts`                                                                                       | The `AuthState` shape, the boot transition, the one question routes may ask |
| `singleFlight.ts`                                                                                | `createSingleFlight`, `createKeyedSingleFlight`, `createSerialQueue`        |
| `useAuthState.ts` / `useAuthEvents.ts`                                                           | Reading the fact, and subscribing to Puter's session events                 |
| `useSignIn.ts` / `signInStore.ts`                                                                | The sign in action and its failure to sentence mapping                      |
| `sessionEnded.ts`                                                                                | The one shot flag behind the session ended banner                           |
| `RequireUser.tsx` / `BootScreen.tsx` / `AuthControl.tsx` / `AuthNotice.tsx` / `SignInPrompt.tsx` | The gate and the screens                                                    |

## Conventions

- Puter is reached only through `~/platform/puter`. Nothing here imports the SDK.
- `AuthState` has no `loading` variant on purpose: `HydrateFallback` covers the
  boot window, so root loader data is only ever one of the two real states.
- `reason: "sessionEnded"` is set on the single loader run that follows Puter
  ending the session, and never again.

## Gotchas

- **The three primitives in `singleFlight.ts` are three different jobs.** Do not
  reach for the wrong one:
  - `createSingleFlight`: one sequence at a time, overlapping calls **dropped**.
    A `useState` guard is not enough, because setting `busy` and rendering a
    disabled button both happen after the current task finishes, so two clicks
    dispatched in the same task both pass the check. This latch is read and
    written synchronously.
  - `createKeyedSingleFlight`: the same latch per key. Render guard 1 uses
    `${projectId}:${model}`, not one app wide latch, or independent renders
    would queue behind each other. Keys are never removed, and that is
    deliberate.
  - `createSerialQueue`: queues rather than drops. Every write for one project
    goes through it, because `updateProject` is a read, modify, write against a
    store with no compare and swap, so two model completions interleaving in one
    tab would silently lose one render.
- The serial queue serialises **one tab, not two**. Two tabs are handled by the
  `startedAt` stamp in `app/render/`, which discards a stale write rather than
  preventing it.
- `RequireUser` must not wrap the upload card. It would unmount it and discard a
  file held across sign in (spec 0005, AC-11).

## Related specs

- [0001 Puter auth and platform access](../../docs/specs/0001-puter-auth-and-platform-access/index.md)
- [0006 Create a project and render](../../docs/specs/0006-create-a-project-and-render/index.md), AC-18, the start guards

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
