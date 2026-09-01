# Worker

## Overview

Roomify's only server side code: a Puter serverless worker that takes an
absolute path to a floor plan and an absolute path to write to, hands the plan to
one image model with one pinned instruction, and answers with the path it wrote.
It holds no state, writes no key, and touches no file outside the `out` it was
handed. `scripts/deploy-worker.mjs` puts it live.

## Key files

| File                           | Owns                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `roomify.js`                   | The whole worker. `RENDER_MODEL`, `RENDER_MODELS`, the pinned `RENDER_PROMPT`, the `POST /render` route and its guards |
| `../scripts/deploy-worker.mjs` | The deploy: writes the source into Puter storage, ensures the app identity, creates or updates the worker              |

## Commands

```bash
# Deploy the worker and print its URL
npm run deploy:worker

# Print what Puter's app driver actually returns in Node, deploy nothing
node scripts/deploy-worker.mjs --diagnose

# Deploy with no app identity at all (escape hatch; costs feature 9)
node scripts/deploy-worker.mjs --user-scoped

# Delete the deployed worker and deploy from scratch
node scripts/deploy-worker.mjs --recreate
```

Needs a **verified** Puter account; unverified accounts cannot deploy workers.
Set `PUTER_AUTH_TOKEN` to reuse a token, or leave it unset and the script opens a
browser sign in. Copy the printed `https://<worker-name>.puter.work` URL into
`VITE_PUTER_WORKER_URL`.

## Conventions

- **Plain JavaScript, no build, no TypeScript, no import from `app/`.** A worker
  is deployed as a single source file, so there is no bundler. `router` is
  injected by Puter's runtime. ESLint gives `worker/**/*.js` its own block with
  the worker and browser globals and no design system or SDK rules, because there
  is no markup in a worker and it never imports the SDK.
- **Everything runs as `user.puter`, the caller's own Puter.** Every model call
  is billed to the person who asked and every file touched is their own. There is
  no API key anywhere in this system and none to leak.
- **The worker owns nothing.** Every invariant about a project is enforced in the
  client, which is spec 0002's single writer rule. Path in, path out.
- **The prompt is pinned verbatim and nothing is appended or interpolated.** A
  prompt assembled at call time is a prompt nobody can check, and the acceptance
  criteria cannot be checked without knowing exactly what was asked.
- The model id follows spec 0006's parity rule applied to the image list: a
  native `google:` provider prefix rather than a router, not a preview, nearest
  generation rather than newest.
- Failures answer with a code and **no message**, so no provider string can reach
  a screen. The client maps codes in `app/render/failures.ts`.

## Gotchas

- **App names and worker names are both global across all of Puter**, not per
  account. A worker is served at `https://<worker-name>.puter.work`, so its name
  is a subdomain. Plain `roomify` is already held by a stranger in both
  namespaces, which is why both are `architecture-vis-roomify`.
- **`apps.get(name)` is not an ownership test.** It goes through the `read`
  driver, which resolves a name across all of Puter and returns no `owner` field,
  so it answers with a real uid for an app this account does not own. Trusting it
  gets the deploy as far as the worker driver, which refuses with `Actor cannot
mint a token for another app`. **`apps.list()` is the only call that means
  "yours"**: it is the `select` driver with `predicate: ['user-can-edit']`.
- **`workers.create` with no app named crashes before sending anything.** It auto
  provisions a sandbox app and then reads `owner.uuid` off it, a field the `read`
  and `create` driver methods it uses never return. Naming an app explicitly
  takes the string branch and reads only `uid`.
- **`ai.chat` has no `puter_path`.** It takes a URL, a `File`, or a data URI, and
  `gpt-image-*`'s `input_image` wants base64 too. The worker reads the plan's
  bytes once as the caller and the same data URI feeds the call.
- **The worker sends no `ratio` and no `quality`.** The square 628x628 output is
  the model's own default, not an honoured option, and whether it would accept an
  explicit `ratio` is untested. Passing an option this model might reject turns
  into a `paintFailed` on every render with nothing in the message saying why.
- **Migration order matters when a response field changes.** The client must stop
  requiring a field before the worker stops sending it, and a failure code must
  be deleted from the client only _after_ the worker that could still return it
  is gone. Otherwise every render in the window fails while writing its image
  anyway.

## Related specs

- [0006 Create a project and render](../../docs/specs/0006-create-a-project-and-render/index.md)
- [0007 One model and the top down render](../../docs/specs/0007-one-model-and-the-top-down-render/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
