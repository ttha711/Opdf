import type { Dispatch, MutableRefObject, SetStateAction, WheelEvent } from "react";
import type { ActiveTool, PendingRect, ViewMode, ZoomPreset } from "../lib/app-types";

export function useViewerControls({
  hasDocument,
  highlightMode,
  viewMode,
  totalPages,
  setTransitionDirection,
  setTransitionTick,
  page,
  setPage,
  setZoomPreset,
  setScale,
  setRotation,
  setPageRotations,
  lastWheelFlipAtRef,
  activeTool,
  addHighlight,
  createToolAnnotation,
  setPendingNote,
  setShowSignModal,
}: {
  hasDocument: boolean;
  highlightMode: boolean;
  viewMode: ViewMode;
  totalPages: number;
  setTransitionDirection: Dispatch<SetStateAction<"next" | "prev">>;
  setTransitionTick: Dispatch<SetStateAction<number>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  setZoomPreset: Dispatch<SetStateAction<ZoomPreset>>;
  setScale: Dispatch<SetStateAction<number>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setPageRotations: Dispatch<SetStateAction<Record<number, number>>>;
  lastWheelFlipAtRef: MutableRefObject<number>;
  activeTool: ActiveTool;
  addHighlight: (pageNumber: number, rect: PendingRect) => Promise<void>;
  createToolAnnotation: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: PendingRect & { image?: string; imageType?: string }) => Promise<void>;
  setPendingNote: Dispatch<SetStateAction<{ page: number; rect: PendingRect } | null>>;
  setShowSignModal: Dispatch<SetStateAction<boolean>>;
}) {
  function goPrevPage() {
    setTransitionDirection("prev");
    setTransitionTick((n) => n + 1);
    setPage((p) => Math.max(1, p - 1));
  }

  function goNextPage() {
    setTransitionDirection("next");
    setTransitionTick((n) => n + 1);
    setPage((p) => (totalPages > 0 ? Math.min(totalPages, p + 1) : p + 1));
  }

  function zoomIn(customScale?: number) {
    setZoomPreset("actual");
    if (typeof customScale === "number" && !isNaN(customScale)) {
      setScale(Math.max(0.5, Math.min(3, customScale)));
    } else {
      setScale((s) => Math.min(3, Number((s + 0.1).toFixed(2))));
    }
  }

  function zoomOut() {
    setZoomPreset("actual");
    setScale((s) => Math.max(0.5, Number((s - 0.1).toFixed(2))));
  }

  function resetZoom() {
    setZoomPreset("actual");
    setScale(1);
  }

  function applyZoomPreset(preset: ZoomPreset) {
    setZoomPreset(preset);
    if (preset === "actual") setScale(1);
    if (preset === "fit-width") setScale(1.35);
    if (preset === "fit-page") setScale(0.85);
  }

  function rotateLeft() {
    setPageRotations((prev) => {
      const currentRotation = prev[page] || 0;
      const nextRotation = (currentRotation - 90 + 360) % 360;
      return { ...prev, [page]: nextRotation };
    });
  }

  function rotateRight() {
    setPageRotations((prev) => {
      const currentRotation = prev[page] || 0;
      const nextRotation = (currentRotation + 90) % 360;
      return { ...prev, [page]: nextRotation };
    });
  }

  async function onPageToolAction(pageNumber: number, kind: string, rect: PendingRect & { image?: string; imageType?: string }) {
    if (!hasDocument) return;
    if (kind === "highlight") return addHighlight(pageNumber, rect);
    if (kind === "note") {
      setPendingNote({ page: pageNumber, rect });
      return;
    }
    if (kind === "signature") {
      setPendingNote({ page: pageNumber, rect });
      setShowSignModal(true);
      return;
    }
    if (kind === "shape" || kind === "redact" || kind === "underline" || kind === "strike" || kind === "image") {
      return createToolAnnotation(kind, pageNumber, rect);
    }
  }

  function onViewerWheel(event: WheelEvent<HTMLElement>) {
    if (!hasDocument || highlightMode || event.ctrlKey || viewMode === "continuous") return;
    const now = Date.now();
    if (now - lastWheelFlipAtRef.current < 180 || Math.abs(event.deltaY) < 10) return;
    if (event.deltaY > 0) goNextPage();
    else goPrevPage();
    lastWheelFlipAtRef.current = now;
  }

  function onActivePageChange(nextPage: number) {
    setPage((p) => (p === nextPage ? p : nextPage));
  }

  return {
    goPrevPage,
    goNextPage,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    onPageToolAction,
    onViewerWheel,
    onActivePageChange,
    createToolAnnotation,
  };
}
