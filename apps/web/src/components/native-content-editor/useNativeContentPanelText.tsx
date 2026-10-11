import { useCallback, useState } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { NativeContentPanelTextEditor } from "./NativeContentPanelTextEditor";

type Props = {
  selected: PdfContentObject | null;
  readOnly: boolean;
  apply: (patches: PdfContentPatch[], message: string) => Promise<Uint8Array | null>;
};

export function useNativeContentPanelText({ selected, readOnly, apply }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editSelectedText = useCallback(() => {
    if (selected?.kind !== "text" || readOnly) return;
    setEditingId(selected.id);
  }, [selected, readOnly]);

  const panelTextEditor = selected?.kind === "text" && selected.id === editingId
    ? <NativeContentPanelTextEditor object={selected}
        onCancel={() => setEditingId(null)}
        onApply={async (text) => {
          if (text === (selected.text ?? "")) return true;
          const patches: PdfContentPatch[] = [];
          if (/[^\x00-\x7F]/.test(text)) {
            patches.push({
              type: "style-text", objectId: selected.id,
              fontFamily: "__opdf_unicode__", fontSize: selected.fontSize,
            });
          }
          patches.push({ type: "replace-text", objectId: selected.id, text });
          return Boolean(await apply(patches, "Text applied. Check the Save status in the toolbar."));
        }} />
    : null;

  return { editSelectedText, panelTextEditor };
}
