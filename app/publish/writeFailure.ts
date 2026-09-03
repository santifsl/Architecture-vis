/**
 * A store failure, said in the publish feature's own words.
 *
 * Its own module because both `publish.ts` and `unpublish.ts` need it and
 * neither should import the other: they are two halves of one control and
 * making one depend on the other would put a cycle one refactor away.
 */
import type { StoreFailure } from "~/projects/store";
import type { PublishFailure } from "~/publish/failures";

export const writeFailure = (failure: StoreFailure): PublishFailure =>
  failure === "signedOut"
    ? "signedOut"
    : failure === "notFound"
      ? "notFound"
      : failure === "superseded"
        ? "superseded"
        : "notSaved";
