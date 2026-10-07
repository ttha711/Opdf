import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import {
  applyNativeEditPatches,
  registerNativeInlineCommitter,
} from "../../lib/nativeEditRuntime";

type Props = {
  selected: PdfContentObject | null;
  editingText: string | null;
  setEditingText: Dispatch<SetStateAction<string | null>>;
};

export function useNativeInlineEditCommit({
  selected,
  editingText,
  setEditingText,
}: Props) {
  const mountedRef = useRef(true);
  const commitPromiseRef = useRef<Promise<void> | null>(null);
  const selectedRef = useRef<PdfContentObject | null>(selected);
  const editingTextRef = useRef<string | null>(editingText);
  selectedRef.current = selected;
  editingTextRef.current = editingText;

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const commitInlineText = useCallback(async () => {
    if (commitPromiseRef.current) return commitPromiseRef.current;
    const target = selectedRef.current;
    const nextText = editingTextRef.current;
    if (!target || target.kind !== "text" || nextText === null) return;
    if (nextText === (target.text ?? "")) {
      if (mountedRef.current) setEditingText(null);
      return;
    }

    const commit = (async () => {
      const unicodeFallback = /[^\x00-\x7F]/.test(nextText);
      const patches: PdfContentPatch[] = [];
      if (unicodeFallback) {
        patches.push({
          type: "style-text",
          objectId: target.id,
          fontFamily: "__opdf_unicode__",
          fontSize: target.fontSize,
        });
      }
      patches.push({ type: "replace-text", objectId: target.id, text: nextText });
      await applyNativeEditPatches(
        patches,
        unicodeFallback ? "Inline text updated with Unicode fallback." : "Inline text updated.",
      );
      if (mountedRef.current) setEditingText(null);
    })();

    commitPromiseRef.current = commit;
    try {
      await commit;
    } finally {
      if (commitPromiseRef.current === commit) commitPromiseRef.current = null;
    }
  }, [setEditingText]);

  useEffect(() => {
    if (editingText === null) return;
    return registerNativeInlineCommitter(commitInlineText);
  }, [commitInlineText, editingText]);

  return {
    commitInlineText,
    editingTextRef,
    mountedRef,
  };
}
