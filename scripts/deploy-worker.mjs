/**
 * Deploys `worker/roomify.js` to Puter and prints its URL. Spec 0006, AC-15.
 *
 * The worker's source lives in this repository, which is the whole of AC-15:
 * the one piece of server-side code in the project is reviewable here rather
 * than pasted into a web editor, and one command puts it live.
 *
 * Three steps, because that is what Puter's API is. A worker is deployed from a
 * file that already exists in your Puter storage, so the source is written
 * there first. And a worker needs an app identity, which this script creates
 * once and then reuses, for the reason spelled out under APP_NAME below.
 *
 * Run it with `npm run deploy:worker`. It needs a Puter auth token and a
 * verified Puter account, since unverified accounts cannot deploy workers. Set
 * `PUTER_AUTH_TOKEN` and it uses that; leave it unset and it opens a browser
 * sign-in and uses the token that comes back.
 *
 * Two flags, both for the bad day rather than the ordinary one:
 *   --diagnose     print what Puter's app driver actually returns in Node, and
 *                  stop without deploying anything.
 *   --user-scoped  deploy with no app identity at all. The escape hatch if app
 *                  creation is refused on your account. See the note below on
 *                  what it costs feature 9.
 *   --recreate     delete the deployed worker and deploy it again from scratch,
 *                  instead of updating it in place. For the day an in-place
 *                  update does not take; see `deployWorker` on why it normally
 *                  should.
 *
 * This is the one file outside `app/platform/puter.ts` allowed to import the
 * SDK, and it is a different import: `src/init.cjs` is the Node entry point,
 * which takes a token instead of reading one out of a browser. The rule that
 * module owns is about never raising an unbidden sign-in popup in front of
 * someone using the app, and a deploy script has no screen to raise one in
 * front of. The ESLint override says the same thing in one line.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { init, getAuthToken } from "@heyputer/puter.js/src/init.cjs";

/**
 * The worker's name, and why it is not just "roomify".
 *
 * Worker names are ONE GLOBAL NAMESPACE, unlike app names: a worker is served
 * at `https://<worker-name>.puter.work`, so the name is a subdomain and only
 * one account on Puter can hold it. "roomify" is held by someone else, which
 * surfaced as `conflict` on create and then `forbidden` ("This is not your
 * worker") on the delete that tried to clear it. Prefixing with the project
 * makes a collision unlikely. The SDK lowercases whatever is put here.
 */
const WORKER_NAME = "architecture-vis-roomify";
/** Where the source is kept inside Puter storage, so a redeploy overwrites it. */
const REMOTE_PATH = "roomify/worker.js";

/**
 * The app the worker is deployed under, and the reason this script does not
 * simply call `workers.create(name, path)`.
 *
 * Left to itself, the SDK auto-provisions a `sandbox-<worker>` app and then
 * reads `sandboxApp.owner.uuid` off it to check you own it. That read crashes,
 * because `apps.get` and `apps.create` go through the app driver's `read` and
 * `create` methods and neither returns an `owner` field. `puter.apps.list()`
 * does return one, but that is the driver's `select` method, which is a
 * different shape. So the check is written against a field the calls it makes
 * never produce, and every deploy dies on `Cannot read properties of undefined
 * (reading 'uuid')` before a single byte is sent.
 *
 * Naming an app explicitly avoids the whole branch: the SDK's third argument,
 * when it is a string, is looked up through `apps.list()` and only its `uid` is
 * read. No `owner`, no crash, and the worker gets a stable identity of its own
 * rather than one auto-generated per worker name.
 *
 * The index URL is required by the app driver and is never visited. This app
 * exists to be an identity, not to be launched.
 *
 * The name is project-prefixed rather than a bare "roomify" for the same reason
 * WORKER_NAME is: app names are global too, and "roomify" is already held by
 * another account. A worker can only be bound to an app you own, so pointing at
 * a stranger's app got as far as the worker driver and was refused there with
 * `Actor cannot mint a token for another app`.
 */
const APP_NAME = "architecture-vis-roomify";
const APP_INDEX_URL = "https://worker-sandbox.puter.com/";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "..", "worker", "roomify.js");

const flags = new Set(process.argv.slice(2));
const DIAGNOSE = flags.has("--diagnose");
const USER_SCOPED = flags.has("--user-scoped");
const RECREATE = flags.has("--recreate");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** The keys an object actually has, for a shape nobody documented. */
const shapeOf = (value) =>
  value === null || typeof value !== "object"
    ? String(value)
    : Object.keys(value).sort().join(", ");

const token = process.env.PUTER_AUTH_TOKEN ?? (await getAuthToken());
if (typeof token !== "string" || token.length === 0) {
  fail("No Puter auth token. Set PUTER_AUTH_TOKEN, or sign in when prompted.");
}

const puter = init(token);

/**
 * Prints what the app driver returns in this Node context, and stops.
 *
 * Every call is wrapped on its own, because the interesting failures are the
 * ones where a call rejects rather than returning the wrong shape, and one
 * throw should not hide the three answers after it.
 */
const diagnose = async () => {
  const report = async (label, run) => {
    try {
      const value = await run();
      console.log(`\n${label}`);
      console.log(`  keys:  ${shapeOf(value)}`);
      console.log(`  owner: ${JSON.stringify(value?.owner ?? null)}`);
      console.log(`  uid:   ${JSON.stringify(value?.uid ?? null)}`);
    } catch (error) {
      console.log(`\n${label}`);
      console.log(`  threw: ${error?.message ?? String(error)}`);
    }
  };

  console.log("Puter app driver, as seen from Node:");

  await report(
    "whoami / getUser (what the SDK compares owner against)",
    () => puter.whoami ?? puter.getUser(),
  );
  await report(
    `apps.get("sandbox-${WORKER_NAME}")  [driver method: read]`,
    () => puter.apps.get(`sandbox-${WORKER_NAME}`),
  );
  await report(`apps.get("${APP_NAME}")  [driver method: read]`, () =>
    puter.apps.get(APP_NAME),
  );
  await report("apps.list() first entry  [driver method: select]", async () => {
    const apps = await puter.apps.list();
    console.log(`  count: ${apps.length}`);
    return apps[0];
  });

  console.log("");
  console.log(
    "If `owner` is null on the read rows and populated on the select row,",
  );
  console.log(
    "the SDK's sandbox check is reading a field its own call never returns,",
  );
  console.log(
    "and this is an SDK bug rather than anything about your account.",
  );
};

if (DIAGNOSE) {
  await diagnose();
  process.exit(0);
}

/**
 * The server's code for "that name is taken", which is the one create failure
 * worth explaining rather than merely reporting.
 */
const NAME_IN_USE = "app_name_already_in_use";

const codeOf = (error) => error?.code ?? error?.error?.code ?? "";

/**
 * Finds the app, creating it the first time.
 *
 * Looked up through `apps.list()`, and ONLY through `apps.list()`, which is the
 * one call here that answers "an app of yours by this name". It goes through the
 * `select` driver with `predicate: ['user-can-edit']`, so what it returns is
 * scoped to this account and carries a real `owner`.
 *
 * `apps.get()` is deliberately not used as a fallback, and this is worth
 * spelling out because using it that way is what cost this script two rounds of
 * debugging. `apps.get(name)` goes through the `read` driver, which resolves a
 * name across ALL of Puter and returns no `owner` field at all. It answered
 * with a real uid for an app belonging to a stranger, which read as proof of
 * ownership and was nothing of the kind. The deploy then got all the way to the
 * worker driver before Puter refused with `Actor cannot mint a token for
 * another app`. A uid from `get` means the name exists somewhere; only `list`
 * means it is yours.
 *
 * So: if the listing does not have it, this account does not have it, and the
 * only correct move is to create it. A name conflict then means another account
 * holds the name, which no amount of retrying will change.
 */
const ensureApp = async () => {
  const existing = (await puter.apps.list()).find(
    (app) => app.name === APP_NAME,
  );
  if (existing) return existing;

  console.log(`Creating the "${APP_NAME}" app, once, to own the worker…`);
  try {
    await puter.apps.create(APP_NAME, APP_INDEX_URL);
  } catch (error) {
    if (codeOf(error) !== NAME_IN_USE) throw error;
    fail(
      `The app name "${APP_NAME}" belongs to another Puter account.\n\n` +
        `App names are global, and a worker can only be bound to an app you\n` +
        `own, so this cannot be worked around: pick a different APP_NAME at\n` +
        `the top of this script. \`puter.apps.checkName("<name>")\` will tell\n` +
        `you whether one is free before you try.`,
    );
  }

  const created = (await puter.apps.list()).find(
    (app) => app.name === APP_NAME,
  );
  if (!created)
    fail(`Created the "${APP_NAME}" app but cannot find it. Try again.`);
  return created;
};

const source = await readFile(SOURCE, "utf8");

console.log(`Writing ${REMOTE_PATH} to your Puter storage…`);
await puter.fs.write(REMOTE_PATH, source, {
  overwrite: true,
  dedupeName: false,
  createMissingParents: true,
});

/*
 * `--user-scoped` deploys with no app identity: the third argument becomes
 * `{ sandbox: false }`, the SDK skips the branch entirely, and the worker runs
 * against your own account rather than an app's.
 *
 * Fine for feature 6, which reads and writes only absolute paths and calls
 * every model as the caller through `user.puter`, so it never touches the
 * worker's own namespace. NOT fine for feature 9, whose community feed lives in
 * the app account's own key-value store, which is exactly the namespace this
 * flag gives up. Use it to get unblocked, not to stay unblocked.
 */
const app = USER_SCOPED ? null : await ensureApp();

/**
 * The deployed worker of that name, or null when there is none.
 *
 * `workers.get` resolves to `undefined` rather than rejecting for a name the
 * account has no worker under, so both are folded into one answer.
 */
const getWorker = async (name) => {
  try {
    return (await puter.workers.get(name)) ?? null;
  } catch {
    return null;
  }
};

/**
 * Is this deployed worker already serving the file this script just wrote?
 *
 * Compared by tail rather than exactly. `workers.create` stores the path it was
 * given through `getAbsolutePathForApp`, which turns a relative
 * `roomify/worker.js` into `~/roomify/worker.js` under a user token, and the
 * server reports it expanded to `/<username>/roomify/worker.js`. Those are the
 * same file, and demanding an exact match would delete and redeploy a perfectly
 * good worker every time.
 */
const servesOurSource = (worker) => {
  const filePath = worker?.file_path;
  if (typeof filePath !== "string") return false;
  return (
    filePath === REMOTE_PATH ||
    filePath.replace(/^~/, "").endsWith(`/${REMOTE_PATH}`)
  );
};

/** The name conflict, in both shapes the SDK can surface it. */
const isNameConflict = (error) =>
  codeOf(error) === "conflict" ||
  String(error?.message ?? error?.error ?? "")
    .toLowerCase()
    .includes("already in use");

const announce = (url) => {
  console.log("");
  console.log("Deployed. Put this in .env and in the Vercel project's env:");
  console.log("");
  console.log(`VITE_PUTER_WORKER_URL=${url}`);
  console.log("");
  process.exit(0);
};

const createWorker = () =>
  USER_SCOPED
    ? puter.workers.create(WORKER_NAME, REMOTE_PATH, { sandbox: false })
    : puter.workers.create(WORKER_NAME, REMOTE_PATH, app.name);

/**
 * Deploys, and knows the difference between the two ways a worker that already
 * exists can be handled.
 *
 * The SDK has no update call: `create` is the only way to deploy, and the
 * server answers a second `create` under a live name with
 * `{ code: 'conflict' }`. What it has instead is stated in `create`'s own
 * documentation, that a worker is tied to its name, so changes ship by
 * OVERWRITING ITS SOURCE FILE rather than by creating it again. The worker
 * serves whatever is at its `file_path`, and this script has already written
 * the new source to exactly that path before reaching here. So the normal
 * redeploy is not a create at all, and the conflict was never something to
 * delete our way past: the worker was already updated, and all that was left
 * was to read its URL back.
 *
 * Delete and recreate is kept for the case where in-place cannot work, which is
 * a worker bound to a DIFFERENT file or to a different identity than the one
 * being asked for now, exactly what a half-finished earlier attempt leaves
 * behind (a user-scoped worker where an app-scoped one is wanted, say). Then
 * the old one is removed and deployed again, because there is nothing about it
 * worth keeping.
 */
const deployWorker = async () => {
  const existing = await getWorker(WORKER_NAME);
  const wantedApp = USER_SCOPED ? null : app.uid;

  if (existing && !RECREATE) {
    const boundRight = (existing.app_uid ?? null) === wantedApp;
    if (servesOurSource(existing) && boundRight) {
      console.log(
        `The "${WORKER_NAME}" worker already serves ${REMOTE_PATH}, so the ` +
          `write above updated it in place. No redeploy needed.`,
      );
      announce(existing.url);
    }

    console.log(
      boundRight
        ? `Replacing the "${WORKER_NAME}" worker: it serves ${existing.file_path}, not ${REMOTE_PATH}…`
        : `Replacing the "${WORKER_NAME}" worker: it is bound to a different identity than the one asked for…`,
    );
  } else if (existing) {
    console.log(`Deleting the "${WORKER_NAME}" worker, as --recreate asks…`);
  }

  if (existing) await puter.workers.delete(WORKER_NAME);

  try {
    return await createWorker();
  } catch (error) {
    if (!isNameConflict(error)) throw error;

    // `workers.get` above found nothing, and it is scoped to this account's
    // own token, so a conflict here is the server saying the name is held by
    // SOMEONE ELSE. This used to delete and retry, which is how a `forbidden`
    // ("This is not your worker") ended up being the reported failure: it was
    // trying to destroy a stranger's worker. There is nothing to clear and
    // nothing to retry, so it says so instead.
    fail(
      `The worker name "${WORKER_NAME}" is taken by another Puter account.\n\n` +
        `Worker names are one global namespace, not a per-account one: a\n` +
        `worker is served at https://<worker-name>.puter.work, so the name is\n` +
        `a subdomain and only one account can hold it. This account has no\n` +
        `worker by that name (workers.get found none) and cannot delete the\n` +
        `one that does exist.\n\n` +
        `Pick a different WORKER_NAME at the top of this script. The "${APP_NAME}"\n` +
        `app is unaffected, it is confirmed yours and stays as it is.`,
    );
  }
};

console.log(
  USER_SCOPED
    ? `Deploying the "${WORKER_NAME}" worker, user-scoped…`
    : `Deploying the "${WORKER_NAME}" worker under the "${APP_NAME}" app…`,
);

const deployment = await deployWorker();

if (!deployment?.success) {
  fail(
    `Deploy failed: ${(deployment?.errors ?? ["no reason given"]).join(", ")}`,
  );
}

announce(deployment.url);
