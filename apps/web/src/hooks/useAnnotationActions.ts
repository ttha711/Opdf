import type { Annotation } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import { useOpdfBridge } from "./useOpdfBridge";
import { getViewerControls } from "../lib/viewer-runtime";

export function useAnnotationActions({
  bridge,
  fileName,
  sourceIdentity,
  setAnnotations,
  setViewerError,
  setSaveState,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  sourceIdentity: string;
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
}) {
  const documentKey = sourceIdentity.startsWith("server://") ? sourceIdentity : fileName;

  async function undoAnnotations() {
    const viewer = getViewerControls();
    if (viewer?.undo && viewer.canUndo?.()) {
      viewer.undo();
      setSaveState("idle");
      return;
    }
    if (!documentKey) return;
    setAnnotations(await bridge.undoAnnotation(documentKey));
    setSaveState("idle");
  }

  async function redoAnnotations() {
    const viewer = getViewerControls();
    if (viewer?.redo && viewer.canRedo?.()) {
      viewer.redo();
      setSaveState("idle");
      return;
    }
    if (!documentKey) return;
    setAnnotations(await bridge.redoAnnotation(documentKey));
    setSaveState("idle");
  }

  async function removeAnnotation(id: string) {
    if (!documentKey) return;
    await bridge.deleteAnnotation(documentKey, id);
    setAnnotations(await bridge.listAnnotations(documentKey));
    setSaveState("idle");
  }

  async function updateAnnotation(id: string, payload: Record<string, unknown>) {
    if (!documentKey) return;
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, payload: { ...(a.payload as object), ...payload }, updatedAt: Date.now() }
          : a
      )
    );
    try {
      await bridge.updateAnnotation(documentKey, id, payload);
      setSaveState("idle");
    } catch {
      setViewerError("Failed to update annotation");
    }
  }

  return { undoAnnotations, redoAnnotations, removeAnnotation, updateAnnotation };
}
