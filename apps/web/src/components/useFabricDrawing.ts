import { useEffect } from "react";
import * as fabric from "fabric";
import type { MutableRefObject } from "react";
import type { AnnotationToolDefaults } from "../lib/app-types";

interface UseFabricDrawingParams {
  fabricRef: MutableRefObject<fabric.Canvas | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  highlightMode: boolean;
  shapeMode: boolean;
  redactMode: boolean;
  measureMode: boolean;
  annotationToolDefaults: AnnotationToolDefaults;
  pageNumber: number;
  onAnnotationCreated?: (page: number, kind: string, payload: Record<string, unknown>) => void;
  setMeasureResult: (value: string | null) => void;
}

export function useFabricDrawing({
  fabricRef,
  canvasRef,
  highlightMode,
  shapeMode,
  redactMode,
  measureMode,
  annotationToolDefaults,
  pageNumber,
  onAnnotationCreated,
  setMeasureResult,
}: UseFabricDrawingParams) {
  useEffect(() => {
    const canvasMaybe = fabricRef.current;
    if (!canvasMaybe) return;
    const canvas = canvasMaybe;

    const activeRectRef = { current: null as fabric.Rect | null };
    const measureLineRef = { current: null as fabric.Line | null };
    const measureTextRef = { current: null as fabric.Text | null };
    const isDrawingRef = { current: false };
    const drawStartRef = { current: { x: 0, y: 0 } };
    const draftBoundsRef = { current: { left: 0, top: 0, width: 0, height: 0 } };

    const drawingHighlight = highlightMode;
    const drawingShape = shapeMode;
    const drawingRedact = redactMode;
    const drawingMeasure = measureMode;
    const isAnyDraw = drawingHighlight || drawingShape || drawingRedact || drawingMeasure;
    const activeDefaults = drawingHighlight
      ? annotationToolDefaults.highlight
      : drawingShape
        ? annotationToolDefaults.shape
        : drawingRedact
          ? annotationToolDefaults.redact
          : null;

    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    const drawingSurface =
      ((canvas as any).upperCanvasEl as HTMLCanvasElement | undefined) ?? canvasRef.current;

    const getCanvasPoint = (event: PointerEvent) => {
      const el = drawingSurface;
      if (!el) return null;
      const bounds = el.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;
      const canvasW = canvas.getWidth();
      const canvasH = canvas.getHeight();
      return {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * canvasW, 0, canvasW),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * canvasH, 0, canvasH),
      };
    };

    const updatePreview = (pointer: { x: number; y: number }, shiftKey = false) => {
      const { x: sx, y: sy } = drawStartRef.current;
      if (!isDrawingRef.current) return;

      let endX = pointer.x;
      let endY = pointer.y;
      if (drawingMeasure && shiftKey) {
        const dx = endX - sx;
        const dy = endY - sy;
        const angle = Math.atan2(dy, dx);
        const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const distance = Math.sqrt(dx * dx + dy * dy);
        endX = sx + distance * Math.cos(snappedAngle);
        endY = sy + distance * Math.sin(snappedAngle);
      }

      if (drawingMeasure) {
        const line = measureLineRef.current;
        const text = measureTextRef.current;
        if (line && text) {
          line.set({ x2: endX, y2: endY });
          const dx = endX - sx;
          const dy = endY - sy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const value = distance.toFixed(2);
          text.set({ text: `${value} px`, left: endX + 10, top: endY + 10 });
          setMeasureResult(`${value} px`);
          canvas.renderAll();
        }
        return;
      }

      const rect = activeRectRef.current;
      if (!rect) return;
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
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (drawingMeasure) {
        if (measureLineRef.current) canvas.remove(measureLineRef.current);
        if (measureTextRef.current) canvas.remove(measureTextRef.current);
        measureLineRef.current = null;
        measureTextRef.current = null;
        canvas.renderAll();
        return;
      }

      const rect = activeRectRef.current;
      if (!rect) return;

      const bounds = draftBoundsRef.current;
      const canvasW = canvas.getWidth();
      const canvasH = canvas.getHeight();

      if (bounds.width > 5 && bounds.height > 5 && onAnnotationCreated) {
        let kind = "shape";
        if (drawingHighlight) kind = "highlight";
        else if (drawingRedact) kind = "redact";

        onAnnotationCreated(pageNumber, kind, {
          x: Math.min(Math.max(bounds.left / canvasW, 0), 1),
          y: Math.min(Math.max(bounds.top / canvasH, 0), 1),
          width: Math.min(Math.max(bounds.width / canvasW, 0), 1),
          height: Math.min(Math.max(bounds.height / canvasH, 0), 1),
          ...(activeDefaults
            ? {
                color: activeDefaults.color,
                stroke: activeDefaults.color,
                opacity: activeDefaults.opacity,
                strokeWidth: activeDefaults.size,
              }
            : {}),
        });
      }

      canvas.remove(rect);
      canvas.renderAll();
      activeRectRef.current = null;
      draftBoundsRef.current = { left: 0, top: 0, width: 0, height: 0 };
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isAnyDraw) return;
      event.preventDefault();
      drawingSurface?.setPointerCapture?.(event.pointerId);
      const pointer = getCanvasPoint(event);
      if (!pointer) return;
      drawStartRef.current = { x: pointer.x, y: pointer.y };
      draftBoundsRef.current = { left: pointer.x, top: pointer.y, width: 0, height: 0 };
      isDrawingRef.current = true;

      if (drawingMeasure) {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: "#10b981",
          strokeWidth: 2,
          selectable: false,
          evented: false,
        });
        const text = new fabric.Text("0.00 px", {
          left: pointer.x + 10,
          top: pointer.y + 10,
          fontSize: 14,
          fill: "#ffffff",
          backgroundColor: "rgba(16, 185, 129, 0.9)",
          fontFamily: "monospace",
          selectable: false,
          evented: false,
        });
        measureLineRef.current = line;
        measureTextRef.current = text;
        canvas.add(line, text);
        canvas.renderAll();
        return;
      }

      const preview = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        originX: "left",
        originY: "top",
        width: 0,
        height: 0,
        fill: drawingHighlight
          ? activeDefaults?.color ?? "rgba(250, 204, 21, 0.4)"
          : drawingRedact
          ? activeDefaults?.color ?? "rgba(0, 0, 0, 0.6)"
          : "transparent",
        opacity: activeDefaults?.opacity ?? 1,
        stroke: drawingShape ? activeDefaults?.color ?? "#ef4444" : drawingRedact ? activeDefaults?.color ?? "#000000" : undefined,
        strokeWidth: drawingShape || drawingRedact ? activeDefaults?.size ?? 2 : 0,
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
      if (pointer) updatePreview(pointer, event.shiftKey);
    };

    const onDocumentPointerMove = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pointer = getCanvasPoint(event);
      if (pointer) updatePreview(pointer, event.shiftKey);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pointer = getCanvasPoint(event);
      if (pointer) updatePreview(pointer, event.shiftKey);
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

      if (isDrawingRef.current && activeRectRef.current) {
        canvas.remove(activeRectRef.current);
        canvas.renderAll();
        activeRectRef.current = null;
        isDrawingRef.current = false;
      }
    };
  }, [highlightMode, shapeMode, redactMode, measureMode, annotationToolDefaults, onAnnotationCreated, pageNumber, setMeasureResult, fabricRef, canvasRef]);
}
