import { useCallback } from "react";
import * as fabric from "fabric";
import type { MutableRefObject } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ANN_ID_KEY, ANN_KIND_KEY } from "./FabricPage.constants";
import type { SelectedAnnotationState } from "./FabricPage.types";

interface UseFabricAnnotationToolbarParams {
  fabricRef: MutableRefObject<fabric.Canvas | null>;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
  setSelectedAnn: Dispatch<SetStateAction<SelectedAnnotationState | null>>;
}

export function useFabricAnnotationToolbar({
  fabricRef,
  onAnnotationUpdated,
  onAnnotationDeleted,
  setSelectedAnn,
}: UseFabricAnnotationToolbarParams) {
  const handleToolbarColor = useCallback(
    (id: string, newColor: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (!obj) return;
      const kind = (obj as any)[ANN_KIND_KEY] as string;
      if (kind === "shape") {
        (obj as fabric.Rect).set({ stroke: newColor });
      } else if (kind === "note") {
        (obj as fabric.IText).set({ backgroundColor: newColor });
      } else {
        obj.set({ fill: newColor });
      }
      canvas.renderAll();
      setSelectedAnn((prev) => (prev?.id === id ? { ...prev, color: newColor } : prev));
      onAnnotationUpdated?.(id, (kind === "shape" || kind === "note") ? { [kind === "shape" ? "stroke" : "color"]: newColor } : { color: newColor });
    },
    [fabricRef, onAnnotationUpdated, setSelectedAnn]
  );

  const handleToolbarOpacity = useCallback(
    (id: string, newOpacity: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (!obj) return;
      obj.set({ opacity: newOpacity });
      canvas.renderAll();
      setSelectedAnn((prev) => (prev?.id === id ? { ...prev, opacity: newOpacity } : prev));
      onAnnotationUpdated?.(id, { opacity: newOpacity });
    },
    [fabricRef, onAnnotationUpdated, setSelectedAnn]
  );

  const handleToolbarFontSize = useCallback(
    (id: string, newSize: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (!obj) return;
      const kind = (obj as any)[ANN_KIND_KEY] as string;
      if (kind === "note") {
        (obj as fabric.IText).set({ fontSize: newSize });
        canvas.renderAll();
        setSelectedAnn((prev) => (prev?.id === id ? { ...prev, fontSize: newSize } : prev));
        onAnnotationUpdated?.(id, { fontSize: newSize });
      }
    },
    [fabricRef, onAnnotationUpdated, setSelectedAnn]
  );

  const handleToolbarDelete = useCallback(
    (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (obj) {
        canvas.remove(obj);
        canvas.renderAll();
      }
      setSelectedAnn(null);
      onAnnotationDeleted?.(id);
    },
    [fabricRef, onAnnotationDeleted, setSelectedAnn]
  );

  return {
    handleToolbarColor,
    handleToolbarOpacity,
    handleToolbarFontSize,
    handleToolbarDelete,
  };
}
