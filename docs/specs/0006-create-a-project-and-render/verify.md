# 0006 verify: create a project and generate the 3D render

Hand walkthrough, per CLAUDE.md: a real dev server, a real browser, a real
deployed worker, and `curl`. No test runner, no browser automation.

Each step names the acceptance criterion it proves. Run the command and code
shape steps first, they are cheap and they catch the mistakes that make the
runtime steps meaningless.

## Before you start

- [ ] `npm run deploy:worker` succeeds and prints a URL.
- [ ] That URL is in `.env` as `VITE_PUTER_WORKER_URL`, and `npm run dev` boots
      to the home screen rather than `ConfigScreen`.
- [ ] You are signed in with a Puter account that has some model allowance left,
      and it has at least one plan already uploaded from feature 5.

## Commands and code shape

- [ ] `npm run verify` passes clean: typecheck, lint, format, contrast, build.
- [ ] `grep -rn "puter" app/ --include=*.ts --include=*.tsx | grep -v "platform/puter"`
      shows no new import of the SDK outside `app/platform/puter.ts`.
- [ ] `app/projects/record.ts` and `app/projects/invariants.ts` both mention
      `prompt`. If only one does, stop: every stored record is about to become
      unreadable, **AC-5**.
- [ ] `grep -rn "getReadURL" app/` shows the minting living in exactly one
      module, and `app/upload/store.ts` no longer holds its own copy, **AC-4**.
- [ ] `worker/roomify.js` is tracked by git and `scripts/deploy-worker.mjs`
      exists, **AC-15**.
- [ ] The worker holds no `kv.set` and no `fs.write` other than the one
      `puter_output_path` on the paint call.
- [ ] `VISION_MODELS` reads exactly `google:google/gemini-2.5-pro` and
      `anthropic:anthropic/claude-opus-4-5`, the two ids spec 0006 pinned under
      Model parity. Anything else, a Sonnet tier Claude especially, is the
      confound this feature is built to avoid.
- [ ] Both are still present in `puter.ai.listModels()`. Run it in the browser
      console and compare. If either has gone, re pick by the Model parity rule
      (same tier, native provider, non preview, nearest generation) rather than
      by grabbing whatever is newest.
- [ ] The worker sets no temperature, no output cap, and no per model option on
      either chat call. Both get the same instruction constant and Puter's own
      defaults, or the two reads are not comparable.

## The main flow

- [ ] Upload a plan. Both models are ticked before you touch anything, **AC-6**.
- [ ] Untick Gemini, then untick Claude. The second untick is refused with a
      readable sentence, and Generate is not a dead button, **AC-6**.
- [ ] Re tick both, press Generate. The URL becomes `/project/<id>` and two
      cards are on screen immediately, each showing the busy hairline rather
      than a spinner, with the floor plan above them, **AC-1**, **AC-7**.
- [ ] In Puter's own file browser, the project key exists under `project:<id>`
      with `visibility: "private"`, two `renders` keys, both `pending` or
      `running`, **AC-1**.
- [ ] Wait. Each card fills on its own, and the faster one fills while the other
      is still working, **AC-2**.
- [ ] Both renders finish. The record now has a `path` and a non null `prompt`
      per model, `url` is still `null`, and both images exist in the account's
      `renders/` directory as PNG at 16:9, **AC-3**, **AC-4**, **AC-5**.
- [ ] Read the two stored prompts. They are one paragraph of plain prose each,
      under 1200 characters, no markdown, and they differ from each other in a
      way that accounts for the two renders, **AC-5**.
- [ ] The render cards hold their 16:9 shape before the images load. Reload with
      a throttled connection and watch: nothing below them jumps, **AC-7**.
- [ ] Reload the page. Both renders still show, from freshly minted URLs. Check
      the network panel: the image src is a `token-read` URL, never a `blob:`
      one, **AC-4**.

## Failure and independence

The point of these is that one model's bad day is invisible to the other.

- [ ] Break one model on purpose: temporarily set that entry in `VISION_MODELS`
      to a model id that does not exist, redeploy, and generate again. The
      broken card shows a plain sentence and a Retry; the good card renders
      normally and its record fields are untouched, **AC-2**, **AC-9**.
- [ ] Put `VISION_MODELS` back, redeploy, press Retry on the failed card only.
      That model alone goes `pending`, then `running`, then `complete`. The
      other card does not flicker or re run, **AC-8**.
- [ ] Throttle the network to offline mid render. The wait ends as a failure
      with a readable sentence, not a hang and not a raw error, **AC-9**.
- [ ] Watch the browser console through every failure above. Nothing prints a
      provider message, a stack, or an HTTP status to the screen, **AC-9**.
- [ ] Timeout: temporarily drop the client timeout to five seconds, generate,
      and confirm the render is recorded `failed` with the timeout code and
      offers a retry. Put it back to 120 afterwards, **AC-13**.
- [ ] Stale: hand edit a record in Puter's KV so one render is `running` with a
      `startedAt` fifteen minutes ago, then open the project. That card reads as
      failed with a Retry, and the stored record was not rewritten just by
      looking at it, **AC-10**.

## Running twice, and not running at all

These are the ones the cross check found, and they are the least obvious to
think of unprompted.

- [ ] In development, with strict mode on, open a project with a `pending`
      render and watch the network panel. Exactly one `/render` call goes out
      per model, not two, **AC-18**.
- [ ] Open the same generating project in a second tab. The second tab shows the
      renders working, does not start its own, and when both settle the record
      holds one coherent result per model, **AC-18**.
- [ ] Force the stamp guard: drop the client timeout to five seconds so a render
      times out while the worker keeps going, press Retry, and let the original
      attempt come back late. The late answer is discarded and the retry's
      result is what stands, **AC-18**.
- [ ] Interrupt Generate: throttle to offline the instant after `createProject`
      writes, so the page never mounts. Go back online, open the project from
      its URL, and both renders start rather than sitting `pending`, **AC-17**.
- [ ] Point `VITE_PUTER_WORKER_URL` at something that answers with HTML rather
      than JSON, generate, and confirm the failure is the `badResponse` sentence
      rather than a parse error in the console, **AC-9**.

## Auth and paths

- [ ] `curl -X POST <worker>/render -H 'content-type: application/json' -d '{"plan":"/x/y","out":"/x/z","model":"claude"}'`
      with no session header returns 401 and reveals nothing, **AC-11**.
- [ ] The same call with a session but `out` pointing outside `renders/` returns
      403, and no model was called (your allowance did not move), **AC-12**.
- [ ] The same call with a relative `plan` such as `plans/x.png` is refused
      rather than resolved, **AC-12**.
- [ ] Sign out in another tab, then press Retry. The failure is the signed out
      sentence, and Puter's own sign in popup never appears by itself,
      **AC-9**, **AC-11**.
- [ ] Visit `/project/does-not-exist`. The store's plain "no longer here"
      sentence shows, not a blank page and not a crash, **AC-14**.

## Design and accessibility

- [ ] Tab through the whole flow: picker, Generate, then Retry on the project
      page. Every stop has a visible focus ring and every control is operable
      from the keyboard, **AC-16**.
- [ ] The picker, Generate, and Retry each define all six states. Check the busy
      one during a real generation: the label drops to clay at 55% with a
      hairline beneath, **AC-7**, **AC-16**.
- [ ] `npm run contrast` passes, and nothing new uses raw Tailwind colour or
      type classes that the ESLint rules from spec 0004 would have caught,
      **AC-16**.
- [ ] The only saturated things on the page are the floor plan and the two
      renders, per feature 4.

## Carried over from spec 0002

Two of spec 0002's Follow-up items become checkable the moment a real worker
exists. Do them while it is fresh.

- [ ] A `curl` to a worker route with no session at all reaches the route and
      returns data. Believed from the SDK source, never proved.
- [ ] A worker can read a file through the caller's own `user.puter.fs`.

## Known non steps

- Regenerating a render that already succeeded is out of scope here, though the
  state machine permits it.
- Publishing, the feed, and anything public belong to feature 9. `url` and
  `publicAssets` stay null throughout.
