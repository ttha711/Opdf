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
  selectFabricObject: (obj: fabric.Object) => void;
}

export function useFabricAnnotationToolbar({
  fabricRef,
  onAnnotationUpdated,
  onAnnotationDeleted,
  setSelectedAnn,
  selectFabricObject,
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
      obj.setCoords();
      canvas.renderAll();
      onAnnotationUpdated?.(id, (kind === "shape" || kind === "note") ? { [kind === "shape" ? "stroke" : "color"]: newColor } : { color: newColor });
      selectFabricObject(obj);
    },
    [fabricRef, onAnnotationUpdated, selectFabricObject]
  );

  const handleToolbarOpacity = useCallback(
    (id: string, newOpacity: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (!obj) return;
      obj.set({ opacity: newOpacity });
      obj.setCoords();
      canvas.renderAll();
      onAnnotationUpdated?.(id, { opacity: newOpacity });
      selectFabricObject(obj);
    },
    [fabricRef, onAnnotationUpdated, selectFabricObject]
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
        obj.setCoords();
        canvas.renderAll();
        onAnnotationUpdated?.(id, { fontSize: newSize });
        selectFabricObject(obj);
      }
    },
    [fabricRef, onAnnotationUpdated, selectFabricObject]
  );

  const handleToolbarSize = useCallback(
    (id: string, newSize: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (!obj) return;
      const kind = (obj as any)[ANN_KIND_KEY] as string;
      if (kind === "shape" || kind === "redact") {
        (obj as fabric.Rect).set({ strokeWidth: newSize });
        obj.setCoords();
        canvas.renderAll();
        onAnnotationUpdated?.(id, { strokeWidth: newSize });
        selectFabricObject(obj);
      }
    },
    [fabricRef, onAnnotationUpdated, selectFabricObject]
  );

  const handleToolbarDelete = useCallback(
    (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o) => (o as any)[ANN_ID_KEY] === id);
      if (obj) {
        canvas.discardActiveObject();
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
    handleToolbarSize,
    handleToolbarDelete,
  };
}
