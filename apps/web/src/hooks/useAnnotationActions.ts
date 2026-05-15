import type { Annotation } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import type { PendingRect } from "../lib/app-types";
import { useOpdfBridge } from "./useOpdfBridge";

export function useAnnotationActions({
  bridge,
  fileName,
  noteText,
  signatureStyle,
  setAnnotations,
  setViewerError,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  noteText: string;
  signatureStyle: string;
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
}) {
  async function addHighlight(pageNumber: number, rect: PendingRect) {
    if (!fileName) return;
    const tempId = crypto.randomUUID();
    const payload = { color: "#facc15", opacity: 0.4, ...rect };
    const optimistic: Annotation = {
      id: tempId,
      page: pageNumber,
      kind: "highlight",
      payload,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setAnnotations((prev) => [...prev, optimistic]);
    try {
      const created = await bridge.createAnnotation(fileName, {
        page: pageNumber,
        kind: "highlight",
        payload,
      });
      setAnnotations((prev) => prev.map((a) => (a.id === tempId ? created : a)));
    } catch {
      setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      setViewerError("Failed to save highlight");
    }
  }

  async function createToolAnnotation(kind: "note" | "shape" | "signature" | "redact", pageNumber: number, rect: PendingRect) {
    if (!fileName) return;
    const tempId = crypto.randomUUID();
    const payload =
      kind === "note"
        ? { text: noteText || "New note", x: rect.x, y: rect.y }
        : kind === "shape"
          ? { shape: "rectangle", stroke: "#ef4444", ...rect }
          : kind === "redact"
            ? { shape: "rectangle", ...rect }
            : { signer: signatureStyle, ...rect };
    const optimistic: Annotation = { id: tempId, page: pageNumber, kind, payload, createdAt: Date.now(), updatedAt: Date.now() };
    setAnnotations((prev) => [...prev, optimistic]);
    try {
      const created = await bridge.createAnnotation(fileName, { page: pageNumber, kind, payload });
      setAnnotations((prev) => prev.map((a) => (a.id === tempId ? created : a)));
    } catch {
      setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      setViewerError(`Failed to save ${kind}`);
    }
  }

  async function undoAnnotations() {
    if (!fileName) return;
    setAnnotations(await bridge.undoAnnotation(fileName));
  }

  async function redoAnnotations() {
    if (!fileName) return;
    setAnnotations(await bridge.redoAnnotation(fileName));
  }

  async function removeAnnotation(id: string) {
    if (!fileName) return;
    await bridge.deleteAnnotation(fileName, id);
    setAnnotations(await bridge.listAnnotations(fileName));
  }

  async function updateAnnotation(id: string, payload: Record<string, unknown>) {
    if (!fileName) return;
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, payload: { ...(a.payload as object), ...payload }, updatedAt: Date.now() }
          : a
      )
    );
    try {
      await bridge.updateAnnotation(fileName, id, payload);
    } catch {
      setViewerError("Failed to update annotation");
    }
  }

  return { addHighlight, createToolAnnotation, undoAnnotations, redoAnnotations, removeAnnotation, updateAnnotation };
}
