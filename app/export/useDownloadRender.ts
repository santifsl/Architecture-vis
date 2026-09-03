/**
 * The download control's own small state machine. Spec 0012, build task 4.
 *
 * Local to the component and never persisted, because nothing about a download
 * is worth remembering: it is a read, it changes no record, and a reload should
 * leave a project looking exactly as it did.
 *
 *   available -> busy -> available   the file was handed to the browser
 *             -> busy -> failed      with a sentence, and a retry on two of
 *                                    the three codes
 *
 * The `unavailable` state is not in here. It is decided by the render's view,
 * which the component already has, and a hook holding a copy of it would be a
 * second answer to a question the record already answers.
 */
import { useCallback, useRef, useState } from "react";

import { saveBlob } from "~/export/download";
import type { DownloadFailure } from "~/export/failures";
import { downloadFilename } from "~/export/rules";
import { readRenderBlob } from "~/export/store";

export type DownloadState = "available" | "busy" | "failed";

export type DownloadRenderControl = {
  readonly state: DownloadState;
  /** The code behind a `failed` state, or null. The component turns it into a sentence. */
  readonly failure: DownloadFailure | null;
  /** The button's action. Does nothing while busy. */
  readonly download: () => void;
};

export const useDownloadRender = ({
  path,
  projectName,
}: {
  /** Where the render is stored, or null while there is no file to read. */
  readonly path: string | null;
  readonly projectName: string;
}): DownloadRenderControl => {
  const [state, setState] = useState<DownloadState>("available");
  const [failure, setFailure] = useState<DownloadFailure | null>(null);

  /*
   * The busy guard, held in a ref rather than read off `state`.
   *
   * `aria-disabled` does not stop a click, so refusing the second press is the
   * handler's job and never the attribute's, the same rule `AuthControl` and
   * `useSignIn` already follow. It has to be a ref because two clicks inside one
   * React batch would both see the same stale `state`, and AC-4 asks for exactly
   * one file from two quick presses.
   */
  const busy = useRef(false);

  const download = useCallback(() => {
    if (busy.current || path === null) return;
    busy.current = true;
    setState("busy");
    setFailure(null);

    void (async () => {
      const read = await readRenderBlob(path);

      if (!read.ok) {
        busy.current = false;
        setFailure(read.failure);
        setState("failed");
        return;
      }

      const saved = saveBlob(read.value, downloadFilename(projectName));
      busy.current = false;
      setFailure(saved ? null : "unreachable");
      setState(saved ? "available" : "failed");
    })();
  }, [path, projectName]);

  return { state, failure, download };
};
