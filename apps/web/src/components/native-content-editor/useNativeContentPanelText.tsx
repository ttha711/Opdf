import { useCallback, useState } from "react";
import type { PdfContentObject, PdfContentPatch } from "@tpdf/core";
import { NativeContentPanelTextEditor } from "./NativeContentPanelTextEditor";

type Props = {
  selected: PdfContentObject | null;
  objects: PdfContentObject[];
  readOnly: boolean;
  apply: (patches: PdfContentPatch[], message: string) => Promise<Uint8Array | null>;
};

export function useNativeContentPanelText({ selected, objects, readOnly, apply }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editSelectedText = useCallback(() => {
    if (selected?.kind !== "text" || readOnly) return;
    setEditingId(selected.id);
  }, [selected, readOnly]);

  const editObjectById = useCallback((id: string) => {
    const object = objects.find((item) => item.id === id);
    if (object?.kind === "text" && (object.depth ?? 0) <= 1) setEditingId(id);
  }, [objects]);
  const editingObject = objects.find((item) => item.id === editingId);
  const panelTextEditor = editingObject?.kind === "text"
    ? <NativeContentPanelTextEditor object={editingObject}
        onCancel={() => setEditingId(null)}
        onApply={async (text) => {
          if (text === (editingObject.text ?? "")) return true;
          const patches: PdfContentPatch[] = [];
          if (/[^\x00-\x7F]/.test(text)) {
            patches.push({
              type: "style-text", objectId: editingObject.id,
              fontFamily: "__opdf_unicode__", fontSize: editingObject.fontSize,
            });
          }
          patches.push({ type: "replace-text", objectId: editingObject.id, text });
          return Boolean(await apply(patches, "Text applied. Check the Save status in the toolbar."));
        }} />
    : null;

  return { editSelectedText, editObjectById, panelTextEditor };
}
