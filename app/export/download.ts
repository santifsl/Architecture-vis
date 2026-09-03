/**
 * Handing the browser a file to save. Spec 0012, build task 1 and task 3.
 *
 * This is the half of the feature the whole mechanism rests on, and it is worth
 * saying why it is shaped like this rather than as an anchor pointed at the
 * render's URL. The `download` attribute is honoured only for a same origin
 * URL, and every URL this app can produce for a stored file sits on a Puter
 * origin, so an anchor pointed at one opens the image in a tab and names it
 * whatever the server says. An object URL made from a blob this page already
 * holds is same origin by construction, so the attribute is honoured and the
 * chosen filename survives.
 *
 * Nothing decodes, re-encodes or resizes anything here. The blob goes to disk as
 * the bytes that came off storage, which is what AC-2 means by full resolution.
 */

/**
 * Saves a blob under a filename. Returns false if the DOM work threw.
 *
 * It never throws at its caller, per AC-9: the caller turns a `false` into the
 * `unreachable` sentence. Nothing after the click is knowable from here, since
 * whether a person kept the file, cancelled the sheet, or has a full disk is
 * not something the page is told.
 *
 * The object URL is revoked on a later task rather than synchronously after the
 * click, because revoking in the same task can cancel the save in some browsers.
 */
export const saveBlob = (blob: Blob, filename: string): boolean => {
  let url: string | null = null;

  try {
    url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    // Firefox only fires a synthetic click on an anchor that is in the document.
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return true;
  } catch {
    return false;
  } finally {
    if (url !== null) {
      const created = url;
      setTimeout(() => {
        URL.revokeObjectURL(created);
      }, 0);
    }
  }
};
