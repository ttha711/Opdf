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
import {
  calibrateMmPerPdfPoint,
  presetMmPerPdfPoint,
  toMillimeters,
  type MeasurementUnit,
} from "../lib/measurement";

export function FabricPage({
  pageNumber,
  width,
  height,
  imageUrl,
  pageScale,
  annotations,
  highlightMode,
  shapeMode,
  redactMode,
  measureMode,
  aiPatchMode,
  annotationToolDefaults,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationDeleted,
  onPatchApplied,
}: FabricPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  const [selectedAnn, setSelectedAnn] = useState<SelectedAnnotationState | null>(null);
  const [measureResult, setMeasureResult] = useState<string | null>(null);
  const [drawingScale, setDrawingScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(window.localStorage.getItem("opdf-measure-scale"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>(() => {
    if (typeof window === "undefined") return "m";
    const saved = window.localStorage.getItem("opdf-measure-unit");
    return saved === "mm" || saved === "cm" || saved === "m" ? saved : "m";
  });
  const [calibratedMmPerPdfPoint, setCalibratedMmPerPdfPoint] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = Number(window.localStorage.getItem("opdf-measure-calibration"));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [pendingCalibrationPdfPoints, setPendingCalibrationPdfPoints] = useState<number | null>(null);
  const [knownCalibrationValue, setKnownCalibrationValue] = useState("1");

  useEffect(() => {
    window.localStorage.setItem("opdf-measure-scale", String(drawingScale));
  }, [drawingScale]);

  useEffect(() => {
    window.localStorage.setItem("opdf-measure-unit", measurementUnit);
  }, [measurementUnit]);

  useEffect(() => {
    if (calibratedMmPerPdfPoint) {
      window.localStorage.setItem("opdf-measure-calibration", String(calibratedMmPerPdfPoint));
    } else {
      window.localStorage.removeItem("opdf-measure-calibration");
    }
  }, [calibratedMmPerPdfPoint]);

  const effectiveMmPerPdfPoint = calibratedMmPerPdfPoint ?? presetMmPerPdfPoint(drawingScale);

  const applyCalibration = () => {
    if (!pendingCalibrationPdfPoints) return;
    const knownValue = Number(knownCalibrationValue);
    const knownMillimeters = toMillimeters(knownValue, measurementUnit);
    const next = calibrateMmPerPdfPoint(pendingCalibrationPdfPoints, knownMillimeters);
    if (!next) return;
    setCalibratedMmPerPdfPoint(next);
    setCalibrationMode(false);
    setPendingCalibrationPdfPoints(null);
    setMeasureResult(null);
  };

  const resetCalibration = () => {
    setCalibratedMmPerPdfPoint(null);
    setPendingCalibrationPdfPoints(null);
    setCalibrationMode(false);
  };

  const isAnyDrawMode = highlightMode || shapeMode || redactMode || measureMode || aiPatchMode;

  // ─── Init Fabric Canvas ────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      selection: false,
      // Prevent the default browser selection behavior
      preserveObjectStacking: true,
      // The Fabric layer contains vector annotations only. Keeping retina
      // scaling off avoids another multi-megapixel backing store on A0/A1 sheets.
      enableRetinaScaling: false,
    });
    fabricRef.current = canvas;

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [width, height]);

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
    aiPatchMode,
    annotationToolDefaults,
    pageNumber,
    onAnnotationCreated,
    setMeasureResult,
    pageScale,
    mmPerPdfPoint: effectiveMmPerPdfPoint,
    measurementUnit,
    onMeasureCommitted: (pdfPoints) => {
      if (calibrationMode) {
        setPendingCalibrationPdfPoints(pdfPoints);
      }
    },
    onPatchApplied,
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
    selectFabricObject,
  });

  return (
    <div ref={containerRef} style={{ position: "relative", width, height }} className="fabric-page-container">
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width,
          height,
          objectFit: "fill",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      <canvas ref={canvasRef} />

      {measureMode && (
        <div className="absolute top-3 left-3 z-30 flex max-w-[420px] flex-wrap items-center gap-1.5 rounded-md border border-emerald-300 bg-white/95 px-2 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm">
          <span>Tỷ lệ</span>
          <select
            value={drawingScale}
            onChange={(event) => {
              setDrawingScale(Number(event.target.value));
              setCalibratedMmPerPdfPoint(null);
            }}
            className="rounded border border-emerald-200 bg-white px-1 py-0.5"
            aria-label="Drawing scale"
            disabled={calibrationMode}
          >
            {[1, 20, 50, 100, 200, 500].map((value) => (
              <option key={value} value={value}>1:{value}</option>
            ))}
          </select>
          <select
            value={measurementUnit}
            onChange={(event) => setMeasurementUnit(event.target.value as MeasurementUnit)}
            className="rounded border border-emerald-200 bg-white px-1 py-0.5"
            aria-label="Measurement unit"
          >
            <option value="m">m</option>
            <option value="cm">cm</option>
            <option value="mm">mm</option>
          </select>
          <button
            type="button"
            className={`rounded border px-1.5 py-0.5 ${calibrationMode ? "border-amber-400 bg-amber-50 text-amber-800" : "border-emerald-200 bg-white"}`}
            onClick={() => {
              setCalibrationMode((current) => !current);
              setPendingCalibrationPdfPoints(null);
            }}
            title="Vẽ một đoạn có kích thước thực đã biết để hiệu chuẩn"
          >
            {calibrationMode ? "Đang calibrate…" : calibratedMmPerPdfPoint ? "Đã calibrate" : "Calibrate"}
          </button>
          {calibratedMmPerPdfPoint && !calibrationMode ? (
            <button
              type="button"
              className="rounded border border-emerald-200 bg-white px-1.5 py-0.5"
              onClick={resetCalibration}
              title="Quay về tỷ lệ 1:N"
            >
              Reset
            </button>
          ) : null}
          {calibrationMode ? (
            <span className="text-amber-700">Kéo theo một kích thước đã biết</span>
          ) : null}
        </div>
      )}

      {measureMode && calibrationMode && pendingCalibrationPdfPoints ? (
        <div className="absolute left-3 top-12 z-40 w-[290px] rounded-md border border-amber-300 bg-white p-2 text-[11px] text-slate-800 shadow-lg">
          <div className="mb-1 font-bold">Nhập kích thước thực của đoạn vừa vẽ</div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0.001"
              step="any"
              value={knownCalibrationValue}
              onChange={(event) => setKnownCalibrationValue(event.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
              aria-label="Known calibration distance"
            />
            <span className="w-6 text-center font-semibold">{measurementUnit}</span>
            <button
              type="button"
              className="rounded bg-emerald-600 px-2 py-1 font-bold text-white"
              onClick={applyCalibration}
            >
              Áp dụng
            </button>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            Sau khi áp dụng, phép đo dùng calibration này thay cho preset 1:{drawingScale}.
          </div>
        </div>
      ) : null}

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
