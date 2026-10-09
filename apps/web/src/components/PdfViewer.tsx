// opdf-file-size-allow: legacy EmbedPDF integration coordinator; this patch fixes tool/panel lifecycle without expanding the component surface.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PDFViewer as EmbedPdfViewer,
  ZoomMode,
  PdfAnnotationSubtype,
} from "@embedpdf/react-pdf-viewer";
import type { PdfViewerProps } from "./PdfViewer.types";
import type { ActiveTool } from "../lib/app-types";
import { isEmbedPdfReplaceTextTool, mapActiveToolToEmbedPdfAnnotation } from "../lib/annotationToolMapping";
import {
  emitViewerContentArea,
  registerViewerBytesProvider,
  registerViewerContentPickStarter,
  registerViewerControls,
  registerViewerPageImageProvider,
} from "../lib/viewer-runtime";
import { PdfMeasurementToolbar } from "./PdfMeasurementToolbar";
import { AiPatchDialog } from "./AiPatchDialog";
import { MeasurementCalibrationDialog } from "./MeasurementCalibrationDialog";
import { resolvePdfiumPageCount } from "../lib/pdfiumDocumentState";
import { getServerDocumentUrl } from "../lib/documentSource";
import { installAnnotationThumbnailSync } from "../lib/embedPdfAnnotationThumbnails";
import { pdfiumRuntimeFontFallback, pdfiumRuntimeWasmUrl } from "../lib/pdfiumRuntimeAssets";
import {
  calibrateMmPerPdfPoint,
  formatMillimeters,
  formatSquareMillimeters,
  presetMmPerPdfPoint,
  type MeasurementMode,
  type MeasurementUnit,
} from "../lib/measurement";

const DOCUMENT_ID = "opdf-active-document";
const SIDEBAR_PREF_KEY = "opdf-embedpdf-sidebar";

function isVisibleElement(element: HTMLElement | null) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}


export function PdfViewer({
  data,
  sourceBlob = null,
  sourceIdentity = "",
  page,
  scale,
  activeTool = "select",
  onDocumentLoaded,
  onError,
  onActivePageChange,
  onViewerDirty,
  onViewerScaleChange,
  onPatchApplied,
  onActiveToolChange,
  onViewerReady,
}: PdfViewerProps) {
  const [readyViewer, setReadyViewer] = useState<{ sourceUrl: string; registry: any } | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const viewerRootRef = useRef<HTMLDivElement>(null);
  const viewerReadySourceRef = useRef<string | null>(null);
  const [documentReadySource, setDocumentReadySource] = useState<string | null>(null);
  const localSourceKeyRef = useRef<Uint8Array | Blob | null>(null);
  const suppressExternalPageRef = useRef(false);
  const preserveNativeToolRef = useRef(false);
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const lastPageRef = useRef(page);
  const lastScaleRef = useRef(scale);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(() => {
    const saved = window.localStorage.getItem("opdf-measure-mode");
    return saved === "perimeter" || saved === "area" ? saved : "distance";
  });
  const [drawingScale, setDrawingScale] = useState(() => {
    const saved = Number(window.localStorage.getItem("opdf-measure-scale"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>(() => {
    const saved = window.localStorage.getItem("opdf-measure-unit");
    return saved === "mm" || saved === "cm" ? saved : "m";
  });
  const calibrationKey = "opdf-measure-calibration:" + encodeURIComponent(sourceIdentity || "document");
  const [calibratedMmPerPdfPoint, setCalibratedMmPerPdfPoint] = useState<number | null>(() => {
    const saved = Number(window.localStorage.getItem(calibrationKey));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  const [measurementResult, setMeasurementResult] = useState<string | null>(null);
  const [pendingAiPatch, setPendingAiPatch] = useState<{ pageIndex: number; rect: any } | null>(null);
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const lastMeasuredPdfValueRef = useRef<number | null>(null);

  const serverUrl = useMemo(
    () => (sourceIdentity.startsWith("server://") ? getServerDocumentUrl(sourceIdentity) : null),
    [sourceIdentity],
  );

  useEffect(() => {
    const blob = sourceBlob ?? (data ? new Blob([data as unknown as BlobPart], { type: "application/pdf" }) : null);
    if (!blob) {
      localSourceKeyRef.current = null;
      setLocalUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    localSourceKeyRef.current = sourceBlob ?? data ?? null;
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, sourceBlob]);

  // A local working copy always wins over the persisted server URL. This keeps
  // unsaved structural edits visible while sourceIdentity still points at the
  // server document that Save should update.
  const sourceUrl = localUrl ?? serverUrl;
  const activeRegistry = readyViewer?.sourceUrl === sourceUrl ? readyViewer.registry : null;
  // Capture the original reader viewport when an edit commits new PDF bytes.
  // The PDF component may reinitialize for that revision, but its scroll
  // coordinates should survive rather than falling back to the page top.
  useEffect(() => {
    if (!activeRegistry || !sourceUrl) return;
    const viewport = activeRegistry.getPlugin?.("viewport")?.provides?.() as any;
    return () => {
      if (activeToolRef.current !== "edit-content") return;
      const scope = viewport?.forDocument?.(DOCUMENT_ID) ?? viewport;
      const metrics = scope?.getMetrics?.();
      if (Number.isFinite(metrics?.scrollTop)) {
        pendingPositionRef.current = {
          x: Number(metrics.scrollLeft) || 0,
          y: metrics.scrollTop,
        };
      }
    };
  }, [activeRegistry, sourceUrl]);


  useEffect(() => {
    if (!sourceUrl || !activeRegistry) return;
    return installAnnotationThumbnailSync(activeRegistry, DOCUMENT_ID);
  }, [activeRegistry, sourceUrl]);

  useEffect(() => {
    if (
      !sourceUrl ||
      documentReadySource !== sourceUrl ||
      !activeRegistry ||
      window.innerWidth < 900
    ) return;

    const ui = activeRegistry.getPlugin?.("ui")?.provides?.() as any;
    const scope = ui?.forDocument?.(DOCUMENT_ID) ?? ui;
    if (!scope?.isSidebarOpen || !scope?.setActiveSidebar) return;

    const placement = "left";
    const slot = "main";
    const sidebarId = "sidebar-panel";
    const shouldOpen = window.localStorage.getItem(SIDEBAR_PREF_KEY) !== "closed";

    if (shouldOpen && !scope.isSidebarOpen(placement, slot, sidebarId)) {
      scope.setActiveSidebar(placement, slot, sidebarId);
    }

    const remember = (event: any) => {
      if (
        event?.placement && event.placement !== placement ||
        event?.slot && event.slot !== slot
      ) return;
      queueMicrotask(() => {
        window.localStorage.setItem(
          SIDEBAR_PREF_KEY,
          scope.isSidebarOpen(placement, slot, sidebarId) ? "open" : "closed",
        );
      });
    };

    const off = scope.onSidebarChanged?.(remember);
    return () => {
      if (typeof off === "function") off();
    };
  }, [activeRegistry, documentReadySource, sourceUrl]);

  const config = useMemo(() => {
    if (!sourceUrl) return null;
    return {
      // Keep the renderer on the same-origin build asset instead of the
      // EmbedPDF CDN default. This makes the viewer work behind restricted
      // egress and avoids a TLS-dependent cold start for large documents.
      wasmUrl: pdfiumRuntimeWasmUrl,
      fontFallback: pdfiumRuntimeFontFallback,
      fonts: { ui: null, signature: null },
      documentManager: {
        initialDocuments: [
          {
            url: sourceUrl,
            documentId: DOCUMENT_ID,
            autoActivate: true,
          },
        ],
        maxDocuments: 1,
      },
      tabBar: "never",
      chrome: (base: any, helpers: any) =>
        helpers?.removeItems ? helpers.removeItems(base, ["document:menu"]) : base,
      theme: { preference: "light" },
      annotations: { annotationAuthor: "OPDF" },
      pan: { defaultMode: "mobile" },
      zoom: {
        // EmbedPDF 2.x gates the viewport during initial zoom and only releases
        // that gate for a zoom mode. A numeric initial level can leave the main
        // scroller permanently gated (toolbar/thumbnails load, page stays blank).
        // Automatic resolves to 100% when the page already fits the viewport.
        defaultZoomLevel: ZoomMode.Automatic,
        minZoom: 0.05,
        maxZoom: 5,
      },
      scroll: {
        defaultPageGap: 16,
      },
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || !activeRegistry) return;

    const unsubscribers: Array<() => void> = [];
    const registry = activeRegistry;

      const scroll = registry.getPlugin?.("scroll")?.provides?.() as any;
      const documentManager = registry.getPlugin?.("document-manager")?.provides?.() as any;
      const exportApi = registry.getPlugin?.("export")?.provides?.() as any;
      const annotationApi = registry.getPlugin?.("annotation")?.provides?.() as any;
      const formApi = registry.getPlugin?.("form")?.provides?.() as any;
      const redactionApi = registry.getPlugin?.("redaction")?.provides?.() as any;
      const zoomApi = registry.getPlugin?.("zoom")?.provides?.() as any;
      const rotateApi = registry.getPlugin?.("rotate")?.provides?.() as any;
      const captureApi = registry.getPlugin?.("capture")?.provides?.() as any;
      const historyApi = registry.getPlugin?.("history")?.provides?.() as any;
      const thumbnailApi = registry.getPlugin?.("thumbnail")?.provides?.() as any;
      const commandsApi = registry.getPlugin?.("commands")?.provides?.() as any;

      const zoomScope = zoomApi?.forDocument?.(DOCUMENT_ID) ?? zoomApi;
      const rotateScope = rotateApi?.forDocument?.(DOCUMENT_ID) ?? rotateApi;
      const historyScope = historyApi?.forDocument?.(DOCUMENT_ID) ?? historyApi;
      const commandScope = commandsApi?.forDocument?.(DOCUMENT_ID) ?? commandsApi;
      // Only the visible viewer may handle toolbar navigation while editing.
      const unregisterControls = activeTool !== "edit-content" ? registerViewerControls({
        zoomIn: () => zoomScope?.zoomIn?.(),
        zoomOut: () => zoomScope?.zoomOut?.(),
        resetZoom: () => zoomScope?.requestZoom?.(1),
        fitWidth: () => zoomScope?.requestZoom?.(ZoomMode.FitWidth),
        fitPage: () => zoomScope?.requestZoom?.(ZoomMode.FitPage),
        rotateForward: () => rotateScope?.rotateForward?.(),
        rotateBackward: () => rotateScope?.rotateBackward?.(),
        undo: () => historyScope?.undo?.(),
        redo: () => historyScope?.redo?.(),
        canUndo: () => Boolean(historyScope?.canUndo?.()),
        canRedo: () => Boolean(historyScope?.canRedo?.()),
        goToPage: (pageNumber) => {
          const scrollScope = scroll?.forDocument?.(DOCUMENT_ID) ?? scroll;
          scrollScope?.scrollToPage?.({
            pageNumber: Math.max(1, pageNumber),
            behavior: "instant",
          });
        },
        executeCommand: async (commandId) => {
          await commandScope?.execute?.(commandId, "api");
        },
      }) : null;
      if (unregisterControls) unsubscribers.push(unregisterControls);

      const thumbnailScope = thumbnailApi?.forDocument?.(DOCUMENT_ID) ?? thumbnailApi;
      if (thumbnailScope?.renderThumb) {
        const unregisterPageImages = registerViewerPageImageProvider(async (pageNumber) => {
          try {
            return await thumbnailScope.renderThumb(Math.max(0, pageNumber - 1), 1).toPromise();
          } catch {
            return null;
          }
        });
        unsubscribers.push(unregisterPageImages);
      }

      if (zoomScope?.onStateChange) {
        const off = zoomScope.onStateChange((state: any) => {
          const next = state?.currentZoomLevel;
          if (typeof next !== "number" || !Number.isFinite(next)) return;
          lastScaleRef.current = next;
          onViewerScaleChange?.(next);
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const exportScope = exportApi?.forDocument?.(DOCUMENT_ID) ?? exportApi;
      if (exportScope?.saveAsCopy) {
        const viewerSource = localUrl ? localSourceKeyRef.current : sourceIdentity;
        const unregister = registerViewerBytesProvider(async () => {
          const buffer = await exportScope.saveAsCopy().toPromise();
          return buffer ? new Uint8Array(buffer) : null;
        }, viewerSource);
        unsubscribers.push(unregister);
      }

      const captureScope = captureApi?.forDocument?.(DOCUMENT_ID) ?? captureApi;
      if (captureScope?.enableMarqueeCapture) {
        const unregisterContentPick = registerViewerContentPickStarter(() => captureScope.enableMarqueeCapture());
        unsubscribers.push(unregisterContentPick);
      }
      if (captureScope?.onCaptureArea) {
        const off = captureScope.onCaptureArea((event: any) => {
          if (event?.documentId && event.documentId !== DOCUMENT_ID) return;
          if (activeTool === "edit-content") {
            emitViewerContentArea({ pageIndex: event.pageIndex, rect: event.rect });
            return;
          }
          if (activeTool !== "ai-patch") return;

          setPendingAiPatch({ pageIndex: event.pageIndex, rect: event.rect });
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      if (annotationApi?.onAnnotationEvent) {
        const off = annotationApi.onAnnotationEvent((event: any) => {
          if (event?.documentId && event.documentId !== DOCUMENT_ID) return;
          if (event?.type === "create" || event?.type === "update" || event?.type === "delete") {
            onViewerDirty?.();
          }
          if (event?.type !== "create" || activeTool !== "measure") return;

          const annotation = event.annotation;
          const effectiveMmPerPdfPoint = calibratedMmPerPdfPoint ?? presetMmPerPdfPoint(drawingScale);

          if (measurementMode === "distance" && annotation?.type === PdfAnnotationSubtype.LINE) {
            const start = annotation.linePoints?.start;
            const end = annotation.linePoints?.end;
            if (!start || !end) return;
            const pdfDistance = Math.hypot(end.x - start.x, end.y - start.y);
            lastMeasuredPdfValueRef.current = pdfDistance;
            setMeasurementResult(formatMillimeters(pdfDistance * effectiveMmPerPdfPoint, measurementUnit));
            return;
          }

          const vertices = Array.isArray(annotation?.vertices) ? annotation.vertices : [];
          if (measurementMode === "perimeter" && annotation?.type === PdfAnnotationSubtype.POLYLINE && vertices.length >= 2) {
            let distance = 0;
            for (let index = 1; index < vertices.length; index += 1) {
              distance += Math.hypot(vertices[index].x - vertices[index - 1].x, vertices[index].y - vertices[index - 1].y);
            }
            lastMeasuredPdfValueRef.current = distance;
            setMeasurementResult(formatMillimeters(distance * effectiveMmPerPdfPoint, measurementUnit));
            return;
          }

          if (measurementMode === "area" && annotation?.type === PdfAnnotationSubtype.POLYGON && vertices.length >= 3) {
            let twiceArea = 0;
            for (let index = 0; index < vertices.length; index += 1) {
              const next = vertices[(index + 1) % vertices.length];
              twiceArea += vertices[index].x * next.y - next.x * vertices[index].y;
            }
            const pdfArea = Math.abs(twiceArea) / 2;
            lastMeasuredPdfValueRef.current = null;
            setMeasurementResult(formatSquareMillimeters(pdfArea * effectiveMmPerPdfPoint * effectiveMmPerPdfPoint, measurementUnit));
          }
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      if (annotationApi?.onActiveToolChange && onActiveToolChange) {
        const off = annotationApi.onActiveToolChange((event: any) => {
          const rawTool = String(event?.tool?.id ?? event?.tool?.name ?? "").toLowerCase();
          if (isEmbedPdfReplaceTextTool(rawTool)) {
            const scope = annotationApi?.forDocument?.(DOCUMENT_ID) ?? annotationApi;
            scope?.setActiveTool?.(null);
            onActiveToolChange("edit-content");
            return;
          }
          if (activeTool !== "measure") return;
          const expectedMeasureTool =
            measurementMode === "area" ? "polygon" :
            measurementMode === "perimeter" ? "polyline" :
            "line";
          if (rawTool === expectedMeasureTool || rawTool.endsWith(":" + expectedMeasureTool)) return;

          let nextTool: ActiveTool = "select";
          if (rawTool.includes("highlight")) nextTool = "highlight";
          else if (rawTool.includes("ink") || rawTool.includes("draw")) nextTool = "draw";
          else if (rawTool.includes("freetext") || rawTool.includes("free-text")) nextTool = "text";
          else if (rawTool.includes("note")) nextTool = "note";
          else if (
            rawTool.includes("square") ||
            rawTool.includes("rectangle") ||
            rawTool.includes("circle") ||
            rawTool.includes("arrow") ||
            rawTool.includes("polygon") ||
            rawTool.includes("polyline") ||
            rawTool === "line"
          ) nextTool = "shape";

          preserveNativeToolRef.current = true;
          onActiveToolChange(nextTool);
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const formScope = formApi?.forDocument?.(DOCUMENT_ID);
      if (formScope?.onFieldValueChange) {
        const off = formScope.onFieldValueChange(() => onViewerDirty?.());
        if (typeof off === "function") unsubscribers.push(off);
      }

      const redactionScope = redactionApi?.forDocument?.(DOCUMENT_ID) ?? redactionApi;
      if (redactionScope?.onRedactionEvent) {
        const off = redactionScope.onRedactionEvent((event: any) => {
          if (event?.documentId && event.documentId !== DOCUMENT_ID) return;
          onViewerDirty?.();
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const scrollScope = scroll?.forDocument?.(DOCUMENT_ID) ?? scroll;
      const syncPageCount = (openedDocument?: any) => {
        const count = resolvePdfiumPageCount({
          documentId: DOCUMENT_ID,
          scrollScope,
          documentManager,
          openedDocument,
        });
        if (!count) return null;
        onDocumentLoaded?.(count);
        return count;
      };

      if (scroll?.onPageChange) {
        const off = scroll.onPageChange((event: any) => {
          if (event.documentId !== DOCUMENT_ID || activeToolRef.current === "edit-content") return;
          suppressExternalPageRef.current = true;
          lastPageRef.current = event.pageNumber;
          onActivePageChange?.(event.pageNumber);
          const eventTotal = typeof event.totalPages === "number" && event.totalPages > 0
            ? event.totalPages
            : null;
          if (eventTotal) onDocumentLoaded?.(eventTotal);
          else syncPageCount();
          queueMicrotask(() => {
            suppressExternalPageRef.current = false;
          });
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const restoreReaderPosition = () => {
        const position = pendingPositionRef.current;
        if (!position) return;
        const viewport = registry.getPlugin?.("viewport")?.provides?.() as any;
        const scope = viewport?.forDocument?.(DOCUMENT_ID) ?? viewport;
        if (!scope?.scrollTo) return;
        pendingPositionRef.current = null;
        requestAnimationFrame(() => scope.scrollTo({ ...position, behavior: "instant" }));
      };

      if (scroll?.onLayoutReady) {
        const off = scroll.onLayoutReady((event: any) => {
          if (event.documentId !== DOCUMENT_ID) return;
          syncPageCount();
          scrollScope?.scrollToPage?.({
            pageNumber: Math.max(1, page),
            behavior: "instant",
          });
          restoreReaderPosition();
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const signalViewerReady = () => {
        if (viewerReadySourceRef.current === sourceUrl) return;
        viewerReadySourceRef.current = sourceUrl;
        setDocumentReadySource(sourceUrl);
        onViewerReady?.();
      };

      if (documentManager?.onDocumentOpened) {
        const off = documentManager.onDocumentOpened((doc: any) => {
          const openedId = doc?.id ?? doc?.document?.id;
          if (openedId && openedId !== DOCUMENT_ID) return;
          const count = syncPageCount(doc);
          onError?.(null);
          if (count) signalViewerReady();
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      // If document-open/layout events happened before this bridge attached,
      // the live plugin state still contains the authoritative page count.
      if (syncPageCount()) { signalViewerReady(); restoreReaderPosition(); }

      if (documentManager?.onDocumentError) {
        const off = documentManager.onDocumentError((event: any) => {
          if (event?.documentId !== DOCUMENT_ID) return;
          const message = event?.error instanceof Error
            ? event.error.message
            : String(event?.error ?? "Unable to open PDF");
          onError?.(message);
        });
        if (typeof off === "function") unsubscribers.push(off);
      }
    return () => {
      unsubscribers.forEach((off) => off());
    };
  }, [
    sourceUrl,
    activeRegistry,
    activeTool,
    calibratedMmPerPdfPoint,
    drawingScale,
    measurementMode,
    measurementUnit,
    onActivePageChange,
    onDocumentLoaded,
    onError,
    onViewerDirty,
    onViewerScaleChange,
    onPatchApplied,
    onViewerReady,
  ]);

  useEffect(() => {
    if (!sourceUrl || !activeRegistry || suppressExternalPageRef.current || page === lastPageRef.current) return;
    const scroll = activeRegistry.getPlugin?.("scroll")?.provides?.() as any;
    scroll?.forDocument?.(DOCUMENT_ID)?.scrollToPage?.({
      pageNumber: Math.max(1, page),
      behavior: "instant",
    });
    lastPageRef.current = page;
  }, [activeRegistry, page, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || !activeRegistry || scale === lastScaleRef.current) return;
    const zoom = activeRegistry.getPlugin?.("zoom")?.provides?.() as any;
    zoom?.forDocument?.(DOCUMENT_ID)?.requestZoom?.(Math.max(0.05, Math.min(5, scale)));
    lastScaleRef.current = scale;
  }, [activeRegistry, scale, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || !activeRegistry) return;
    const registry = activeRegistry;

    if (preserveNativeToolRef.current) {
      preserveNativeToolRef.current = false;
      return;
    }

      const annotation = registry.getPlugin?.("annotation")?.provides?.() as any;
      const redaction = registry.getPlugin?.("redaction")?.provides?.() as any;
      const capture = registry.getPlugin?.("capture")?.provides?.() as any;
      const redactionScope = redaction?.forDocument?.(DOCUMENT_ID) ?? redaction;
      const annotationScope = annotation?.forDocument?.(DOCUMENT_ID) ?? annotation;
      const captureScope = capture?.forDocument?.(DOCUMENT_ID) ?? capture;

      if (activeTool === "redact") {
        annotationScope?.setActiveTool?.(null);
        if (!redactionScope?.isRedactActive?.()) redactionScope?.toggleRedact?.();
        return;
      }

      if (redactionScope?.isRedactActive?.()) redactionScope?.toggleRedact?.();

      if (activeTool === "ai-patch") {
        annotationScope?.setActiveTool?.(null);
        captureScope?.enableMarqueeCapture?.();
        return;
      }

      if (captureScope?.isMarqueeCaptureActive?.()) captureScope?.disableMarqueeCapture?.();

      if (activeTool === "measure") {
        const tool = measurementMode === "area" ? "polygon" : measurementMode === "perimeter" ? "polyline" : "line";
        annotationScope?.setActiveTool?.(tool);
        return;
      }

    annotationScope?.setActiveTool?.(mapActiveToolToEmbedPdfAnnotation(activeTool));
  }, [activeRegistry, activeTool, measurementMode, sourceUrl]);

  useEffect(() => {
    window.localStorage.setItem("opdf-measure-mode", measurementMode);
  }, [measurementMode]);

  useEffect(() => {
    window.localStorage.setItem("opdf-measure-scale", String(drawingScale));
  }, [drawingScale]);

  useEffect(() => {
    window.localStorage.setItem("opdf-measure-unit", measurementUnit);
  }, [measurementUnit]);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(calibrationKey));
    setCalibratedMmPerPdfPoint(Number.isFinite(saved) && saved > 0 ? saved : null);
    setMeasurementResult(null);
    lastMeasuredPdfValueRef.current = null;
  }, [calibrationKey]);

  const calibrateLastDistance = () => {
    const pdfDistance = lastMeasuredPdfValueRef.current;
    if (!pdfDistance || pdfDistance <= 0) return;
    setShowCalibrationDialog(true);
  };

  const applyCalibration = (numeric: number) => {
    const pdfDistance = lastMeasuredPdfValueRef.current;
    if (!pdfDistance || pdfDistance <= 0 || !Number.isFinite(numeric) || numeric <= 0) return;
    const knownMillimeters = measurementUnit === "m" ? numeric * 1000 : measurementUnit === "cm" ? numeric * 10 : numeric;
    const next = calibrateMmPerPdfPoint(pdfDistance, knownMillimeters);
    if (!next) return;
    setCalibratedMmPerPdfPoint(next);
    window.localStorage.setItem(calibrationKey, String(next));
    setMeasurementResult(formatMillimeters(pdfDistance * next, measurementUnit));
    setShowCalibrationDialog(false);
  };

  const resetCalibration = () => {
    setCalibratedMmPerPdfPoint(null);
    window.localStorage.removeItem(calibrationKey);
    setMeasurementResult(null);
  };

  const resumeAiPatchCapture = () => {
    const capture = activeRegistry?.getPlugin?.("capture")?.provides?.() as any;
    const captureScope = capture?.forDocument?.(DOCUMENT_ID) ?? capture;
    captureScope?.enableMarqueeCapture?.();
  };

  const cancelAiPatch = () => {
    setPendingAiPatch(null);
    resumeAiPatchCapture();
  };

  const applyAiPatch = (replacement: string) => {
    const value = replacement.trim();
    if (!pendingAiPatch || !value || !activeRegistry) return;

    const annotationApi = activeRegistry.getPlugin?.("annotation")?.provides?.() as any;
    const annotationScope = annotationApi?.forDocument?.(DOCUMENT_ID) ?? annotationApi;
    const defaults = annotationApi?.getTool?.("freeText")?.defaults ?? {};
    const patch = {
      ...defaults,
      id: crypto.randomUUID(),
      type: PdfAnnotationSubtype.FREETEXT,
      pageIndex: pendingAiPatch.pageIndex,
      rect: pendingAiPatch.rect,
      contents: value,
      color: "#ffffff",
      backgroundColor: "#ffffff",
      fontColor: defaults.fontColor ?? "#000000",
      opacity: 1,
    };
    annotationScope?.createAnnotation?.(pendingAiPatch.pageIndex, patch);
    annotationScope?.selectAnnotation?.(pendingAiPatch.pageIndex, patch.id);
    setPendingAiPatch(null);
    onViewerDirty?.();
    onPatchApplied?.();
    resumeAiPatchCapture();
  };

  if (!sourceUrl || !config) {
    return (
      <div className="viewer-shell flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        Open a PDF to start viewing.
      </div>
    );
  }

  return (
    <div
      ref={viewerRootRef}
      className="viewer-shell relative h-full min-h-0 overflow-hidden"
      data-opdf-engine="pdfium-wasm"
      data-opdf-source={localUrl ? "working-copy" : serverUrl ? "server" : "none"}
    >
      <AiPatchDialog
        open={Boolean(pendingAiPatch)}
        onCancel={cancelAiPatch}
        onApply={applyAiPatch}
      />
      <MeasurementCalibrationDialog
        open={showCalibrationDialog}
        unit={measurementUnit}
        onCancel={() => setShowCalibrationDialog(false)}
        onApply={applyCalibration}
      />
      {activeTool === "measure" ? (
        <PdfMeasurementToolbar
          mode={measurementMode}
          scale={drawingScale}
          unit={measurementUnit}
          result={measurementResult}
          calibrated={Boolean(calibratedMmPerPdfPoint)}
          canCalibrate={measurementMode === "distance" && Boolean(lastMeasuredPdfValueRef.current)}
          onModeChange={(mode) => {
            setMeasurementMode(mode);
            setMeasurementResult(null);
            lastMeasuredPdfValueRef.current = null;
          }}
          onScaleChange={(nextScale) => {
            setDrawingScale(nextScale);
            setCalibratedMmPerPdfPoint(null);
            window.localStorage.removeItem(calibrationKey);
            setMeasurementResult(null);
          }}
          onUnitChange={setMeasurementUnit}
          onCalibrate={calibrateLastDistance}
          onResetCalibration={resetCalibration}
          onClose={() => onActiveToolChange?.("select")}
        />
      ) : null}
      <EmbedPdfViewer
        key={sourceUrl}
        config={config as any}
        onReady={(registry: any) => setReadyViewer({ sourceUrl, registry })}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
