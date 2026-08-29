# 0005 rationale: upload and host a floor plan

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: the scope says the floor plan is "written to permanent
> storage through `puter.fs`, which returns a real public URL". Neither half is
> true of the installed SDK. `write` returns an `FSItem` carrying `path`, `uid`,
> `size` and timestamps and no URL of any kind, and the only anonymous URL the
> filesystem offers, `getReadURL`, takes an expiry and defaults to 24 hours,
> with a `revokeReadUrl` sitting beside it. Building to the scope's wording
> would mean writing a value into the project record that stops working on a
> timer, and the symptom would be a gallery of broken images appearing a day
> after upload, long after anyone connects it to this decision. The right
> framing is that the **path** is the permanent identifier and a URL is a
> short lived view of it, minted when a screen needs one. The scope's feature 5
> prose needs correcting to match.

Roomify has no backend. Puter is the entire storage layer, reached from the
browser, and a floor plan image is the first genuinely large thing this app
moves. Everything downstream depends on how the plan is identified: feature 6
sends it to a model through the worker, feature 7 shows it in the gallery,
feature 8 puts it beside a render in the comparison view, feature 9 copies it
into a public hosted directory at publish time, and feature 10 exports it. If
that identifier is wrong, all five inherit the mistake.

Two facts about the platform shape the decision, and both were established by
reading the installed SDK source rather than the published docs, which spec 0001
already found can lag the code.

The first is the URL problem above. The second is that a storage refusal is not
a plain rejection. `promptIfStorageLimitError` in the SDK calls
`showUsageLimitDialog` and then rethrows, and its own comment says "prompt AND
reject, never prompt instead of rejecting". An app cannot swallow it. That
collides with the project's rule that a person never sees a raw provider
surface, and it is the same shape of trap as the auth popup that spec 0001
caught in `getUser()`: an SDK that helpfully shows its own UI at the exact
moment the app wanted to speak for itself.

There is also a boundary question. Feature 6 says "a project is created once a
floor plan is hosted", which puts the record creation on the far side of this
feature. That leaves a window where bytes exist with nothing pointing at them,
and it has to be either closed or consciously accepted.

## Options considered

### Option 1: store a long lived read URL alongside the path

Keep spec 0002's `FloorPlan = { path, url }` exactly as built, and fill `url`
with a `getReadURL(path, "30d")` or similar. Refresh it when a reader notices it
has expired.

**Pros**:

- Nothing shipped has to change. `FloorPlan` stays as feature 3 built it and
  spec 0002 stays correct as written.
- The common read path costs no extra call, because the URL is already in the
  record.
- It is the smallest diff from the scope's original intent.

**Cons**:

- It stores a derived value that goes stale, which is the failure mode the whole
  feature is trying to avoid. Every consumer must now handle a dead URL, and the
  ones that forget will look fine until the expiry passes.
- Refreshing means writing to `puter.kv` from a read path, so displaying an
  image can now fail as a write, and two tabs can race to refresh the same
  record.
- The expiry has to be picked long, which is exactly when a leaked URL is worst.

### Option 2: store the path, mint view URLs on demand (chosen)

`FloorPlan` carries `path` only. Any screen that needs the image calls
`getReadURL(path, "1h")` at render time, and a module scope map caches the
result by path so a gallery does not re mint per row.

**Pros**:

- Nothing stored can ever be stale, because nothing derived is stored. The one
  value that persists, the path, is the one the platform guarantees.
- The URL can be short, an hour, because it is cheap to mint another. Short
  expiry is strictly better for a private floor plan.
- Reads stay reads. Nothing writes to `puter.kv` in order to display an image,
  so there is no refresh race.

**Cons**:

- It breaks a shipped type and forces a correction to an `Accepted` spec.
- A cold cache costs one call per image. Feature 7's gallery pays that on first
  paint, twelve at a time.
- Every consumer must go through the module rather than reading a field, which
  is a small ongoing discipline the lint rules cannot enforce.

### Option 3: publish every plan to a `*.puter.site` subdomain at upload

Use `puter.hosting.create` to serve a directory of plans, which produces a
genuinely permanent, genuinely anonymous URL, matching the scope's original
words exactly.

**Pros**:

- Delivers precisely what the scope asked for: a permanent public URL, no
  expiry, no minting, no cache.
- Reuses a mechanism spec 0002 already chose for the public feed, so the app
  would have one hosting story rather than two.

**Cons**:

- It publishes private floor plans to the open web at upload time. A person who
  uploads a plan and never publishes the project would still have their home's
  layout sitting on a guessable public URL. That is a privacy failure, not a
  tradeoff.
- It directly contradicts spec 0002, which decided that public copies are made
  by the worker at publish, deliberately, so that publishing is the single act
  that makes something public.
- Unpublishing would then mean moving files out of a hosted directory, adding a
  second deletion path that can fail halfway.

## Rationale

Option 2 wins on the force that matters most here: this identifier is consumed
by five later features, and a stale value would surface as broken images long
after the cause. Storing only what the platform guarantees to be permanent, and
deriving the rest, is the ordinary answer to that, and it is the same instinct
the codebase already follows elsewhere. Feature 3 deliberately does not store a
computed value it can derive, and spec 0002's own record notes that the owner's
copy is the truth and everything else is derived from it.

The cost is real and worth naming plainly, and the first draft of this spec got
it wrong. It claimed nothing consumes `FloorPlan.url` yet. That is false, and a
cross check caught it: `parseFloorPlan` in `app/projects/invariants.ts` requires
`url` to be a non empty string and returns `null` without it, which propagates
through `parseProject` so that `readProject` would report every project
unreadable and `listProjects` would silently skip them all. Removing the field
without changing the parser does not fail to compile. It produces an empty
gallery, which is the worst kind of breakage: quiet, and a long way from its
cause.

What is genuinely true is narrower, and it is still the reason to do this now.
No project record exists yet, because feature 6 is unbuilt, so there is no
stored data to migrate. The change is two places in one commit rather than a
migration. Wait until after features 6 through 8 read the field and it stops
being either.

Option 1 deserves more credit than a straw man reading gives it. It is genuinely
less work, and a thirty day expiry would not fail during any normal test. That
is exactly what makes it dangerous: it would pass every check this project runs
and fail a month later in a way nobody would connect back to this decision. A
bug that cannot be caught by the verification you actually do is worse than a
harder change you make once.

Option 3 was taken seriously because it is what the scope literally asked for,
and rejected because delivering it would put private floor plans on the public
web. When the written scope and the privacy model disagree, the scope is what
gets corrected. Spec 0002 thought carefully about when something becomes public,
and feature 5 should not quietly undo that by choosing a convenient URL.

On the quota dialog, the engineer chose to pre check with `fs.space()` and still
handle the rejection. That is the right call and it is worth being honest about
what it buys: it does not fix the problem, it makes the problem rare. The dialog
is still reachable through a genuine race, two tabs uploading at once, and no
amount of checking removes it. What the pre check does buy is that the ordinary
out of space case, which is the common one, is handled in our own words. The
alternative, handling only the rejection, would mean documenting a rule in
`docs/coding-standards.md` that the app knowingly breaks on a path anyone can
reach by filling their drive. A rule with a known exception nobody wrote down is
how standards decay.

On the boundary, keeping project creation in feature 6 was chosen over a draft
project record. A draft would have meant reopening spec 0002's `Project` type,
which requires a non empty `models` array and a matching `renders` entry for
each, so a draft would need either a new state or a weakened invariant. Trading
a strong, enforced invariant for the sake of tidying up abandoned files is a bad
exchange, especially when the files sit in the person's own storage rather than
ours. The orphan is accepted, the one visible case is cleaned, and the rest is a
follow up rather than a pretence.

## SDK findings

The evidence behind the premise note, all from the installed
`@heyputer/puter.js` at the version in `package.json`.

| Finding                                                                                       | Where                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `write` resolves to an `FSItem` with `path`, `uid`, `size`, timestamps, and no URL            | `src/modules/FileSystem/operations/write.js`, `src/modules/FSItem.js` |
| `getReadURL(path, expiresIn)` mints a token URL, default `"24h"`, and directories are refused | `src/modules/FileSystem/operations/getReadUrl.js`                     |
| A minted read URL can be revoked                                                              | `src/modules/FileSystem/operations/revokeReadUrl.js`                  |
| `write` accepts `progress(operationId, fraction)`, `abort`, and `init` callbacks              | `src/modules/FileSystem/types.js`, `WriteOptionsOwn`                  |
| `createMissingParents` defaults to `false`                                                    | `src/modules/FileSystem/types.js`, `WriteOptionsOwn`                  |
| A storage refusal shows Puter's own dialog and still rejects                                  | `src/modules/FileSystem/operations/storageLimitPrompt.js`             |
| `fs.space()` returns capacity and usage in bytes                                              | `src/modules/FileSystem/operations/space.js`                          |
| `hosting.create(subdomain, dirPath)` serves a directory publicly                              | `src/modules/hosting/create.js`                                       |

## What this changes elsewhere

- **Spec 0002** declared `FloorPlan = { path, url }` in its field table. That
  half is superseded by this spec. Two files implement it and both change:
  the type in `app/projects/record.ts`, and `parseFloorPlan` in
  `app/projects/invariants.ts`, which enforces it at runtime.
  `PublicAssets.floorPlanUrl` is untouched and remains correct: it is a hosted
  copy written at publish, not a minted view.
- **`scope.md` feature 5** claims `puter.fs` returns a permanent public URL. It
  does not, and the prose needs correcting when the feature row is updated.
- **Feature 6** must read the plan inside the worker by path through
  `user.puter` rather than by passing a URL, or the expiry problem returns by
  the back door.

## What the cross check changed

An independent review of the first draft found one blocking defect and nine
decisions the spec had left for the builder to invent. All were folded in. The
ones that changed the design rather than merely tightening it:

- **`parseFloorPlan` requires `url`.** The blocking one, above. The build plan
  had named only the type file.
- **Replace deleted before it validated.** The first draft went
  `hosted → deleting(old) → checkingSpace`, so picking a `.tiff` by mistake, or
  cancelling the picker, would have destroyed the plan the person already had
  and left them with nothing. It now validates and checks space first, and
  deletes only once the replacement is known good.
- **The held file had no protecting invariant.** AC-11 works only if the card is
  never unmounted across the sign in, which the draft assumed in a Value sourcing
  note rather than stating as a rule. It is now AC-15, so wrapping the card in a
  guard is a spec violation rather than a surprise.
- **Nothing said what happens on a second pick mid upload**, or on unmounting
  mid write. Now AC-16 and AC-17.
- **The URL cache stored a resolved value**, so two callers racing on a cold
  cache both mint. It now stores the promise, which matters because feature 7's
  gallery is exactly that case.

The rest were smaller but real: no MIME to extension map, no sanitiser behaviour
for pathological filenames, no not found case on delete, no `alt` source, and no
staleness margin on the cache.
