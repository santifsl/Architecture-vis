/**
 * Reading a stored render back out as bytes. Spec 0012, build task 3.
 *
 * Puter is reached only through `withPuter` from `app/platform/puter.ts`, the
 * one module allowed to import the SDK, same as every other store here. Nothing
 * in this module writes: no `puter.kv` call, no queue entry, no worker request,
 * so a project's `revision` is the same after a hundred downloads as before the
 * first (AC-10).
 *
 * ## The stat is gone, and that is a correction to the spec
 *
 * Spec 0012 asked for a `puter.fs.stat` before the read, and told the three
 * failures apart by WHICH call rejected: a stat that rejected for any reason but
 * a gate error was `unreadable`, and only a stat that succeeded followed by a
 * failing read was `unreachable`. That was built exactly as written, and the
 * offline walk found it wrong.
 *
 * A stat rejection has at least two causes, a missing file and an unreachable
 * one, so keying on which call failed cannot separate them: with the network
 * down the stat fails first and every offline download reported the render as
 * missing. Worse, the rule made `unreachable` almost unreachable itself, since
 * producing it required the network to survive the stat and die before the read.
 * The one code the extra round trip was bought to enable was the one it hid.
 *
 * So the discrimination moved from WHICH call failed to WHY it failed, and once
 * it did the stat had nothing left to do. `isMissingError` reads the structured
 * `code` and `status` on the rejection, which is a stronger test than the spec
 * feared: a missing subject carries them, and a transport failure rejects with a
 * bare `TypeError` carrying neither, so the two are told apart by shape rather
 * than by parsing any message. `app/upload/store.ts` has relied on that same
 * discrimination since spec 0005, which is why the predicate is shared rather
 * than new.
 *
 * The download is now one round trip instead of two, which also settles the cost
 * spec 0012's Consequences flagged.
 */
import { fail, succeed, type DownloadResult } from "~/export/failures";
import { isMissingError, PuterGateError, withPuter } from "~/platform/puter";

/**
 * The bytes at a stored path, exactly as they were written.
 *
 * `fs.read` resolves to a `Blob`, which is handed straight to the caller. There
 * is no canvas, no `toDataURL`, and no image element anywhere in this path, so
 * nothing can quietly re-encode or resize the render on its way to disk.
 *
 * The three codes, decided by the shape of the rejection and nothing else:
 *
 *   PuterGateError            -> signedOut    the call was made while signed out
 *   code or status says gone  -> unreadable   the file is not in storage
 *   anything else             -> unreachable  transport, a 500, CORS, offline
 *
 * The whole file lands in memory before the save begins. For the square renders
 * this app produces that is fine, and it would not be for a very large file, so
 * this is not a pattern to reach for again without thinking about it.
 */
export const readRenderBlob = async (
  path: string,
): Promise<DownloadResult<Blob>> => {
  try {
    const blob = await withPuter((sdk) => sdk.fs.read(path));
    return succeed(blob);
  } catch (error: unknown) {
    if (error instanceof PuterGateError) return fail("signedOut");
    if (isMissingError(error)) return fail("unreadable");
    return fail("unreachable");
  }
};
