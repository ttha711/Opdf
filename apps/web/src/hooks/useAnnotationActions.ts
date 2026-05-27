import type { Annotation } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import type { AnnotationToolDefaults, PendingRect } from "../lib/app-types";
import { useOpdfBridge } from "./useOpdfBridge";

export function useAnnotationActions({
  bridge,
  fileName,
  noteText,
  signatureStyle,
  annotationToolDefaults,
  setAnnotations,
  setViewerError,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  noteText: string;
  signatureStyle: string;
  annotationToolDefaults: AnnotationToolDefaults;
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
}) {
  async function addHighlight(pageNumber: number, rect: PendingRect) {
    if (!fileName) return;
    const tempId = crypto.randomUUID();
    const defaults = annotationToolDefaults.highlight;
    const payload = { color: defaults.color, opacity: defaults.opacity, strokeWidth: defaults.size, ...rect };
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

  async function createToolAnnotation(kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: PendingRect & { image?: string; imageType?: string }) {
    if (!fileName) return;
    const tempId = crypto.randomUUID();
    const payload =
      kind === "image"
        ? { image: rect.image, imageType: rect.imageType, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : kind === "note"
          ? ((rect as any).isPatch
            ? {
                isPatch: true,
                text: (rect as any).text,
                color: (rect as any).color,
                textColor: (rect as any).textColor,
                fontSize: (rect as any).fontSize,
                fontFamily: (rect as any).fontFamily,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              }
            : { text: noteText || "New note", color: annotationToolDefaults.note.color, opacity: annotationToolDefaults.note.opacity, fontSize: annotationToolDefaults.note.size, x: rect.x, y: rect.y })
          : kind === "shape"
            ? { shape: "rectangle", stroke: annotationToolDefaults.shape.color, opacity: annotationToolDefaults.shape.opacity, strokeWidth: annotationToolDefaults.shape.size, ...rect }
            : kind === "redact"
              ? { shape: "rectangle", color: annotationToolDefaults.redact.color, opacity: annotationToolDefaults.redact.opacity, ...rect }
              : kind === "underline" || kind === "strike"
                ? { color: "#ef4444", opacity: 1, ...rect }
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
