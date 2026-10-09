import { useEffect, useRef } from "react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
  registerViewerControls,
} from "../../lib/viewer-runtime";
import { NativeEditPageOverlay } from "./NativeEditPageOverlay";
import { NativeEditFallbackRaster } from "./NativeEditFallbackRaster";

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
  // Keep Automatic zoom during first layout. An early numeric request can
  // leave EmbedPDF 2.x waiting for a viewport layout and paint no page.
  const previousExternalScale = useRef(scale);
  const pendingPageRef = useRef<number | null>(null);

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
    goToPage: (pageNumber) => {
      if (!scroll) return;
      const destination = Math.max(1, pageNumber);
      // The filmstrip calls this viewer API directly, before the parent page
      // prop changes. Ignore interim virtualized scroll positions until arrival.
      pendingPageRef.current = destination;
      scroll.scrollToPage({ pageNumber: destination, behavior: "instant" });
    },
  }), [scroll, zoom]);

  useEffect(() => {
    if (scrollState.totalPages > 0) onDocumentLoaded?.(scrollState.totalPages);
  }, [onDocumentLoaded, scrollState.totalPages]);

  // A programmatic jump can report intermediate virtualized pages before
  // EmbedPDF reaches its destination. Do not feed those transient positions
  // back to the parent: that would issue another jump and oscillate forever.

  useEffect(() => {
    if (!scroll || page < 1 || scrollState.totalPages <= 0) return;
    if (page === scrollState.currentPage) {
      pendingPageRef.current = null;
      return;
    }
    pendingPageRef.current = page;
    scroll.scrollToPage({ pageNumber: page, behavior: "instant" });
  }, [page, scroll, scrollState.totalPages]);

  useEffect(() => {
    const current = scrollState.currentPage;
    if (current <= 0) return;
    const pending = pendingPageRef.current;
    if (pending !== null) {
      if (current !== pending) return;
      pendingPageRef.current = null;
    }
    if (current !== page) onActivePageChange?.(current);
  }, [onActivePageChange, page, scrollState.currentPage]);

  useEffect(() => {
    // Only apply actual external zoom changes after the initial document layout.
    // Zoom changes reported by the viewer already match currentZoomLevel.
    if (!zoom || !scrollState.totalPages) return;
    if (previousExternalScale.current === scale) return;
    previousExternalScale.current = scale;
    if (!Number.isFinite(scale) || scale <= 0) return;
    if (Math.abs(zoomState.currentZoomLevel - scale) < 0.001) return;
    zoom.requestZoom(scale);
  }, [scale, scrollState.totalPages, zoom, zoomState.currentZoomLevel]);

  useEffect(() => {
    const next = zoomState.currentZoomLevel;
    if (Number.isFinite(next) && next > 0 && Math.abs(next - scale) >= 0.001) {
      onViewerScaleChange?.(next);
    }
  }, [onViewerScaleChange, scale, zoomState.currentZoomLevel]);

  return (
    <Viewport documentId={documentId} className="native-edit-viewport">
      <Scroller
        documentId={documentId}
        renderPage={({ width, height, pageIndex }) => (
          <div className="native-edit-page" style={{ width, height }}>
            <RenderLayer documentId={documentId} pageIndex={pageIndex} />
            <NativeEditFallbackRaster
              pageIndex={pageIndex}
              revisionKey={revisionKey}
              enabled={pageIndex + 1 === (scrollState.currentPage || page)}
              width={width}
              height={height}
              getDocumentBytes={getDocumentBytes}
            />
            <NativeEditPageOverlay
              pageIndex={pageIndex}
              enabled={pageIndex + 1 === (scrollState.currentPage || page)}
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
