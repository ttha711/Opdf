import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction, type WheelEvent } from "react";
import type { ViewMode, ZoomPreset } from "../lib/app-types";
import { getViewerControls } from "../lib/viewer-runtime";

export function useViewerControls({
  hasDocument,
  viewMode,
  totalPages,
  viewerAreaRef,
  page,
  setPage,
  setZoomPreset,
  setScale,
  setPageRotations,
  lastWheelFlipAtRef,
}: {
  hasDocument: boolean;
  viewMode: ViewMode;
  totalPages: number;
  viewerAreaRef: RefObject<HTMLElement | null>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  setZoomPreset: Dispatch<SetStateAction<ZoomPreset>>;
  setScale: Dispatch<SetStateAction<number>>;
  setPageRotations: Dispatch<SetStateAction<Record<number, number>>>;
  lastWheelFlipAtRef: MutableRefObject<number>;
}) {
  function goPrevPage() {
    setPage((p) => Math.max(1, p - 1));
  }

  function goNextPage() {
    setPage((p) => (totalPages > 0 ? Math.min(totalPages, p + 1) : p + 1));
  }

  const clampScale = (value: number) => Math.min(5, Math.max(0.05, value));

  function zoomIn(customScale?: number) {
    setZoomPreset("actual");
    if (typeof customScale === "number" && !isNaN(customScale)) {
      setScale(clampScale(customScale));
      return;
    }
    const viewer = getViewerControls();
    if (viewer?.zoomIn) {
      viewer.zoomIn();
      return;
    }
    setScale((s) => clampScale(Number((s * 1.15).toFixed(3))));
  }

  function zoomOut() {
    setZoomPreset("actual");
    const viewer = getViewerControls();
    if (viewer?.zoomOut) {
      viewer.zoomOut();
      return;
    }
    setScale((s) => clampScale(Number((s / 1.15).toFixed(3))));
  }

  function resetZoom() {
    setZoomPreset("actual");
    const viewer = getViewerControls();
    if (viewer?.resetZoom) {
      viewer.resetZoom();
      return;
    }
    setScale(1);
  }

  function applyZoomPreset(preset: ZoomPreset) {
    setZoomPreset(preset);
    const pdfium = getViewerControls();
    if (preset === "actual") {
      if (pdfium?.resetZoom) {
        pdfium.resetZoom();
        return;
      }
      setScale(1);
      return;
    }
    if (preset === "fit-width" && pdfium?.fitWidth) {
      pdfium.fitWidth();
      return;
    }
    if (preset === "fit-page" && pdfium?.fitPage) {
      pdfium.fitPage();
      return;
    }

    const viewer = viewerAreaRef.current;
    const pageElement = viewer?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!viewer || !pageElement) return;

    const pageRect = pageElement.getBoundingClientRect();
    if (pageRect.width <= 0 || pageRect.height <= 0) return;

    const horizontalPadding = 32;
    const verticalPadding = 32;
    const availableWidth = Math.max(1, viewer.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, viewer.clientHeight - verticalPadding);

    setScale((current) => {
      const widthRatio = availableWidth / pageRect.width;
      const heightRatio = availableHeight / pageRect.height;
      const ratio = preset === "fit-width" ? widthRatio : Math.min(widthRatio, heightRatio);
      return clampScale(Number((current * ratio).toFixed(4)));
    });
  }

  function rotateLeft() {
    const viewer = getViewerControls();
    if (viewer?.rotateBackward) {
      viewer.rotateBackward();
      return;
    }
    setPageRotations((prev) => {
      const currentRotation = prev[page] || 0;
      const nextRotation = (currentRotation - 90 + 360) % 360;
      return { ...prev, [page]: nextRotation };
    });
  }

  function rotateRight() {
    const viewer = getViewerControls();
    if (viewer?.rotateForward) {
      viewer.rotateForward();
      return;
    }
    setPageRotations((prev) => {
      const currentRotation = prev[page] || 0;
      const nextRotation = (currentRotation + 90) % 360;
      return { ...prev, [page]: nextRotation };
    });
  }

  function onViewerWheel(event: WheelEvent<HTMLElement>) {
    if (getViewerControls()) return;
    if (!hasDocument || event.ctrlKey || viewMode === "continuous") return;
    const now = Date.now();
    if (now - lastWheelFlipAtRef.current < 180 || Math.abs(event.deltaY) < 10) return;
    if (event.deltaY > 0) goNextPage();
    else goPrevPage();
    lastWheelFlipAtRef.current = now;
  }

  const onActivePageChange = useCallback((nextPage: number) => {
    setPage((p) => (p === nextPage ? p : nextPage));
  }, [setPage]);

  return {
    goPrevPage,
    goNextPage,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    onViewerWheel,
    onActivePageChange,
  };
}
