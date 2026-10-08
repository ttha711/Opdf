import { useCallback, useRef } from "react";
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
  const latestRef = useRef({ selected, editingText, refreshObjectsFromBytes });
  latestRef.current = { selected, editingText, refreshObjectsFromBytes };

  return useCallback(async () => {
    if (commitPromiseRef.current) return commitPromiseRef.current;
    const latest = latestRef.current;
    if (!latest.selected || latest.selected.kind !== "text" || latest.editingText === null) return;
    const nextText = latest.editingText;
    const selectedObject = latest.selected;
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
      if (bytes) await latestRef.current.refreshObjectsFromBytes(bytes);
    })();
    commitPromiseRef.current = commit;
    try {
      await commit;
    } finally {
      if (commitPromiseRef.current === commit) commitPromiseRef.current = null;
    }
  }, [setEditingText]);
}
