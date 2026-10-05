import { useEffect } from "react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
  registerViewerControls,
} from "../../lib/viewer-runtime";
import { NativeEditPageOverlay } from "./NativeEditPageOverlay";

type Props = {
  documentId: string;
  page: number;
  scale: number;
  revisionKey: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  onDocumentLoaded?: (pages: number) => void;
  onActivePageChange?: (page: number) => void;
  onViewerScaleChange?: (scale: number) => void;
};

export function NativeEditDocument({
  documentId,
  page,
  scale,
  revisionKey,
  getDocumentBytes,
  onDocumentLoaded,
  onActivePageChange,
  onViewerScaleChange,
}: Props) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);

  useEffect(() => registerViewerControls({
    zoomIn: () => zoom?.zoomIn(),
    zoomOut: () => zoom?.zoomOut(),
    resetZoom: () => zoom?.requestZoom(1),
    fitWidth: () => zoom?.requestZoom(ZoomMode.FitWidth),
    fitPage: () => zoom?.requestZoom(ZoomMode.FitPage),
    rotateForward: () => {},
    rotateBackward: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: () => false,
    canRedo: () => false,
  }), [zoom]);

  useEffect(() => {
    if (scrollState.totalPages > 0) onDocumentLoaded?.(scrollState.totalPages);
  }, [onDocumentLoaded, scrollState.totalPages]);

  useEffect(() => {
    if (scrollState.currentPage > 0 && scrollState.currentPage !== page) {
      onActivePageChange?.(scrollState.currentPage);
    }
  }, [onActivePageChange, page, scrollState.currentPage]);

  useEffect(() => {
    if (!scroll || page < 1 || page === scrollState.currentPage) return;
    scroll.scrollToPage({ pageNumber: page, behavior: "instant" });
  }, [page, scroll, scrollState.currentPage]);

  useEffect(() => {
    if (!zoom || !Number.isFinite(scale) || scale <= 0) return;
    if (Math.abs(zoomState.currentZoomLevel - scale) < 0.001) return;
    zoom.requestZoom(scale);
  }, [scale, zoom, zoomState.currentZoomLevel]);

  useEffect(() => {
    const next = zoomState.currentZoomLevel;
    if (Number.isFinite(next) && next > 0 && Math.abs(next - scale) >= 0.001) {
      onViewerScaleChange?.(next);
    }
  }, [onViewerScaleChange, scale, zoomState.currentZoomLevel]);

  return (
    <Viewport documentId={documentId} className="native-edit-surface">
      <Scroller
        documentId={documentId}
        renderPage={({ width, height, pageIndex }) => (
          <div className="native-edit-page" style={{ width, height }}>
            <RenderLayer documentId={documentId} pageIndex={pageIndex} />
            <NativeEditPageOverlay
              pageIndex={pageIndex}
              width={width}
              height={height}
              revisionKey={revisionKey}
              getDocumentBytes={getDocumentBytes}
            />
          </div>
        )}
      />
    </Viewport>
  );
}
