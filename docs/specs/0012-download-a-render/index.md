# 0012. Download a render

**Date**: 2026-09-03
**Status**: Proposed

## Summary

The project page gets a way to save a finished render onto your own device. The
button sits in the render plate's label row, opposite the state word, and
pressing it reads the stored file through the Puter SDK and hands the browser a
blob (the raw file bytes held in memory) to save under a name derived from the
project. The bytes are the ones the worker wrote, untouched: nothing is resized,
re-encoded or recompressed, because "full resolution" here means nothing is
thrown away rather than anything being added. It writes nothing at all: no
record change, no schema bump, no worker call, so a project's `revision` is the
same after a hundred downloads as before the first.

## Requirements

**User stories**:

- As someone who just got a render back, I want to save it to my machine so I
  can put it in a deck or a portfolio, which is the whole point of having
  generated it.
- As someone who found the file in a Downloads folder a week later, I want its
  name to tell me which project it is, not a storage id I have never seen.
- As someone whose render is still generating, I want to see that a download is
  coming rather than wonder whether the feature exists.
- As someone using a keyboard or a screen reader, I want to reach the control,
  hear what it is, and hear that it is not available yet.

**Acceptance criteria** (the contract, each one independently checkable):

- **AC-1**: On `/project/:id`, when a render's status is `complete` and it
  carries a stored `path`, a download control appears inside that render plate's
  label row, on the same line as the model name and the state word.
- **AC-2**: Activating it saves the stored file to the visitor's device. The
  saved bytes are byte for byte the file at `render.path`: same format, same
  dimensions, same size. Nothing decodes, re-encodes, resizes or recompresses
  it anywhere in the path.
- **AC-3**: The saved file is named from the project's own `name`, slugified,
  plus `RENDER_EXTENSION`. A name that slugifies to nothing produces
  `render.png` rather than an empty name or a dangling separator.
- **AC-4**: While the read is in flight the control is busy: it carries
  `aria-busy="true"`, its label reads `Preparing your render`, it keeps keyboard
  focus, and activating it again while busy does nothing.
- **AC-5**: When the render's status is `pending` or `running`, the control is
  present and unavailable: it carries `aria-disabled="true"`, stays in the tab
  order, reads `Download when it is ready`, is styled as disabled, and
  activating it does nothing.
- **AC-6**: When the render's view is `failed` or `stalled`, the control is not
  rendered at all, so it never sits beside a failure sentence and a retry button
  for a render that does not exist.
- **AC-7**: A failed read shows one plain sentence beside the control, exactly
  the wording in **Copy**, below. Three cases are distinguished: the session
  ended (`signedOut`), the file could not be read or is gone (`unreadable`), and
  anything else (`unreachable`).
- **AC-8**: The two recoverable failures offer an action that retries without a
  page reload, and a retry after a transient failure succeeds. The session ended
  case offers no retry, because retrying cannot fix it.
- **AC-9**: No raw exception, provider message, stack or error code ever reaches
  the screen.
- **AC-10**: A download writes nothing. No `puter.kv` write, no entry on the
  project write queue, no schema change, and the project's `revision` is
  unchanged after any number of downloads.
- **AC-11**: The control is fully operable by keyboard, shows the app wide focus
  ring, and passes the contrast check in all three of its looks: available,
  busy, and unavailable.
- **AC-12**: Nothing changes on the public project page, the community feed, the
  gallery, or the comparison view. The download exists on the owner's project
  page only.
- **AC-13**: The disabled look is driven by a selector that matches
  `aria-disabled="true"` as well as the real `disabled` attribute, so a control
  can look unavailable without leaving the tab order. This amends spec 0004's
  state 5 of 6, which is currently attribute only.

## Decision

**Chosen option**: Option 2: read the file through the SDK and save the blob.

The download reads `render.path` with `puter.fs.read`, which returns a `Blob`,
then saves that blob through a temporary object URL on a generated anchor, under
a filename this spec derives. It lives in a new `app/export/` module and touches
no store, no worker and no record.

**Implementation skills**: none. The React Router skills bundled with this
project govern routing, loaders and actions, and this feature adds none of the
three: it is a button and an effect inside an existing route.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No change. Nothing is added, no field is written, `SCHEMA_VERSION` stays at 3.
The feature reads two values that already exist on the project record built by
spec 0002 and amended by specs 0007 and 0011:

| Value             | Where it lives     | Required | Notes                                           |
| ----------------- | ------------------ | -------- | ----------------------------------------------- |
| `name`            | `Project.name`     | required | Already derived from the uploaded filename      |
| `renders[m].path` | `RenderState.path` | nullable | Non null exactly when that render is `complete` |

**State transitions**:

The project's own state machine is untouched. The control has its own small
local machine, held in React state and never persisted:

`unavailable` (render pending or running) · `available` (render complete) →
`busy` (read in flight) → `available` on success, or → `failed` → `busy` again
on retry. `failed` with the session ended reason is terminal for this control:
its action is to sign in, not to retry, and signing in remounts the route.

**API surface**:

No HTTP endpoints and no worker calls. The surface is four functions and one
component in the new `app/export/` module:

| Function                                     | Signature                                                   | Auth                          | Key errors                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `downloadFilename` (`rules.ts`)              | `(projectName: string) => string`                           | pure, none                    | none, it cannot fail; an empty slug falls back                                                                     |
| `readRenderBlob` (`store.ts`)                | `(path: string) => Promise<DownloadOutcome>`                | signed in owner               | `signedOut`, `unreadable`, `unreachable`                                                                           |
| `saveBlob` (`download.ts`)                   | `(blob: Blob, filename: string) => boolean`                 | none, browser only            | returns `false` if the DOM work throws, which the hook reads as `unreachable`; nothing after the click is knowable |
| `useDownloadRender` (`useDownloadRender.ts`) | `(args) => { state, failure, download, retry }`             | signed in owner               | surfaces the three above as sentences                                                                              |
| `DownloadRender` (`DownloadRender.tsx`)      | `({ project, model, render, view }) => JSX.Element \| null` | rendered inside `RequireUser` | none; it renders the hook's state and nothing else                                                                 |

**Copy** (every user visible string, written here so none is invented at build
time; the button's label is its accessible name, and it changes with the state,
the same pattern `AuthControl.tsx` already uses for signing in):

| Where                   | The exact words                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Button, available       | `Download`                                                                              |
| Button, busy            | `Preparing your render`                                                                 |
| Button, unavailable     | `Download when it is ready`                                                             |
| Sentence, `signedOut`   | `Your Puter session ended, so this render can't be read. Sign in again to download it.` |
| Sentence, `unreadable`  | `This render can't be found in your storage right now.`                                 |
| Sentence, `unreachable` | `The download didn't finish. That's usually the connection.`                            |
| Retry action            | `Try the download again`                                                                |

The `signedOut` case shows its sentence with **no retry action**, because
retrying cannot fix it. The other two show the retry.

`DownloadOutcome` follows the shape every other module here uses: a discriminated
result, never a thrown error, per `app/projects/AGENTS.md`'s rule that nothing
raw escapes.

**Value sourcing**:

| Action                    | Value produced or displayed | Source                                                                                                                                                                                                         |
| ------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save the render           | The file bytes              | `puter.fs.read(render.path)`, which returns a `Blob` (confirmed in the installed typings, `@heyputer/puter.js` `types/modules/FileSystem/index.d.ts`)                                                          |
| Save the render           | The path to read            | `RenderState.path` on the project record, non null only at `complete`                                                                                                                                          |
| Save the render           | The filename stem           | `Project.name`, slugified by a new `slugifyProjectName` in `app/export/rules.ts`                                                                                                                               |
| Save the render           | The filename extension      | `RENDER_EXTENSION` (`app/render/rules.ts`), the constant every render is written under. Not derived from the path: the derivation would have an unreachable branch, because nothing writes any other format    |
| Save the render           | The fallback stem           | `FALLBACK_STEM = "render"` in `app/export/rules.ts`, used when the slug comes out empty. Deliberately not `plan`, the fallback `app/upload/plan.ts` uses for a different job                                   |
| Show a failure            | The sentence                | The **Copy** table above, as `DOWNLOAD_MESSAGES` in `app/export/failures.ts`                                                                                                                                   |
| Show a failure            | Which failure it was        | Decided by a `puter.fs.stat(render.path)` before the read, see **Key invariants**. `PuterGateError` from `app/platform/puter.ts` means `signedOut` at either step, exactly as `readStoredUrl` already reads it |
| Decide the control's look | Which of the three states   | `plateView(render, ...)` in `app/render/rules.ts`, already computed by `RenderPlate` for the state word                                                                                                        |
| Announce the control      | Its accessible name         | The button's own text, from the **Copy** table. There is no separate `aria-label`, so the visible label and the announced name cannot drift apart                                                              |

**Key invariants**:

- The bytes written to disk equal the bytes at `render.path`. No canvas, no
  `toDataURL`, no image element anywhere in this path.
- **The three failure codes are told apart by a `stat` before the read, not by
  reading the SDK's rejection text.** `readRenderBlob` calls
  `puter.fs.stat(path)` first: a `PuterGateError` at either step is `signedOut`,
  a `stat` that rejects for any other reason is `unreadable`, and a `stat` that
  succeeds followed by a `read` that rejects is `unreachable`. This costs one
  extra round trip and buys a rule that is decidable now rather than one that has
  to be reverse engineered from whatever `fs.read` happens to throw.
  `app/storage/urls.ts` is precedent for the `signedOut` half only; it has no
  third case, so this rule is new here.
- `saveBlob` never throws at its caller. The DOM work is wrapped, and a throw
  becomes `false`, which the hook shows as `unreachable`. AC-9 admits no raw
  exception, including from the half of this feature that looks like it cannot
  fail.
- The object URL created for the save is always revoked. It is revoked on a
  later task than the click, never synchronously after it, because revoking in
  the same task can cancel the save in some browsers.
- The control is rendered only when `render.path` is a non empty string or the
  view is `pending` or `running`. It never renders with a null path and an
  available look.
- Every failure carries a sentence, and every recoverable failure carries an
  action, per `CLAUDE.md`.
- The module imports no SDK directly. Every Puter call goes through `withPuter`,
  per `app/platform/AGENTS.md`.

**Security model**:

The render is a private file in the owner's own Puter storage, and
`puter.fs.read` runs under the signed in user's session, so authorisation is the
session itself: there is no path by which one account reads another's file, and
no new grant is introduced. The control renders inside `/project/:id`, which is
already behind `RequireUser`. Anonymous visitors on `/community/:projectId` get
nothing new, so no publicly reachable read is added anywhere. No regulated data
is involved: a floor plan and its render are user content with no payment, health
or identity fields attached.

**Configuration required**:

None. No new environment variable, no credential, no dependency. `VITE_PUTER_WORKER_URL`
is untouched because the worker is not called.

**Critical test scenarios**:

- Happy path: on a project with a `complete` render, press the download, and the
  browser saves a file named after the project whose bytes and dimensions match
  the render shown on screen, verifies **AC-1**, **AC-2**, **AC-3**.
- Failure case: sign out in a second tab, then press download in the first. One
  sentence appears saying the session ended, with no retry offered, and no
  exception text anywhere, verifies **AC-7**, **AC-8**, **AC-9**.
- Failure case: press download twice quickly. The second activation does nothing
  and exactly one file is saved, verifies **AC-4**.
- Failure case: a project whose render is `running`. The control is present,
  focusable by keyboard, announced as unavailable, and pressing Enter on it does
  nothing, verifies **AC-5**, **AC-11**, **AC-13**.
- Failure case: a project whose render is `failed`. No download control is on
  the page at all, verifies **AC-6**.
- Auth/permission: open the same project's public page at `/community/:projectId`
  as an anonymous visitor. There is no download control, and the page is
  otherwise byte for byte what spec 0011 left, verifies **AC-12**.
- Persistence: read the project's `revision` before and after several downloads.
  It is unchanged, verifies **AC-10**.

## Build plan

No build approach is recorded in `CLAUDE.md` or `scope.md`, so this plan assumes
end to end slices: get one real render actually saved to a real disk first, then
thicken the states and the failures around it. That order matters here more than
usual, because the whole feature rests on one unproven claim, that the SDK read
plus an object URL really does save a file rather than open a tab, and that is
worth learning in task 1 rather than task 7.

1. The thin thread. Create `app/export/` with `DownloadRender.tsx` as a real
   component, mounted from `RenderPlate`'s label row and shown only when the view
   is `complete` and `render.path` is not null. Inside it, read the blob through
   `withPuter` and save it under a placeholder name via `app/export/download.ts`.
   Walk it in a real browser and confirm the saved file opens and matches the
   render, satisfies **AC-1**, **AC-2**
2. The real filename. Add `app/export/rules.ts` with `slugifyProjectName`,
   `FALLBACK_STEM` and `downloadFilename`. Do not reuse `sanitisePlanName` from
   `app/upload/plan.ts`: it strips a trailing extension, so a project called
   `Flat 2.b north` would lose everything from the dot onward. Share the collapse
   rule, skip the strip, and fall back to `render` rather than to `plan`,
   satisfies **AC-3**
3. Failures with sentences. Add `app/export/failures.ts` with the three codes and
   the exact copy from the **Copy** table, and `app/export/store.ts` with
   `readRenderBlob` implementing the `stat` first rule from **Key invariants**.
   Wrap `saveBlob`'s DOM work so a throw becomes `unreachable`. Surface the
   sentence beside the control, with the retry on the two recoverable codes and
   none on `signedOut`, satisfies **AC-7**, **AC-8**, **AC-9**
4. The busy state. Add `app/export/useDownloadRender.ts` holding the local
   machine, set `aria-busy` on the button, swap its label to
   `Preparing your render`, and guard the handler so it returns early while busy,
   the same guard `useSignIn` already holds for the three sign in surfaces,
   satisfies **AC-4**
5. The unavailable state, and the design system amendment it needs. Extend spec
   0004's state 5 of 6 in `app/app.css` so `.btn-accent`, `.btn-outline` and
   `.btn-quiet` take the disabled look from `[aria-disabled="true"]` as well as
   `[disabled]`, then render the control with `aria-disabled` and the label
   `Download when it is ready` during `pending` and `running`. Note that this
   also fixes a live inconsistency rather than only serving this feature:
   `AuthControl.tsx` already sets `aria-disabled` on the sign in button while
   busy, and that button has never picked up the disabled look, satisfies
   **AC-5**, **AC-13**
6. Absence. Return null for the control when the view is `failed` or `stalled`,
   so the failure sentence and its retry keep the space under the plate to
   themselves, satisfies **AC-6**
7. The accessibility pass. Confirm the tab order through the label row, the focus
   ring on `.btn-outline` in all three looks, the accessible name changing with
   the state, and `npm run contrast` passing, satisfies **AC-11**
8. Confirm the feature is inert everywhere else. Check that no store, queue or
   worker module was touched, that `revision` does not move across downloads, and
   that the public page, the feed, the gallery and the comparison are unchanged.
   Then run `npm run verify` in full, satisfies **AC-10**, **AC-12**

## Consequences

**Positive**:

- The one thing the product makes finally leaves the product. Until now a render
  could only be looked at inside AV or shared as a link.
- It costs no schema change, no dependency, no environment variable and no
  worker deploy, which makes it the cheapest feature in the project so far.
- It is genuinely independent of feature 9. A private project downloads exactly
  as well as a published one, because the read goes to the private path rather
  than to the hosted copy.
- The failure vocabulary reuses the one `app/storage` and `app/render` already
  established, so the page keeps saying failures in one voice.

**Negative / tradeoffs**:

- `.btn-outline` in the plate's label row puts a bordered control on a line spec
  0004 deliberately left as two pieces of text, and `.btn-outline` is
  geometrically close to `.btn-accent`. The row will read heavier than it does
  today, and that is a real cost accepted knowingly for a control that is easier
  to find and to hit.
- `aria-disabled` keeps the waiting control focusable, which is the accessible
  choice, and it also means a keyboard user can activate a control that does
  nothing. The early return in the handler is what makes that safe, and it is a
  guard that must not be dropped in a later refactor. Spec 0004 already names
  this exact hazard for the busy state.
- Extending the disabled selector in `app/app.css` changes a shared rule, and it
  has one immediate visible effect outside this feature: `AuthControl.tsx`
  already sets `aria-disabled` on the sign in button while it is busy, so that
  button will start dimming during sign in when it never did before. That is a
  fix rather than a regression, and it is still a look changing somewhere nobody
  was editing. Any future control setting `aria-disabled` for a different reason
  picks up the disabled look for free, wanted or not.
- Telling `unreadable` from `unreachable` costs a `stat` before every download.
  One extra round trip on a deliberate click, in exchange for not depending on
  the wording of an SDK rejection.
- The read pulls the whole file into memory before the save begins. For the
  square renders this app produces that is fine, and it would not be for a very
  large file, so this is not a pattern to reach for again without thinking.
- On iOS Safari a blob save may open a preview sheet rather than writing
  straight to Files. There is no user agent sniffing and no second code path:
  that is the operating system's behaviour and the feature accepts it.

**Neutral**:

- A second module, `app/export/`, joins the by feature layout. It has no
  dependents and could be deleted whole without touching anything else.
- The extension is the `RENDER_EXTENSION` constant rather than something derived
  from the path. The day a second output format arrives, the extension belongs
  on the record beside the path, and this is one of the places that will need
  changing. It is named here so that is a known cost rather than a surprise.
- The render is now read twice on a downloading visit: once as a minted view URL
  for the image, and once as a blob for the save. That is deliberate, because the
  minted URL is cross origin and cannot be saved under a chosen filename.
- The public project page keeps the permanent hosted URL a published project
  already has. Anyone wanting those bytes can still right click the image, which
  is unchanged and out of scope here.

## Follow-up

- [ ] `app/export/AGENTS.md` will be needed once this is built, and root
      `CLAUDE.md`'s context file list needs a pointer line added to it. That is
      `/sync`'s job, not something to write by hand now.
- [ ] Spec 0004 is amended by AC-13, the same way spec 0010 amended it. Its state
      5 of 6 text says the disabled look is driven by the real attribute rather
      than a class, and that sentence stops being true. Update it in place when
      this ships rather than leaving two accounts of the same rule.
- [ ] Downloading from the public project page was deliberately left out, which
      means an anonymous visitor with a shared link has no named download. Worth
      revisiting once feature 9 is verified, because the hosted URL makes it a
      genuinely different mechanism rather than a second button.
- [ ] `scope.md`'s feature 10 says "at full resolution", which reads as though
      something might be upscaled. This spec settles it as untouched bytes.
      Reword the scope row when linking the spec.
