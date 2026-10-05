import { useEffect, useRef } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";

type Props = {
  selected: PdfContentObject | null;
  loading: boolean;
  readOnly: boolean;
  apply: (patches: PdfContentPatch[], message: string) => Promise<void>;
  move: (dx: number, dy: number) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export function useNativeContentKeyboard({
  selected,
  loading,
  readOnly,
  apply,
  move,
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

      const step = event.shiftKey ? 10 : 1;
      const arrow = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }[event.key] as [number, number] | undefined;
      if (arrow) {
        event.preventDefault();
        move(...arrow);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void apply([{ type: "delete", objectId: selected.id }], "Object deleted.");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [apply, loading, move, readOnly, redo, selected, undo]);
}
