/**
 * Text edits rewrite the whole PDF in the browser's WASM heap and then reopen it
 * to verify the result, which holds several copies of the file at once. A real
 * 115 MB drawing set edits and saves fine; a 262 MB one crashed the tab on
 * commit. Refuse up front instead of losing the tab (and unsaved work).
 */
export const NATIVE_EDIT_MAX_BYTES = 200 * 1024 * 1024;

export class NativeEditTooLargeError extends Error {
  constructor(bytes: number) {
    super(`This PDF is ${Math.round(bytes / 1024 / 1024)} MB. Editing text in the browser supports files up to ` +
      `${Math.round(NATIVE_EDIT_MAX_BYTES / 1024 / 1024)} MB; the file was not changed.`);
    this.name = "NativeEditTooLargeError";
  }
}
