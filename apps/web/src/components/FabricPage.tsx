import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import type { Annotation } from "@opdf/core";
import { AnnotationToolbar } from "./AnnotationToolbar";

interface FabricPageProps {
  pageNumber: number;
  width: number;
  height: number;
  imageUrl: string;
  annotations: Annotation[];
  highlightMode: boolean;
  shapeMode: boolean;
  redactMode: boolean;
  measureMode: boolean;
  onAnnotationCreated?: (page: number, kind: string, payload: Record<string, unknown>) => void;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
}

interface SelectedAnnotationState {
  id: string;
  kind: string;
  color: string;
  opacity: number;
  fontSize?: number;
  /** Screen coordinates for toolbar anchor */
  anchorX: number;
  anchorY: number;
}

/** Fabric custom property key we store the annotation id on each object */
const ANN_ID_KEY = "__annId";
const ANN_KIND_KEY = "__annKind";

export function FabricPage({
  pageNumber,
  width,
  height,
  imageUrl,
  annotations,
  highlightMode,
  shapeMode,
  redactMode,
  measureMode,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationDeleted,
}: FabricPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  // In-progress draw state
  const activeRectRef = useRef<fabric.Rect | null>(null);
  const measureLineRef = useRef<fabric.Line | null>(null);
  const measureTextRef = useRef<fabric.Text | null>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef({ x: 0, y: 0 });
  const draftBoundsRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

  const [selectedAnn, setSelectedAnn] = useState<SelectedAnnotationState | null>(null);
  const [measureResult, setMeasureResult] = useState<string | null>(null);

  const isAnyDrawMode = highlightMode || shapeMode || redactMode || measureMode;

  // ─── Init Fabric Canvas ────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      selection: false,
      // Prevent the default browser selection behavior
      preserveObjectStacking: true,
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

  // ─── Sync draw-mode cursor / selection capability ──────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // In draw modes nothing is selectable — in select mode everything is
    const selectableObjects = canvas.getObjects().filter((o) => (o as any)[ANN_ID_KEY]);
    selectableObjects.forEach((o) => {
      o.selectable = !isAnyDrawMode;
      o.evented = !isAnyDrawMode;
    });
    if (isAnyDrawMode) {
      canvas.discardActiveObject();
      setSelectedAnn(null);
    }
    canvas.renderAll();
  }, [isAnyDrawMode]);

  // ─── Compute toolbar screen position from a fabric object ──────────────
  const computeAnchor = useCallback(
    (obj: fabric.Object): { anchorX: number; anchorY: number } => {
      const canvas = fabricRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return { anchorX: 0, anchorY: 0 };

      const bounds = container.getBoundingClientRect();
      const objBounds = obj.getBoundingRect();

      return {
        anchorX: bounds.left + objBounds.left + objBounds.width / 2,
        anchorY: bounds.top + objBounds.top,
      };
    },
    []
  );

  // ─── Build & apply selected-annotation state from a Fabric object ──────
  const selectFabricObject = useCallback(
    (obj: fabric.Object) => {
      const id = (obj as any)[ANN_ID_KEY] as string | undefined;
      const kind = (obj as any)[ANN_KIND_KEY] as string | undefined;
      if (!id || !kind) return;

      const rawFill = kind === "note" ? (obj as fabric.IText).backgroundColor ?? "" : (obj.fill as string) ?? "";
      const rawOpacity = obj.opacity ?? 1;
      const rawFontSize = kind === "note" ? (obj as fabric.IText).fontSize : undefined;
      const { anchorX, anchorY } = computeAnchor(obj);

      setSelectedAnn({ id, kind, color: rawFill, opacity: rawOpacity, fontSize: rawFontSize, anchorX, anchorY });
    },
    [computeAnchor]
  );

  // ─── Sync annotations onto the Fabric canvas ──────────────────────────
  const pageAnnotations = useMemo(() => {
    return annotations.filter((a) => a.page === pageNumber);
  }, [annotations, pageNumber]);

  const annotationsSig = useMemo(() => {
    return JSON.stringify(pageAnnotations);
  }, [pageAnnotations]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove all annotation objects (leave background)
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
          lockUniScaling: true, // Force proportional scaling
        });
        canvas.add(obj);
        if (obj.width > 0) {
          obj.scaleToWidth(absW);
        }
        obj.setControlsVisibility({
          mt: false, mb: false, ml: false, mr: false, // Hide non-corner handles
        });
        // We already added it, so don't add it again at the end of the loop
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationsSig, pageNumber, width, height, isAnyDrawMode]);

  // ─── Fabric selection & modification events ────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const onSelected = (e: any) => {
      const obj = e.selected?.[0] ?? canvas.getActiveObject();
      if (!obj) return;
      selectFabricObject(obj);
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

      // Keep stroke colour in sync for shapes
      if (kind === "shape") {
        payload.stroke = (obj as fabric.Rect).stroke;
      }

      onAnnotationUpdated?.(id, payload);

      // Refresh toolbar anchor position
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
  }, [selectFabricObject, computeAnchor, onAnnotationUpdated]);

  // ─── Keyboard delete for selected annotation ───────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      const id = (active as any)[ANN_ID_KEY] as string | undefined;
      if (!id) return;

      e.preventDefault();
      canvas.remove(active);
      canvas.renderAll();
      setSelectedAnn(null);
      onAnnotationDeleted?.(id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onAnnotationDeleted]);

  // ─── Drag-draw for highlight / rectangle / redact ──────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const drawingHighlight = highlightMode;
    const drawingShape = shapeMode;
    const drawingRedact = redactMode;
    const drawingMeasure = measureMode;
    const isAnyDraw = drawingHighlight || drawingShape || drawingRedact || drawingMeasure;

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
          text.set({ 
            text: `${value} px`, 
            left: endX + 10, 
            top: endY + 10 
          });
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
        if (measureLineRef.current) canvas!.remove(measureLineRef.current);
        if (measureTextRef.current) canvas!.remove(measureTextRef.current);
        measureLineRef.current = null;
        measureTextRef.current = null;
        canvas!.renderAll();
        // Keep measureResult visible for a moment or handle it via a UI overlay
        return;
      }

      const rect = activeRectRef.current;
      if (!rect) return;

      const bounds = draftBoundsRef.current;
      const canvasW = canvas!.getWidth();
      const canvasH = canvas!.getHeight();

      if (bounds.width > 5 && bounds.height > 5 && onAnnotationCreated) {
        let kind = "shape";
        if (drawingHighlight) kind = "highlight";
        else if (drawingRedact) kind = "redact";

        onAnnotationCreated(pageNumber, kind, {
          x: Math.min(Math.max(bounds.left / canvasW, 0), 1),
          y: Math.min(Math.max(bounds.top / canvasH, 0), 1),
          width: Math.min(Math.max(bounds.width / canvasW, 0), 1),
          height: Math.min(Math.max(bounds.height / canvasH, 0), 1),
        });
      }

      canvas!.remove(rect);
      canvas!.renderAll();
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
          stroke: "#10b981", // emerald 500
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
        canvas!.add(line, text);
        canvas!.renderAll();
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
      canvas!.add(preview);
      canvas!.renderAll();
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
        canvas?.remove(activeRectRef.current);
        canvas?.renderAll();
        activeRectRef.current = null;
        isDrawingRef.current = false;
      }
    };
  }, [highlightMode, shapeMode, redactMode, measureMode, onAnnotationCreated, pageNumber, width, height]);

  // ─── Toolbar handlers ──────────────────────────────────────────────────
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
    [onAnnotationUpdated]
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
    [onAnnotationUpdated]
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
    [onAnnotationUpdated]
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
    [onAnnotationDeleted]
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width, height }} className="fabric-page-container">
      <canvas ref={canvasRef} />

      {measureMode && measureResult && (
        <div 
          className="absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white shadow-md ring-2 ring-emerald-300 pointer-events-none flex items-center gap-2"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.3 4.7a1 1 0 0 0-1.4 0L4.7 19.9a1 1 0 0 0 1.4 1.4L21.3 6.1a1 1 0 0 0 0-1.4z"/>
            <path d="M15 6l2.5 2.5M12 9l2.5 2.5M9 12l2.5 2.5M6 15l2.5 2.5"/>
          </svg>
          Distance: {measureResult}
        </div>
      )}

      {selectedAnn && !isAnyDrawMode && (
        <AnnotationToolbar
          annotationId={selectedAnn.id}
          color={selectedAnn.color}
          opacity={selectedAnn.opacity}
          anchorX={selectedAnn.anchorX}
          anchorY={selectedAnn.anchorY}
          onColorChange={handleToolbarColor}
          onOpacityChange={handleToolbarOpacity}
          onDelete={handleToolbarDelete}
          onClose={() => setSelectedAnn(null)}
          kind={selectedAnn.kind}
          fontSize={selectedAnn.fontSize}
          onFontSizeChange={handleToolbarFontSize}
        />
      )}
    </div>
  );
}
