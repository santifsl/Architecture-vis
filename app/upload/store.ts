/**
 * The one place in the app that puts a floor plan into Puter storage and gets a
 * URL back out. Spec 0005, build task 4.
 *
 * Puter is reached only through `withPuter` from `app/platform/puter.ts`, the
 * one module allowed to import the SDK, same as `app/projects/store.ts`.
 *
 * Two things here are load bearing rather than incidental:
 *
 * `fs.space()` is read before every write (AC-6). Not for tidiness: a storage
 * refusal makes the SDK show Puter's OWN usage dialog and then reject as well.
 * `promptIfStorageLimitError` says so in as many words, "prompt AND reject,
 * never prompt instead of rejecting", so an app cannot swallow it. Checking
 * first means the ordinary out of space case is refused in our own words and
 * that dialog never opens. It does not remove the dialog, it makes it rare: two
 * tabs uploading at once can still land in the genuine race, which is why the
 * rejection is handled too (AC-7).
 *
 * Nothing here stores a URL (AC-3). `getReadURL` expires, so the only durable
 * identifier is the path, and a view URL is minted on demand. That minting used
 * to live in this file; spec 0006 moved it to `app/storage/urls.ts` once
 * renders needed it too, because a second caller is where a copy would have
 * started.
 */
import { isMissingError, PuterGateError, withPuter } from "~/platform/puter";
import type { FloorPlan } from "~/projects/record";
import { forgetStoredUrl } from "~/storage/urls";
import { fail, succeed, type UploadResult } from "~/upload/failures";
import { planPath, type AllowedType } from "~/upload/plan";

/**
 * Turns anything thrown below into a failure, so no exception reaches a caller.
 *
 * `PuterGateError` is told apart because it means the call was made while
 * signed out, which is a different sentence and a different fix from a network
 * that would not answer.
 */
const toFailure = <T>(error: unknown): UploadResult<T> =>
  error instanceof PuterGateError ? fail("signedOut") : fail("unreachable");

/**
 * Is there room for this many bytes? Spec 0005, AC-6.
 *
 * Exported so the hook can refuse before it starts a write, and so the check is
 * visible in the network panel as its own call during verification.
 */
export const hasRoomFor = async (
  bytes: number,
): Promise<UploadResult<boolean>> => {
  try {
    const space = await withPuter((sdk) => sdk.fs.space());
    return succeed(space.capacity - space.used >= bytes);
  } catch (error: unknown) {
    return toFailure(error);
  }
};

/** What the caller passes to start an upload. */
export type UploadPlanInput = {
  readonly file: File;
  /** The type `validatePlanFile` already proved, so this module does not re check it. */
  readonly type: AllowedType;
  /** Called with 0 to 1 as the write progresses. Drives the busy hairline. */
  readonly onProgress: (fraction: number) => void;
  /**
   * Handed a function that cancels this write, so a caller that goes away can
   * stop it. Spec 0005, AC-17.
   *
   * The spec originally said to use `write`'s `abort` option for this. That was
   * wrong about the SDK and the build corrected it: `abort` is a NOTIFICATION
   * fired after a cancellation finishes, typed `(operationId: string) => void`,
   * so it can tell you an upload stopped but cannot stop one. The handle is
   * `init(operationId, xhr)`, whose `xhr.abort` the SDK overrides to cancel the
   * signed upload for real. Passing `abort` and expecting it to cancel would
   * have compiled if the types were looser, and silently never cancelled
   * anything.
   */
  readonly onAbortReady?: (abort: () => void) => void;
};

/**
 * Writes a plan and returns where it landed. Spec 0005, AC-1, AC-6, AC-7.
 *
 * `createMissingParents` is not optional here even though it looks like a
 * detail: it defaults to `false`, so without it the very first upload from a
 * fresh account fails because `plans/` does not exist yet. That is the least
 * convenient moment for this to break and the easiest one to miss in testing,
 * since any account that has uploaded once already has the directory.
 *
 * `dedupeName` stays off (AC-2). The id prefix already makes collisions
 * impossible, and with dedupe on the stored path would be whatever the server
 * renamed it to rather than the path asked for.
 */
export const uploadPlan = async ({
  file,
  type,
  onProgress,
  onAbortReady,
}: UploadPlanInput): Promise<UploadResult<FloorPlan>> => {
  const room = await hasRoomFor(file.size);
  if (!room.ok) return fail(room.failure);
  if (!room.value) return fail("noSpace");

  const path = planPath(file.name, type);

  try {
    await withPuter((sdk) =>
      sdk.fs.write(path, file, {
        overwrite: true,
        dedupeName: false,
        createMissingParents: true,
        progress: (_operationId: string, fraction: number) => {
          onProgress(fraction);
        },
        init: (_operationId: string, xhr: XMLHttpRequest) => {
          onAbortReady?.(() => {
            xhr.abort();
          });
        },
      }),
    );

    return succeed({ path });
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return fail("signedOut");
    // The race AC-7 names: space ran out between the check above and this
    // write. Puter has already shown its own dialog by now and we cannot stop
    // it, so the most we can do is say something sensible ourselves.
    if (isStorageRefusal(error)) return fail("noSpace");
    return fail("writeFailed");
  }
};

/**
 * The shapes a storage refusal arrives in, mirroring the SDK's own check.
 *
 * Restated here rather than imported because the SDK's version is internal to a
 * module this app is not allowed to import. If Puter adds a fourth shape this
 * goes stale, and the cost is one refusal reported as `writeFailed` instead of
 * `noSpace`, which is wrong but not harmful.
 */
const isStorageRefusal = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return (
    code === "storage_limit_reached" ||
    code === "NOT_ENOUGH_SPACE" ||
    status === 413
  );
};

/**
 * Removes a stored plan. Spec 0005, AC-10.
 *
 * A path that is already gone counts as success, because the caller's goal is
 * that the file is not there and it is not there. The one caller is Replace,
 * which deletes the plan it is superseding, and a missing file is exactly what
 * it wants. Reporting that as a failure would make Replace look broken in the
 * one case where nothing is wrong.
 */
export const deletePlan = async (path: string): Promise<UploadResult<void>> => {
  forgetStoredUrl(path);

  try {
    await withPuter((sdk) => sdk.fs.delete(path));
    return succeed(undefined);
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return fail("signedOut");
    if (isMissingError(error)) return succeed(undefined);
    return fail("unreachable");
  }
};

/*
 * `isMissing` used to live here, private to this module. Spec 0012 needed the
 * same question in `app/export/store.ts`, so it moved to `app/platform/puter.ts`
 * as `isMissingError` rather than being copied: it is a fact about the shape of
 * a Puter rejection, which is what that boundary is for.
 */
