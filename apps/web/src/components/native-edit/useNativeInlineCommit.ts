import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { applyNativeEditPatches } from "../../lib/nativeEditRuntime";

type Props = {
  selected: PdfContentObject | null;
  editingText: string | null;
  setEditingText: Dispatch<SetStateAction<string | null>>;
  refreshObjectsFromBytes: (bytes: Uint8Array) => void | Promise<void>;
};

export function useNativeInlineCommit({
  selected,
  editingText,
  setEditingText,
  refreshObjectsFromBytes,
}: Props) {
  const commitPromiseRef = useRef<Promise<void> | null>(null);

  return async function commitInlineText() {
    if (commitPromiseRef.current) return commitPromiseRef.current;
    if (!selected || selected.kind !== "text" || editingText === null) return;
    const nextText = editingText;
    const selectedObject = selected;
    const commit = (async () => {
      setEditingText(null);
      if (nextText === (selectedObject.text ?? "")) return;
      const unicodeFallback = /[^\x00-\x7F]/.test(nextText);
      const patches: PdfContentPatch[] = [];
      if (unicodeFallback) {
        patches.push({
          type: "style-text",
          objectId: selectedObject.id,
          fontFamily: "__opdf_unicode__",
          fontSize: selectedObject.fontSize,
        });
      }
      patches.push({ type: "replace-text", objectId: selectedObject.id, text: nextText });
      const bytes = await applyNativeEditPatches(
        patches,
        unicodeFallback ? "Inline text updated with Unicode fallback." : "Inline text updated.",
      );
      if (bytes) await refreshObjectsFromBytes(bytes);
    })();
    commitPromiseRef.current = commit;
    try {
      await commit;
    } finally {
      if (commitPromiseRef.current === commit) commitPromiseRef.current = null;
    }
  };
}
