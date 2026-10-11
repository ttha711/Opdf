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
  const initializedZoomDocumentRef = useRef<string | null>(null);
  // Let the automatic first layout paint before inheriting the reader's zoom.
  // Requesting numeric zoom too early can leave the native PDFium page blank.
  useEffect(() => {
    if (!zoom || !scrollState.totalPages ||
        initializedZoomDocumentRef.current === documentId ||
        !Number.isFinite(zoomState.currentZoomLevel) || zoomState.currentZoomLevel <= 0) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        initializedZoomDocumentRef.current = documentId;
        previousExternalScale.current = scale;
        if (Number.isFinite(scale) && scale > 0 &&
            Math.abs(zoomState.currentZoomLevel - scale) >= 0.001) zoom.requestZoom(scale);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [documentId, scale, scrollState.totalPages, zoom, zoomState.currentZoomLevel]);
  const pendingPageRef = useRef<number | null>(null);
  const lastExternalPageRef = useRef<{ documentId: string; page: number } | null>(null);

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
    // This effect can run when useScroll changes its scope identity while the
    // user is already navigating. A stale parent page must not snap the canvas
    // back to that page; only a genuinely new parent page request may scroll.
    if (lastExternalPageRef.current?.documentId === documentId &&
        lastExternalPageRef.current.page === page) return;
    lastExternalPageRef.current = { documentId, page };
    if (page === scrollState.currentPage) {
      if (pendingPageRef.current === page) pendingPageRef.current = null;
      return;
    }
    pendingPageRef.current = page;
    scroll.scrollToPage({ pageNumber: page, behavior: "instant" });
  }, [documentId, page, scroll, scrollState.totalPages]);

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
    if (!zoom || !scrollState.totalPages || initializedZoomDocumentRef.current !== documentId) return;
    if (previousExternalScale.current === scale) return;
    previousExternalScale.current = scale;
    if (!Number.isFinite(scale) || scale <= 0) return;
    if (Math.abs(zoomState.currentZoomLevel - scale) < 0.001) return;
    zoom.requestZoom(scale);
  }, [documentId, scale, scrollState.totalPages, zoom, zoomState.currentZoomLevel]);

  useEffect(() => {
    if (initializedZoomDocumentRef.current !== documentId) return;
    const next = zoomState.currentZoomLevel;
    if (Number.isFinite(next) && next > 0 && Math.abs(next - scale) >= 0.001) {
      onViewerScaleChange?.(next);
    }
  }, [documentId, onViewerScaleChange, scale, zoomState.currentZoomLevel]);

  return (
    <>
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
    <div className="native-edit-zoom-tools" role="group" aria-label="PDF editor zoom controls">
      <button type="button" data-opdf-action="edit-zoom-out" aria-label="Zoom out in PDF editor" onClick={() => zoom?.zoomOut()}>−</button>
      <output aria-label="PDF editor zoom level">{Math.round(zoomState.currentZoomLevel * 100)}%</output>
      <button type="button" data-opdf-action="edit-zoom-in" aria-label="Zoom in PDF editor" onClick={() => zoom?.zoomIn()}>+</button>
      <button type="button" data-opdf-action="edit-fit-width" onClick={() => zoom?.requestZoom(ZoomMode.FitWidth)}>Fit width</button>
      <button type="button" data-opdf-action="edit-fit-page" onClick={() => zoom?.requestZoom(ZoomMode.FitPage)}>Fit page</button>
    </div>
    </>
  );
}
