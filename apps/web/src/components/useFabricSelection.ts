import { useEffect } from "react";
import * as fabric from "fabric";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { ANN_ID_KEY, ANN_KIND_KEY } from "./FabricPage.constants";
import type { SelectedAnnotationState } from "./FabricPage.types";

interface UseFabricSelectionParams {
  fabricRef: MutableRefObject<fabric.Canvas | null>;
  isAnyDrawMode: boolean;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
  setSelectedAnn: Dispatch<SetStateAction<SelectedAnnotationState | null>>;
  selectFabricObject: (obj: fabric.Object) => void;
  computeAnchor: (obj: fabric.Object) => { anchorX: number; anchorY: number };
}

export function useFabricSelection({
  fabricRef,
  isAnyDrawMode,
  onAnnotationUpdated,
  onAnnotationDeleted,
  setSelectedAnn,
  selectFabricObject,
  computeAnchor,
}: UseFabricSelectionParams) {
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Make the fabric wrapper focusable so arrow keys are captured locally
    // instead of scrolling the PDF viewer container.
    if (canvas.wrapperEl) {
      canvas.wrapperEl.tabIndex = 0;
      canvas.wrapperEl.style.outline = "none";
    }

    const onSelected = (e: any) => {
      const obj = e.selected?.[0] ?? canvas.getActiveObject();
      if (!obj) return;
      selectFabricObject(obj);
      canvas.wrapperEl?.focus();
    };

    const onDeselected = () => {
      setSelectedAnn(null);
    };

    const onModified = (e: any) => {
      const obj = e.target as fabric.Object | undefined;
      if (!obj) return;
      const id = (obj as any)[ANN_ID_KEY] as string | undefined;
      const kind = (obj as any)[ANN_KIND_KEY] as string | undefined;
      if (!id) return;

      const canvasW = canvas.getWidth();
      const canvasH = canvas.getHeight();
      const br = obj.getBoundingRect();

      const payload: Record<string, unknown> = {
        x: br.left / canvasW,
        y: br.top / canvasH,
        width: br.width / canvasW,
        height: br.height / canvasH,
      };

      if (kind === "shape") {
        payload.stroke = (obj as fabric.Rect).stroke;
        payload.strokeWidth = (obj as fabric.Rect).strokeWidth;
      }

      onAnnotationUpdated?.(id, payload);

      const { anchorX, anchorY } = computeAnchor(obj);
      setSelectedAnn((prev) => (prev?.id === id ? { ...prev, anchorX, anchorY } : prev));
    };

    canvas.on("selection:created", onSelected);
    canvas.on("selection:updated", onSelected);
    canvas.on("selection:cleared", onDeselected);
    canvas.on("object:modified", onModified);

    return () => {
      canvas.off("selection:created", onSelected);
      canvas.off("selection:updated", onSelected);
      canvas.off("selection:cleared", onDeselected);
      canvas.off("object:modified", onModified);
    };
  }, [selectFabricObject, computeAnchor, onAnnotationUpdated, fabricRef, setSelectedAnn]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      const id = (active as any)[ANN_ID_KEY] as string | undefined;
      if (!id) return;

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        canvas.remove(active);
        canvas.renderAll();
        setSelectedAnn(null);
        onAnnotationDeleted?.(id);
        return;
      }

      // Arrow-key nudging
      if (e.key.startsWith("Arrow")) {
        if (isAnyDrawMode) return;

        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        if (dx === 0 && dy === 0) return;

        e.preventDefault();
        active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
        active.setCoords();
        canvas.renderAll();

        // Persist new position
        const canvasW = canvas.getWidth();
        const canvasH = canvas.getHeight();
        const br = active.getBoundingRect();
        const kind = (active as any)[ANN_KIND_KEY] as string | undefined;
        const payload: Record<string, unknown> = {
          x: br.left / canvasW,
          y: br.top / canvasH,
          width: br.width / canvasW,
          height: br.height / canvasH,
        };
        if (kind === "shape") {
          payload.stroke = (active as fabric.Rect).stroke;
          payload.strokeWidth = (active as fabric.Rect).strokeWidth;
        }
        onAnnotationUpdated?.(id, payload);

        const { anchorX, anchorY } = computeAnchor(active);
        setSelectedAnn((prev) => (prev?.id === id ? { ...prev, anchorX, anchorY } : prev));
      }
    };

    const wrapperEl = fabricRef.current?.wrapperEl as HTMLElement | undefined;
    wrapperEl?.addEventListener("keydown", onKeyDown);
    return () => wrapperEl?.removeEventListener("keydown", onKeyDown);
  }, [isAnyDrawMode, onAnnotationUpdated, onAnnotationDeleted, computeAnchor, fabricRef, setSelectedAnn]);

  useEffect(() => {
    if (!isAnyDrawMode) return;
    setSelectedAnn(null);
  }, [isAnyDrawMode, setSelectedAnn]);
}
