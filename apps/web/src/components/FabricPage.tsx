import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import { AnnotationToolbar } from "./AnnotationToolbar";
import {
  ANN_ID_KEY,
  ANN_KIND_KEY,
  filterPageAnnotations,
  syncAnnotationsToCanvas,
  useFabricAnnotationToolbar,
  useFabricDrawing,
  useFabricSelection,
} from "./index";
import type { FabricPageProps, SelectedAnnotationState } from "./index";

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
  annotationToolDefaults,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationDeleted,
}: FabricPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

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

      const rawFill = kind === "note"
        ? (obj as fabric.IText).backgroundColor ?? ""
        : kind === "shape"
          ? ((obj as fabric.Rect).stroke as string) ?? ""
          : (obj.fill as string) ?? "";
      const rawOpacity = obj.opacity ?? 1;
      const rawFontSize = kind === "note" ? (obj as fabric.IText).fontSize : undefined;
      const rawSize = kind === "shape" || kind === "redact" ? (obj as fabric.Rect).strokeWidth : undefined;
      const { anchorX, anchorY } = computeAnchor(obj);

      setSelectedAnn({ id, kind, color: rawFill, opacity: rawOpacity, fontSize: rawFontSize, size: rawSize, anchorX, anchorY });
    },
    [computeAnchor]
  );

  // ─── Sync annotations onto the Fabric canvas ──────────────────────────
  const pageAnnotations = useMemo(() => {
    return filterPageAnnotations(annotations, pageNumber);
  }, [annotations, pageNumber]);

  const annotationsSig = useMemo(() => {
    return JSON.stringify(pageAnnotations);
  }, [pageAnnotations]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    syncAnnotationsToCanvas({ canvas, pageAnnotations, width, height, isAnyDrawMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationsSig, pageNumber, width, height, isAnyDrawMode]);

  useFabricSelection({
    fabricRef,
    isAnyDrawMode,
    onAnnotationUpdated,
    onAnnotationDeleted,
    setSelectedAnn,
    selectFabricObject,
    computeAnchor,
  });

  useFabricDrawing({
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
  });

  const {
    handleToolbarColor,
    handleToolbarOpacity,
    handleToolbarFontSize,
    handleToolbarSize,
    handleToolbarDelete,
  } = useFabricAnnotationToolbar({
    fabricRef,
    onAnnotationUpdated,
    onAnnotationDeleted,
    setSelectedAnn,
  });

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
          size={selectedAnn.size}
          onSizeChange={handleToolbarSize}
        />
      )}
    </div>
  );
}
