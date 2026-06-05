import type { RenderedPage } from "./PdfViewer.types";

export function PdfViewerEmpty() {
  return (
    <div className="empty-viewer">
      <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="10" y="4" width="36" height="48" rx="3" />
        <path d="M34 4v14h12" />
        <path d="M18 28h20M18 34h16M18 40h12" />
      </svg>
      <p>Open a PDF to get started</p>
      <small>Use File - Open or drag & drop a PDF file</small>
    </div>
  );
}

interface PdfPageStageProps {
  pageData: RenderedPage;
  targetScale: number;
  targetRotation: number;
  transitionDirection: "next" | "prev";
  viewMode: "continuous" | "page";
  highlightMode: boolean;
  shapeMode: boolean;
  redactMode: boolean;
  measureMode: boolean;
  activeTool: string;
  annotationToolDefaults: import("../lib/app-types").AnnotationToolDefaults;
  annotations: any[];
  pageElementsRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  onActivePageChange?: (page: number) => void;
  onPageToolAction?: (page: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
  /** Called after an ai-patch is placed so the parent can switch back to 'select' tool */
  onPatchApplied?: () => void;
  createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void>;
}

import React from "react";
import { FabricPage } from "./FabricPage";
import { PdfTextLayer } from "./PdfTextSelection";
import { getNormalizedRect } from "./PdfViewer.utils";

export function PdfPageStage(props: PdfPageStageProps) {
  const {
    pageData,
    targetScale,
    targetRotation,
    transitionDirection,
    viewMode,
    highlightMode,
    shapeMode,
    redactMode,
    measureMode,
    activeTool,
    annotationToolDefaults,
    annotations,
    pageElementsRef,
    onActivePageChange,
    onPageToolAction,
    onAnnotationUpdated,
    onAnnotationDeleted,
    onPatchApplied,
    createToolAnnotation,
  } = props;

  const canPreviewZoom = pageData.rotation === targetRotation && pageData.scale > 0;
  const previewScale = canPreviewZoom ? targetScale / pageData.scale : 1;
  const stageWidth = canPreviewZoom ? pageData.width * previewScale : pageData.width;
  const stageHeight = canPreviewZoom ? pageData.height * previewScale : pageData.height;
  const isPreviewingZoom = Math.abs(previewScale - 1) > 0.001;

  return (
    <div
      key={`${pageData.pageNumber}-${transitionDirection}-${viewMode}`}
      data-page={pageData.pageNumber}
      ref={(el) => {
        if (el) pageElementsRef.current.set(pageData.pageNumber, el);
      }}
      className={`page-stage page-transition ${transitionDirection} ${highlightMode ? "highlight-mode" : ""} ${shapeMode ? "shape-mode" : ""} ${redactMode ? "redact-mode" : ""}`}
      data-zoom-preview={isPreviewingZoom ? "true" : undefined}
      style={{ width: `${stageWidth}px`, height: `${stageHeight}px` }}
      onClick={(event) => {
        if (document.body.dataset.opdfSelecting === "1") {
          return;
        }
        if (window.getSelection()?.toString().trim()) {
          return;
        }
        onActivePageChange?.(pageData.pageNumber);
        const aiPatchMode = activeTool === "ai-patch";
        if (!shapeMode && !highlightMode && !redactMode && !measureMode && !aiPatchMode) {
          const pt = getNormalizedRect(event.currentTarget, event.clientX, event.clientY);
          const jitterX = (Math.random() - 0.5) * 0.02;
          const jitterY = (Math.random() - 0.5) * 0.02;
          onPageToolAction?.(pageData.pageNumber, activeTool, {
            x: Math.max(0, Math.min(1, pt.x + jitterX)),
            y: Math.max(0, Math.min(1, pt.y + jitterY)),
            width: 0.18,
            height: 0.08,
          });
        }
      }}
    >
      <div className="page-zoom-layer" style={{ width: pageData.width, height: pageData.height, transform: `scale(${previewScale})` }}>
        <FabricPage
          pageNumber={pageData.pageNumber}
          width={pageData.width}
          height={pageData.height}
          imageUrl={pageData.imageUrl}
          annotations={annotations}
          highlightMode={highlightMode || false}
          shapeMode={shapeMode || false}
          redactMode={redactMode || false}
          measureMode={measureMode || false}
          aiPatchMode={activeTool === "ai-patch"}
          annotationToolDefaults={annotationToolDefaults}
          onAnnotationCreated={(pageNum, kind, rect) => {
            if (kind === "note" && (rect as any).isPatch) {
              // Đối với AI Patch Note, tạo trực tiếp không qua modal nhập tay
              createToolAnnotation?.("note", pageNum, rect as any);
            } else {
              onPageToolAction?.(pageNum, kind, rect as any);
            }
          }}
          onAnnotationUpdated={onAnnotationUpdated}
          onAnnotationDeleted={onAnnotationDeleted}
          onPatchApplied={onPatchApplied}
        />
        <PdfTextLayer
          pageNumber={pageData.pageNumber}
          width={pageData.width}
          height={pageData.height}
          textItems={pageData.textItems}
          selectionEnabled={!highlightMode && !shapeMode && !redactMode && !measureMode && activeTool !== "ai-patch"}
          imageUrl={pageData.imageUrl}
          onAction={(pageNum, kind, rect) => {
            onPageToolAction?.(pageNum, kind, rect);
          }}
          createToolAnnotation={createToolAnnotation}
          annotations={annotations}
          onAnnotationUpdated={onAnnotationUpdated}
        />
      </div>
    </div>
  );
}
