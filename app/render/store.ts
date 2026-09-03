/**
 * The one place in the app that calls the render worker. Spec 0006, build
 * task 6.
 *
 * Puter is reached only through `withPuter` from `app/platform/puter.ts`, the
 * one module allowed to import the SDK, same as every other store here.
 *
 * Nothing in this module throws at its caller and nothing raw escapes it. Every
 * outcome is either a path, or one of the codes in
 * `app/render/failures.ts`, so the hook above it never has to know what a
 * rejected fetch, an HTML error page, or a provider message looks like.
 *
 * The worker is the one thing in this system with no types, no lint, and no
 * local run, so its answer is PARSED rather than cast. `parseRenderResponse`
 * does for a worker response what `parseProject` does for a stored record: a
 * body of the wrong shape is a failure with a sentence, not a `Project` shaped
 * hole that surfaces three screens later.
 */
import { workerEndpoint } from "~/platform/env";
import { PuterGateError, withPuter } from "~/platform/puter";
import type { ModelId } from "~/projects/record";
import { isRenderFailure, type RenderFailure } from "~/render/failures";
import { RENDER_TIMEOUT_MS } from "~/render/rules";

/** What one render asks the worker for. Exactly this, and nothing else, goes on the wire. */
export type RenderRequest = {
  /** The floor plan's ABSOLUTE path. A relative one means a different file inside the worker. */
  readonly plan: string;
  /** The ABSOLUTE path to write to, under `renders/` in the same app data root. */
  readonly out: string;
  readonly model: ModelId;
};

/** What a finished render produced. `path` is always the `out` that was asked for. */
export type RenderProduct = {
  readonly path: string;
};

export type RenderOutcome =
  | { readonly ok: true; readonly value: RenderProduct }
  | { readonly ok: false; readonly failure: RenderFailure };

const failed = (failure: RenderFailure): RenderOutcome => ({
  ok: false,
  failure,
});

/**
 * The plan's absolute path, read once per project and reused.
 *
 * The record stores the path the upload used, which is relative to this app's
 * own data directory. That is the right thing to store, but it is the wrong
 * thing to send: a worker runs under its OWN app identity, so the same relative
 * path resolves somewhere else entirely in there. `fs.stat` is what turns one
 * into the other, and it is the only place this conversion happens.
 */
export const readAbsolutePath = async (
  path: string,
): Promise<
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly failure: RenderFailure }
> => {
  try {
    const item = await withPuter((sdk) => sdk.fs.stat(path));
    return item.path.length > 0
      ? { ok: true, value: item.path }
      : { ok: false, failure: "planUnreadable" };
  } catch (error: unknown) {
    if (error instanceof PuterGateError)
      return { ok: false, failure: "signedOut" };
    return { ok: false, failure: "planUnreadable" };
  }
};

/**
 * Narrows the worker's answer instead of trusting it.
 *
 * A success needs a `path` equal to the `out` that was sent, and nothing else.
 * Checking the path back is not ceremony: `out` is where the image was meant to
 * be written, the worker echoes it only after the write succeeded, and a
 * different path coming back would mean the record ends up pointing at a file
 * that is not the one that was made.
 *
 * Any extra key in the body is IGNORED rather than refused, which is what makes
 * spec 0007's migration order safe: this ships before the worker does, so for
 * one window it is reading answers from a worker that still sends a `prompt`,
 * and those answers have to keep working.
 *
 * Anything else, valid JSON of the wrong shape, a truncated body, or an HTML
 * error page from something in between, is `badResponse`.
 */
export const parseRenderResponse = (
  body: unknown,
  out: string,
): RenderProduct | null => {
  if (typeof body !== "object" || body === null) return null;
  const { path } = body as { path?: unknown };
  if (typeof path !== "string" || path !== out) return null;
  return { path };
};

/** The code inside a failure body, if it is one this app knows. */
const failureCode = (body: unknown): RenderFailure | null => {
  if (typeof body !== "object" || body === null) return null;
  const { errorCode } = body as { errorCode?: unknown };
  return isRenderFailure(errorCode) ? errorCode : null;
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Runs one render, and waits at most two minutes for it. Spec 0006, AC-13.
 *
 * The wait is enforced with a real `AbortController`, so a timeout hangs up the
 * request rather than only ceasing to care about it. That is worth doing and it
 * is not enough on its own: the worker may keep working regardless, and its
 * answer can still land later. What makes a late answer harmless is the
 * `startedAt` stamp the hook compares before every write, not this abort.
 *
 * `workers.exec` rather than a bare `fetch`, because it is what attaches the
 * caller's Puter session to the request. That session is the whole security
 * model: the worker acts as the caller, so it can only reach that person's own
 * files and their own model allowance, and it has no credential of its own.
 */
export const requestRender = async (
  request: RenderRequest,
): Promise<RenderOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, RENDER_TIMEOUT_MS);

  try {
    const response = await withPuter((sdk) =>
      sdk.workers.exec(workerEndpoint("/render"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: request.plan,
          out: request.out,
          model: request.model,
        }),
        signal: controller.signal,
      }),
    );

    const body = await readJson(response);

    if (!response.ok) {
      // A 401 is the session having gone while the render ran, which is a
      // different thing to tell someone than a model that fell over.
      if (response.status === 401) return failed("signedOut");
      return failed(failureCode(body) ?? "badResponse");
    }

    const product = parseRenderResponse(body, request.out);
    return product === null
      ? failed("badResponse")
      : { ok: true, value: product };
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return failed("signedOut");
    if (controller.signal.aborted) return failed("timeout");
    return failed("unreachable");
  } finally {
    clearTimeout(timer);
  }
};
