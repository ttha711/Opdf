import { useEffect, useRef } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";

type Props = {
  selected: PdfContentObject | null;
  loading: boolean;
  readOnly: boolean;
  apply: (patches: PdfContentPatch[], message: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export function useNativeContentKeyboard({
  selected,
  loading,
  readOnly,
  apply,
  undo,
  redo,
}: Props) {
  const copiedObjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (command && key === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        void redo();
        return;
      }
      if (!selected || readOnly || loading) return;

      if (command && key === "c") {
        event.preventDefault();
        copiedObjectIdRef.current = selected.id;
        return;
      }
      if (command && key === "v" && copiedObjectIdRef.current) {
        event.preventDefault();
        void apply([{
          type: "duplicate",
          objectId: copiedObjectIdRef.current,
          offsetX: 12,
          offsetY: -12,
        }], "Object pasted.");
        return;
      }
      if (command && key === "d") {
        event.preventDefault();
        void apply([
          { type: "duplicate", objectId: selected.id, offsetX: 12, offsetY: -12 },
        ], "Object duplicated.");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void apply([{ type: "delete", objectId: selected.id }], "Object deleted.");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [apply, loading, readOnly, redo, selected, undo]);
}
