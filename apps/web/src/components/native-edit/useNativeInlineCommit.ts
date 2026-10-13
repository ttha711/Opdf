import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PdfContentObject } from "@tpdf/core";
import { applyNativeEditPatches } from "../../lib/nativeEditRuntime";
import { nativeEditTextCommitPatches } from "./nativeEditTextCommit";
import type { NativeEditTextLine } from "./nativeEditTextRun";

type Props = {
  selected: PdfContentObject | null;
  editingText: string | null;
  groupedTextLines: NativeEditTextLine[];
  setEditingText: Dispatch<SetStateAction<string | null>>;
  setEditingObject: Dispatch<SetStateAction<PdfContentObject | null>>;
  setGroupedTextLines: Dispatch<SetStateAction<NativeEditTextLine[]>>;
  setIsApplying: Dispatch<SetStateAction<boolean>>;
};

export function useNativeInlineCommit({
  selected,
  editingText,
  groupedTextLines,
  setEditingText,
  setEditingObject,
  setGroupedTextLines,
  setIsApplying,
}: Props) {
  const commitPromiseRef = useRef<Promise<Uint8Array | null> | null>(null);
  const latestRef = useRef({ selected, editingText, groupedTextLines });
  latestRef.current = { selected, editingText, groupedTextLines };

  return useCallback(async () => {
    if (commitPromiseRef.current) return commitPromiseRef.current;
    const latest = latestRef.current;
    if (!latest.selected || latest.selected.kind !== "text" || latest.editingText === null) return null;
    const nextText = latest.editingText;
    const selectedObject = latest.selected;
    const commit = (async () => {
      setIsApplying(true);
      try {
      if (nextText === (selectedObject.text ?? "")) {
        setEditingText(null);
        setEditingObject(null);
        setGroupedTextLines([]);
        return null;
      }
      const patches = nativeEditTextCommitPatches(selectedObject, latest.groupedTextLines, nextText);
      // Let the browser paint "Applying" before heavy PDFium operations.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const bytes = await applyNativeEditPatches(
        patches,
        "Text applied. Check the Save status in the toolbar.",
      );
      // Preserve the draft when the editing engine reports failure.
      if (!bytes) throw new Error("Unable to apply PDF text; your draft is still available.");
      // The panel already reopened and verified these PDF bytes. The next
      // document revision reloads the selection overlay automatically.
      latestRef.current.editingText = null;
      setEditingText(null);
      setEditingObject(null);
      setGroupedTextLines([]);
      return bytes;
      } finally {
        setIsApplying(false);
      }
    })();
    commitPromiseRef.current = commit;
    try {
      return await commit;
    } finally {
      if (commitPromiseRef.current === commit) commitPromiseRef.current = null;
    }
  }, [setEditingObject, setEditingText, setGroupedTextLines, setIsApplying]);
}
