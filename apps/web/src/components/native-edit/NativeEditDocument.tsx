import { useEffect, useRef, useState } from "react";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
  registerViewerControls,
} from "../../lib/viewer-runtime";
import {
  consumeNativeEditViewportAnchor, peekNativeEditScrollMemory, setNativeEditScrollMemory,
} from "../../lib/nativeEditRuntime";
import { NativeEditPageOverlay } from "./NativeEditPageOverlay";
import { NativeEditPageRaster } from "./NativeEditPageRaster";
import type { NativeEditPinnedPoints } from "./NativeEditSelectionLayer";

type Props = {
  documentId: string;
  page: number;
  scale: number;
  revisionKey: string;
  pinnedPointsRef: React.MutableRefObject<NativeEditPinnedPoints | null>;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  disableNativeRender?: boolean;
  remoteRenderBase?: string | null;
  onDocumentLoaded?: (pages: number) => void;
  onActivePageChange?: (page: number) => void;
  onViewerScaleChange?: (scale: number) => void;
};

function lastNativeViewport() {
  return [...document.querySelectorAll<HTMLElement>(".native-edit-viewport")].at(-1) ?? null;
}

/** True when the rendered page overlay is meaningfully inside its scroll viewport. */
function requestedPageIsInView(pageNumber: number) {
  const overlay = document.querySelector(`svg[data-tpdf-native-edit-page="${pageNumber}"]`);
  const viewport = overlay?.closest(".native-edit-viewport");
  if (!overlay || !viewport) return false;
  const page = overlay.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  return page.top < view.bottom - 40 && page.bottom > view.top + 40;
}

export function NativeEditDocument({
  documentId,
  page,
  scale,
  revisionKey,
  pinnedPointsRef,
  getDocumentBytes,
  remoteRenderBase = null,
  disableNativeRender = false,
  onDocumentLoaded,
  onActivePageChange,
  onViewerScaleChange,
}: Props) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  // Keep Automatic zoom during first layout. An early numeric request can
  // leave EmbedPDF 2.x waiting for a viewport layout and paint no page.
  const previousExternalScale = useRef(scale);
  // Zoom changes originate either in the viewer (Automatic fit) or in the
  // parent. Remember each direction so one side never echoes the other back.
  const reportedViewerScale = useRef<number | null>(null);
  const requestedExternalScale = useRef<number | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const lastExternalPageRef = useRef<{ documentId: string; page: number } | null>(null);
  // Viewer-reported pages are ignored until the requested page was applied once;
  // at mount EmbedPDF reports page 1 before it has scrolled anywhere.
  const externalPageAppliedRef = useRef(false);
  // The first layout re-measures pages (Automatic zoom) after the scroll to the
  // requested page, which moves currentPage. Until layout stays quiet, keep the
  // requested page pinned instead of treating those moves as user scrolling.
  const pageSettledRef = useRef(false);
  // The viewer starts in Automatic zoom (a numeric request before layout can
  // leave it blank). Keep the zoom the user had when the editor opened and
  // apply it once the first layout is quiet, instead of overwriting it with the
  // viewer's own fit zoom.
  const initialScaleRef = useRef(scale);
  const initialScaleHandledRef = useRef(false);
  const viewportRestoredRef = useRef(false);
  const [settleTick, setSettleTick] = useState(0);

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
      // An explicit navigation always wins over the initial-page pin.
      externalPageAppliedRef.current = true;
      pageSettledRef.current = true;
      scroll.scrollToPage({ pageNumber: destination, behavior: "instant" });
    },
  }), [scroll, zoom]);

  useEffect(() => {
    const total = scrollState.totalPages;
    if (total <= 0) return;
    // EmbedPDF can report a transient one-page layout before every page is
    // measured. The parent clamps the current page to this count, so reporting
    // it immediately would throw a user editing page N back to page 1.
    const settle = window.setTimeout(() => onDocumentLoaded?.(total), 120);
    return () => window.clearTimeout(settle);
  }, [onDocumentLoaded, scrollState.totalPages]);

  // A programmatic jump can report intermediate virtualized pages before
  // EmbedPDF reaches its destination. Do not feed those transient positions
  // back to the parent: that would issue another jump and oscillate forever.

  useEffect(() => {
    externalPageAppliedRef.current = false;
    pageSettledRef.current = false;
  }, [documentId]);

  useEffect(() => {
    // Wait until layout knows the requested page; a transient one-page layout
    // cannot be scrolled to page N and must not consume the request.
    if (!scroll || page < 1 || scrollState.totalPages <= 0 || page > scrollState.totalPages) return;
    // This effect can run when useScroll changes its scope identity while the
    // user is already navigating. A stale parent page must not snap the canvas
    // back to that page; only a genuinely new parent page request may scroll.
    if (lastExternalPageRef.current?.documentId === documentId &&
        lastExternalPageRef.current.page === page) return;
    lastExternalPageRef.current = { documentId, page };
    // A later parent page request supersedes the initial-page pin.
    if (externalPageAppliedRef.current) pageSettledRef.current = true;
    externalPageAppliedRef.current = true;
    if (page === scrollState.currentPage) {
      if (pendingPageRef.current === page) pendingPageRef.current = null;
      return;
    }
    pendingPageRef.current = page;
    scroll.scrollToPage({ pageNumber: page, behavior: "instant" });
  }, [documentId, page, scroll, scrollState.totalPages]);

  useEffect(() => {
    const viewport = lastNativeViewport();
    if (!viewport) return;
    // Remember where the user is so a revision swap or leaving the editor can resume there.
    const remember = () => {
      if (pageSettledRef.current) setNativeEditScrollMemory({ x: viewport.scrollLeft, y: viewport.scrollTop });
    };
    viewport.addEventListener("scroll", remember, { passive: true });
    return () => viewport.removeEventListener("scroll", remember);
  }, [documentId, scrollState.totalPages]);

  useEffect(() => {
    if (pageSettledRef.current || !externalPageAppliedRef.current) return;
    const quiet = window.setTimeout(() => {
      if (!initialScaleHandledRef.current) {
        initialScaleHandledRef.current = true;
        const wanted = initialScaleRef.current;
        if (zoom && Number.isFinite(wanted) && wanted > 0 &&
            Math.abs(zoomState.currentZoomLevel - wanted) >= 0.001) {
          previousExternalScale.current = wanted;
          requestedExternalScale.current = Math.min(5, Math.max(0.05, wanted));
          zoom.requestZoom(wanted);
        }
        // Wait for the relayout this causes before releasing the page pin.
        setSettleTick((tick) => tick + 1);
        return;
      }
      if (!viewportRestoredRef.current) {
        viewportRestoredRef.current = true;
        const viewport = lastNativeViewport();
        const anchor = consumeNativeEditViewportAnchor();
        const overlay = anchor
          ? document.querySelector(`svg[data-tpdf-native-edit-page="${anchor.pageIndex + 1}"]`) : null;
        const remembered = peekNativeEditScrollMemory();
        if (viewport && anchor && overlay) {
          // Double-click entry: put the clicked spot back under the pointer.
          const box = overlay.getBoundingClientRect();
          viewport.scrollTop += box.top + anchor.pageY * box.height - anchor.screenY;
          setSettleTick((tick) => tick + 1);
          return;
        }
        if (viewport && remembered) {
          // Button entry or revision swap: resume the offset the user was at.
          viewport.scrollTop = remembered.y;
          viewport.scrollLeft = remembered.x;
          setSettleTick((tick) => tick + 1);
          return;
        }
      }
      pageSettledRef.current = true;
      const settledViewport = lastNativeViewport();
      if (settledViewport) {
        // Record the position actually reached (anchor/zoom restore may have moved it).
        setNativeEditScrollMemory({ x: settledViewport.scrollLeft, y: settledViewport.scrollTop });
        settledViewport.setAttribute("data-tpdf-viewport-settled", "true");
      }
    }, 400);
    return () => window.clearTimeout(quiet);
  }, [documentId, scrollState.currentPage, scrollState.totalPages, zoomState.currentZoomLevel, settleTick, zoom]);

  useEffect(() => {
    if (!scroll || pageSettledRef.current || !externalPageAppliedRef.current) return;
    if (page < 1 || page > scrollState.totalPages) return;
    // scrollToPage can be dropped while EmbedPDF is still measuring pages, and
    // its reported currentPage can then claim a position the DOM never reached.
    // Verify against the rendered page and retry for a bounded time.
    let attempts = 0;
    const pin = () => {
      if (pageSettledRef.current || requestedPageIsInView(page)) return;
      if (attempts++ >= 30) {
        pendingPageRef.current = null;
        pageSettledRef.current = true;
        return;
      }
      pendingPageRef.current = page;
      scroll.scrollToPage({ pageNumber: page, behavior: "instant" });
    };
    pin();
    const retry = window.setInterval(pin, 100);
    return () => window.clearInterval(retry);
  }, [page, scroll, scrollState.currentPage, scrollState.totalPages, zoomState.currentZoomLevel]);

  useEffect(() => {
    const current = scrollState.currentPage;
    if (current <= 0 || scrollState.totalPages <= 0 || !externalPageAppliedRef.current ||
        !pageSettledRef.current) return;
    const pending = pendingPageRef.current;
    if (pending !== null) {
      if (current !== pending) return;
      pendingPageRef.current = null;
    }
    if (current !== page) onActivePageChange?.(current);
  }, [onActivePageChange, page, scrollState.currentPage, scrollState.totalPages]);

  useEffect(() => {
    // Only apply actual external zoom changes after the initial document layout.
    // Zoom changes reported by the viewer already match currentZoomLevel.
    if (!zoom || !scrollState.totalPages) return;
    if (previousExternalScale.current === scale) return;
    previousExternalScale.current = scale;
    if (!Number.isFinite(scale) || scale <= 0) return;
    // The parent merely echoed the zoom this viewer reported: not a request.
    if (reportedViewerScale.current !== null &&
        Math.abs(reportedViewerScale.current - scale) < 0.001) return;
    if (Math.abs(zoomState.currentZoomLevel - scale) < 0.001) return;
    requestedExternalScale.current = Math.min(5, Math.max(0.05, scale));
    zoom.requestZoom(scale);
  }, [scale, scrollState.totalPages, zoom, zoomState.currentZoomLevel]);

  useEffect(() => {
    if (!initialScaleHandledRef.current) return;
    const next = zoomState.currentZoomLevel;
    const requested = requestedExternalScale.current;
    if (requested !== null) {
      // Do not report interim zoom levels while a parent request is applying;
      // that would overwrite the request and make the two sides oscillate.
      if (Math.abs(next - requested) >= 0.001) return;
      requestedExternalScale.current = null;
    }
    if (Number.isFinite(next) && next > 0 && Math.abs(next - scale) >= 0.001) {
      reportedViewerScale.current = next;
      onViewerScaleChange?.(next);
    }
  }, [onViewerScaleChange, scale, zoomState.currentZoomLevel]);

  return (
    <Viewport documentId={documentId} className="native-edit-viewport">
      <Scroller
        documentId={documentId}
        renderPage={({ width, height, pageIndex }) => (
          <div className="native-edit-page" style={{ width, height }}>
            <NativeEditPageRaster documentId={documentId} pageIndex={pageIndex}
              revisionKey={revisionKey} enabled={pageIndex + 1 === page}
              width={width} height={height} previewBase={remoteRenderBase} disableNativeRender={disableNativeRender}
              getDocumentBytes={getDocumentBytes} />
            <NativeEditPageOverlay
              pageIndex={pageIndex}
              enabled={pageIndex + 1 === page}
              width={width}
              height={height}
              revisionKey={revisionKey}
              pinnedPointsRef={pinnedPointsRef}
              getDocumentBytes={getDocumentBytes}
            />
          </div>
        )}
      />
    </Viewport>
  );
}
