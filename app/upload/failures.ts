/**
 * Every way an upload can fail, and the one sentence each one shows.
 * Spec 0005, build task 3, AC-13.
 *
 * Same shape as `app/projects/store.ts`'s `StoreFailure`, on purpose: two
 * modules that both turn a Puter rejection into something a person can read
 * should read alike, or the next one invents a third convention.
 *
 * The rule these sentences follow, from CLAUDE.md: a person never sees a raw
 * exception, a provider message, an HTTP status, or an SDK error code. Every
 * sentence here says what happened and what to do about it, and none of them
 * needs the reader to know that Puter exists.
 */
import { ALLOWED_TYPES, MAX_BYTES, type PlanRejection } from "~/upload/plan";

/** Why an upload did not happen. Internal; the sentence is what a person sees. */
export type UploadFailure =
  PlanRejection | "signedOut" | "noSpace" | "unreachable" | "writeFailed";

const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024));

/** The readable list of types, for the sentence and for the input's `accept`. */
const typeNames = ALLOWED_TYPES.map((type) =>
  type.replace("image/", "").toUpperCase(),
)
  .join(", ")
  .replace(/, ([^,]*)$/, " or $1");

export const UPLOAD_MESSAGES: Readonly<Record<UploadFailure, string>> = {
  wrongType: `That file type won't work. Use a ${typeNames} image of your floor plan.`,
  tooLarge: `That file is over ${megabytes(MAX_BYTES)} MB. Try a smaller export, or a photo rather than a full resolution scan.`,
  notAnImage:
    "That file isn't an image, even though its name suggests it is. Try the original file.",
  signedOut: "You're signed out. Sign in and your floor plan will upload.",
  noSpace:
    "There isn't enough room in your Puter storage for this file. Free some space, then try again.",
  unreachable:
    "Couldn't reach your storage just now. Check your connection and try again.",
  writeFailed: "The upload didn't finish. Try again.",
};

/** What every call in this feature returns. Nothing here ever throws at a caller. */
export type UploadResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly failure: UploadFailure;
      readonly message: string;
    };

export const succeed = <T>(value: T): UploadResult<T> => ({ ok: true, value });

export const fail = <T>(failure: UploadFailure): UploadResult<T> => ({
  ok: false,
  failure,
  message: UPLOAD_MESSAGES[failure],
});
