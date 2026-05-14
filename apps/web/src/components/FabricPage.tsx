import { useEffect, useRef } from "react";
import * as fabric from "fabric";
import type { Annotation } from "@opdf/core";

interface FabricPageProps {
  pageNumber: number;
  width: number;
  height: number;
  imageUrl: string;
  annotations: any[];
  highlightMode: boolean;
  shapeMode: boolean;
  redactMode: boolean;
  onAnnotationCreated?: (page: number, kind: string, payload: any) => void;
}

export function FabricPage({
  pageNumber,
  width,
  height,
  imageUrl,
  annotations,
  highlightMode,
  shapeMode,
  redactMode,
  onAnnotationCreated,
}: FabricPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  // Holds the in-progress temporary rect so the document-level mouseup
  // fallback (and effect cleanup) can always access and finalize/remove it.
  const activeRectRef = useRef<fabric.Rect | null>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef({ x: 0, y: 0 });
  const draftBoundsRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      selection: !highlightMode && !shapeMode && !redactMode,
    });
    fabricRef.current = canvas;

    // Load background image
    fabric.Image.fromURL(imageUrl, { crossOrigin: "anonymous" }).then((img) => {
      img.set({ originX: "left", originY: "top", selectable: false, evented: false });
      img.scaleToWidth(width);
      img.scaleToHeight(height);
      canvas.backgroundImage = img;
      canvas.renderAll();
    });

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [width, height, imageUrl]);

  // Sync mode
  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.selection = !highlightMode && !shapeMode && !redactMode;
  }, [highlightMode, shapeMode, redactMode]);

  // Sync annotations (basic implementation)
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    
    // Clear existing overlay objects
    const objects = canvas.getObjects();
    objects.forEach((obj) => canvas.remove(obj));

    // Render annotations
    annotations.forEach((ann) => {
      if (ann.page !== pageNumber || !ann.payload) return;
      const { x, y, width: w, height: h, text, signer, color, stroke } = ann.payload as any;
      const absX = (x || 0) * width;
      const absY = (y || 0) * height;
      const absW = (w || 0.1) * width;
      const absH = (h || 0.05) * height;

      if (ann.kind === "highlight") {
        const rect = new fabric.Rect({
          left: absX, top: absY, width: absW, height: absH,
          originX: "left", originY: "top",
          fill: color || "rgba(250, 204, 21, 0.4)",
          selectable: false
        });
        canvas.add(rect);
      } else if (ann.kind === "note") {
        const t = new fabric.IText(text || "Note", {
          left: absX, top: absY, originX: "left", originY: "top",
          fontSize: 16, fill: "black", backgroundColor: "yellow"
        });
        canvas.add(t);
      } else if (ann.kind === "shape") {
        const rect = new fabric.Rect({
          left: absX, top: absY, width: absW, height: absH,
          originX: "left", originY: "top",
          fill: "transparent", stroke: stroke || "red", strokeWidth: 2
        });
        canvas.add(rect);
      } else if (ann.kind === "signature") {
        const sig = new fabric.Text(signer || "Signature", {
          left: absX, top: absY, originX: "left", originY: "top",
          fontSize: 24, fill: "blue", fontFamily: "cursive"
        });
        canvas.add(sig);
      } else if (ann.kind === "redact") {
        const rect = new fabric.Rect({
          left: absX, top: absY, width: absW, height: absH,
          originX: "left", originY: "top",
          fill: "black", strokeWidth: 0, selectable: false
        });
        canvas.add(rect);
      }
    });
    canvas.renderAll();
  }, [annotations, pageNumber, width, height]);

  // Drag-draw for highlight / rectangle / redact tools.
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    // Capture the mode values at the time this effect runs.
    const drawingHighlight = highlightMode;
    const drawingShape = shapeMode;
    const drawingRedact = redactMode;
    const isAnyDrawMode = drawingHighlight || drawingShape || drawingRedact;

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const drawingSurface =
      ((canvas as any).upperCanvasEl as HTMLCanvasElement | undefined) ?? canvasRef.current;

    const getCanvasPoint = (event: MouseEvent | PointerEvent) => {
      const el = drawingSurface;
      if (!el) return null;

      const bounds = el.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;

      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      return {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * canvasWidth, 0, canvasWidth),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * canvasHeight, 0, canvasHeight),
      };
    };

    const updatePreview = (pointer: { x: number; y: number }) => {
      const rect = activeRectRef.current;
      if (!isDrawingRef.current || !rect) return;

      const { x: sx, y: sy } = drawStartRef.current;
      const nextBounds = {
        left: Math.min(pointer.x, sx),
        top: Math.min(pointer.y, sy),
        width: Math.abs(pointer.x - sx),
        height: Math.abs(pointer.y - sy),
      };
      draftBoundsRef.current = nextBounds;
      rect.set(nextBounds);
      rect.setCoords();
      canvas.renderAll();
    };

    function commitDraw() {
      const rect = activeRectRef.current;
      if (!isDrawingRef.current || !rect) return;
      isDrawingRef.current = false;

      const bounds = draftBoundsRef.current;
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const rWidth = bounds.width;
      const rHeight = bounds.height;
      const rLeft = bounds.left;
      const rTop = bounds.top;

      if (rWidth > 5 && rHeight > 5 && onAnnotationCreated) {
        let kind = "shape";
        if (drawingHighlight) kind = "highlight";
        else if (drawingRedact) kind = "redact";

        const x = Math.min(Math.max(rLeft / canvasWidth, 0), 1);
        const y = Math.min(Math.max(rTop / canvasHeight, 0), 1);
        const widthRatio = Math.min(Math.max(rWidth / canvasWidth, 0), 1);
        const heightRatio = Math.min(Math.max(rHeight / canvasHeight, 0), 1);

        onAnnotationCreated(pageNumber, kind, {
          x,
          y,
          width: widthRatio,
          height: heightRatio,
        });
      }

      // Remove the temporary preview rect — the annotation sync effect will
      // re-render it from the annotations state.
      canvas.remove(rect);
      canvas.renderAll();
      activeRectRef.current = null;
      draftBoundsRef.current = { left: 0, top: 0, width: 0, height: 0 };
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isAnyDrawMode) return;
      event.preventDefault();

      drawingSurface?.setPointerCapture?.(event.pointerId);
      const pointer = getCanvasPoint(event);
      if (!pointer) return;
      drawStartRef.current = { x: pointer.x, y: pointer.y };
      draftBoundsRef.current = { left: pointer.x, top: pointer.y, width: 0, height: 0 };
      isDrawingRef.current = true;

      const preview = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        originX: "left",
        originY: "top",
        width: 0,
        height: 0,
        fill: drawingHighlight
          ? "rgba(250, 204, 21, 0.4)"
          : drawingRedact
          ? "rgba(0, 0, 0, 0.6)"
          : "transparent",
        stroke: drawingShape ? "#ef4444" : drawingRedact ? "#000000" : undefined,
        strokeWidth: drawingShape || drawingRedact ? 2 : 0,
        strokeDashArray: drawingShape || drawingRedact ? [5, 5] : undefined,
        selectable: false,
        evented: false,
      });
      activeRectRef.current = preview;
      canvas.add(preview);
      canvas.renderAll();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();
      const pointer = getCanvasPoint(event);
      if (!pointer) return;
      updatePreview(pointer);
    };

    const onDocumentPointerMove = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pointer = getCanvasPoint(event);
      if (!pointer) return;
      updatePreview(pointer);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pointer = getCanvasPoint(event);
      if (pointer) updatePreview(pointer);
      drawingSurface?.releasePointerCapture?.(event.pointerId);
      commitDraw();
    };

    const onDocumentPointerUp = () => {
      if (isDrawingRef.current) commitDraw();
    };

    drawingSurface?.addEventListener("pointerdown", onPointerDown);
    drawingSurface?.addEventListener("pointermove", onPointerMove);
    drawingSurface?.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);

    return () => {
      drawingSurface?.removeEventListener("pointerdown", onPointerDown);
      drawingSurface?.removeEventListener("pointermove", onPointerMove);
      drawingSurface?.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointermove", onDocumentPointerMove);
      document.removeEventListener("pointerup", onDocumentPointerUp);

      // If the effect tears down mid-drag (e.g. mode switch), discard the
      // dangling preview rect without saving.
      if (isDrawingRef.current && activeRectRef.current) {
        canvas.remove(activeRectRef.current);
        canvas.renderAll();
        activeRectRef.current = null;
        isDrawingRef.current = false;
      }
    };
  }, [highlightMode, shapeMode, redactMode, onAnnotationCreated, pageNumber, width, height]);

  return (
    <div style={{ position: 'relative', width, height }} className="fabric-page-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
