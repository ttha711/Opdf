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
    const { x, y, width: w, height: h, text, signer, color, stroke, opacity, fontSize, strokeWidth } = payload as any;

    const absX = Math.round((x ?? 0) * width);
    const absY = Math.round((y ?? 0) * height);
    const absW = Math.round((w ?? 0.1) * width);
    const absH = Math.round((h ?? 0.05) * height);
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
    } else if (ann.kind === "underline" || ann.kind === "strike") {
      const lineY = ann.kind === "underline" ? absY + absH - 2 : absY + absH / 2;
      obj = new fabric.Line([absX, lineY, absX + absW, lineY], {
        stroke: color || "#ef4444",
        strokeWidth: Math.max(2, Math.min(4, absH * 0.12)),
        opacity: annOpacity,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
      });
    } else if (ann.kind === "note") {
      const textColorVal = payload.textColor as string | undefined;
      const fontFamilyVal = payload.fontFamily as string | undefined;
      const fontWeightVal = payload.fontWeight as string | undefined;
      const fontStyleVal = payload.fontStyle as string | undefined;
      const textAlignVal = payload.isPatch ? "left" : ((payload.textAlign as string | undefined) || "left");
      const resolvedFontStyle = fontStyleVal === "italic" || fontStyleVal === "oblique" ? fontStyleVal : "normal";
      
      const textOptions = {
        left: absX, top: absY,
        originX: "left" as const, originY: "top" as const,
        fontSize: fontSize || 16, fill: textColorVal || "black", backgroundColor: color || "#fff8d6",
        fontFamily: fontFamilyVal || "Helvetica, Arial, sans-serif",
        fontWeight: fontWeightVal || "normal",
        fontStyle: resolvedFontStyle as any,
        opacity: annOpacity,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        lockUniScaling: true,
        scaleX: 1,
        scaleY: 1,
      };

      if (payload.isPatch) {
        // Patch text is rendered as an HTML overlay (PdfTextSelection)
        // so CSS font metrics match the textarea preview exactly.
      } else {
        obj = new fabric.IText(text || "Note", textOptions);
        (obj as any)[ANN_ID_KEY] = ann.id;
        (obj as any)[ANN_KIND_KEY] = ann.kind;
        canvas.add(obj);
        if (obj.width > 0) {
          obj.scaleToWidth(absW);
        }
        obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
        obj = null;
      }
    } else if (ann.kind === "shape") {
      obj = new fabric.Rect({
        left: absX, top: absY, width: absW, height: absH,
        originX: "left", originY: "top",
        fill: "transparent",
        stroke: stroke || color || "#ef4444",
        strokeWidth: strokeWidth || 2,
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
        strokeWidth: strokeWidth || 0,
        selectable,
        evented: selectable,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
      });
    } else if (ann.kind === "image" && payload.image) {
      fabric.Image.fromURL(payload.image as string, { crossOrigin: "anonymous" }).then((img) => {
        img.set({
          left: absX, top: absY,
          originX: "left", originY: "top",
          opacity: annOpacity,
          selectable,
          evented: selectable,
          hasControls: true,
          hasBorders: true,
          lockRotation: true,
        });
        if (absW > 0) img.scaleToWidth(absW);
        if (absH > 0) img.scaleToHeight(absH);
        (img as any)[ANN_ID_KEY] = ann.id;
        (img as any)[ANN_KIND_KEY] = ann.kind;
        canvas.add(img);
        canvas.renderAll();
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
