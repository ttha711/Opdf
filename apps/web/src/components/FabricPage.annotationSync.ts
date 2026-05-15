import * as fabric from "fabric";
import type { Annotation } from "@opdf/core";
import { ANN_ID_KEY, ANN_KIND_KEY } from "./FabricPage.constants";

export function filterPageAnnotations(annotations: Annotation[], pageNumber: number) {
  return annotations.filter((a) => a.page === pageNumber);
}

export function syncAnnotationsToCanvas(params: {
  canvas: fabric.Canvas;
  pageAnnotations: Annotation[];
  width: number;
  height: number;
  isAnyDrawMode: boolean;
}) {
  const { canvas, pageAnnotations, width, height, isAnyDrawMode } = params;

  canvas.getObjects().forEach((o) => canvas.remove(o));

  pageAnnotations.forEach((ann) => {
    if (!ann.payload) return;
    const payload = ann.payload as Record<string, unknown>;
    const { x, y, width: w, height: h, text, signer, color, stroke, opacity, fontSize } = payload as any;

    const absX = (x ?? 0) * width;
    const absY = (y ?? 0) * height;
    const absW = (w ?? 0.1) * width;
    const absH = (h ?? 0.05) * height;
    const selectable = !isAnyDrawMode;
    const defaultOpacity = ann.kind === "highlight" ? 0.4 : 1;
    const annOpacity = typeof opacity === "number" ? opacity : defaultOpacity;

    let obj: fabric.Object | null = null;

    if (ann.kind === "highlight") {
      obj = new fabric.Rect({
        left: absX, top: absY, width: absW, height: absH,
        originX: "left", originY: "top",
        fill: color || "rgba(250, 204, 21, 0.4)",
        opacity: annOpacity,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
      });
    } else if (ann.kind === "note") {
      obj = new fabric.IText(text || "Note", {
        left: absX, top: absY,
        originX: "left", originY: "top",
        fontSize: fontSize || 16, fill: "black", backgroundColor: color || "#fff8d6",
        fontFamily: "Helvetica, Arial, sans-serif",
        opacity: annOpacity,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        lockUniScaling: true,
      });
      canvas.add(obj);
      if (obj.width > 0) {
        obj.scaleToWidth(absW);
      }
      obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
      obj = null;
    } else if (ann.kind === "shape") {
      obj = new fabric.Rect({
        left: absX, top: absY, width: absW, height: absH,
        originX: "left", originY: "top",
        fill: "transparent",
        stroke: stroke || color || "#ef4444",
        strokeWidth: 2,
        opacity: annOpacity,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
      });
    } else if (ann.kind === "signature") {
      obj = new fabric.Text(signer || "Signature", {
        left: absX, top: absY,
        originX: "left", originY: "top",
        fontSize: 24, fill: "blue", fontFamily: "cursive",
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
      });
    } else if (ann.kind === "redact") {
      obj = new fabric.Rect({
        left: absX, top: absY, width: absW, height: absH,
        originX: "left", originY: "top",
        fill: color || "black",
        opacity: annOpacity,
        strokeWidth: 0,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
      });
    }

    if (obj) {
      (obj as any)[ANN_ID_KEY] = ann.id;
      (obj as any)[ANN_KIND_KEY] = ann.kind;
      canvas.add(obj);
    }
  });

  canvas.renderAll();
}
