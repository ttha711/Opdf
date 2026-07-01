import { useDeferredValue, useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { type PageDimension, type PdfViewerProps, type RenderedPage, type ViewMode } from "./PdfViewer.types";
import { usePdfDataLoader, useThumbnailRefresh } from "./PdfViewer.hooks";
import { PdfPageStage, PdfViewerEmpty } from "./PdfViewer.parts";
import { usePageRendering } from "./usePageRendering";
import { usePageLayout } from "./usePageLayout";

GlobalWorkerOptions.workerSrc = workerSrc;

export function PdfViewer({
  transitionTick = 0,
  transitionDirection = "next",
  data,
  page,
  scale,
  rotation = 0,
  viewMode = "continuous",
  annotations = [],
  highlightMode = false,
  searchText,
  activeTool = "select",
  annotationToolDefaults = {
    highlight: { color: "#facc15", opacity: 0.4, size: 2 },
    note: { color: "#fff8d6", opacity: 1, size: 16 },
    shape: { color: "#ef4444", opacity: 1, size: 2 },
    redact: { color: "#000000", opacity: 0.85, size: 2 },
  },
  onPageToolAction,
  shapeMode = false,
  redactMode = false,
  measureMode = false,
  onDocumentLoaded,
  onSearchResult,
  onError,
  onActivePageChange,
  onThumbsLoaded,
  setThumbnails,
  initialThumbnails,
  onAnnotationUpdated,
  onAnnotationDeleted,
  onPatchApplied,
  createToolAnnotation,
  pageRotations = {},
  selectedPages,
  onPageSelectionClick,
}: PdfViewerProps & { pageRotations?: Record<number, number>; createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void> }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [visiblePageNums, setVisiblePageNums] = useState<Set<number>>(() => new Set());
  const renderScale = useDeferredValue(scale);
  const renderedPagesRef = useRef<RenderedPage[]>([]);
  const lastParamsRef = useRef<{ pdf: PDFDocumentProxy | null; scale: number; rotation: number; pageRotations?: Record<number, number>; viewMode: ViewMode }>({ pdf: null, scale, rotation, pageRotations, viewMode });
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const programmingScrollRef = useRef(false);
  const renderedUrlsRef = useRef<string[]>([]);
  const thumbnailUrlsRef = useRef<string[]>([]);
  const onDocumentLoadedRef = useRef(onDocumentLoaded);
  const onErrorRef = useRef(onError);
  const onThumbsLoadedRef = useRef(onThumbsLoaded);
  const onSearchResultRef = useRef(onSearchResult);

  useEffect(() => {
    onDocumentLoadedRef.current = onDocumentLoaded;
    onErrorRef.current = onError;
    onThumbsLoadedRef.current = onThumbsLoaded;
    onSearchResultRef.current = onSearchResult;
  }, [onDocumentLoaded, onError, onThumbsLoaded, onSearchResult]);

  // Fast dimension fetch for ALL pages — shows full document layout immediately
  const pageLayout = usePageLayout({ pdf, scale: renderScale, rotation, pageRotations });

  usePdfDataLoader({
    data,
    annotations,
    initialThumbnails,
    onThumbsLoaded,
    onDocumentLoadedRef,
    onErrorRef,
    onThumbsLoadedRef,
    thumbnailUrlsRef,
    renderedPagesRef,
    renderedUrlsRef,
    setPdf,
    setRenderedPages,
  });

  usePageRendering({
    pdf,
    page,
    scale: renderScale,
    rotation,
    pageRotations,
    searchText,
    viewMode,
    visiblePages: visiblePageNums,
    setRenderedPages,
    renderedPagesRef,
    renderedUrlsRef,
    lastParamsRef,
    onSearchResultRef,
  });

  // Clean up PDF Document memory when pdf object changes or component unmounts
  useEffect(
    () => () => {
      pdf?.destroy();
    },
    [pdf]
  );

  // Clean up Blob URLs ONLY when the viewer is completely unmounted
  useEffect(
    () => () => {
      renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      renderedUrlsRef.current = [];
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
    },
    []
  );

  useThumbnailRefresh({ pdf, annotations, page, initialThumbnails, setThumbnails });

  // IntersectionObserver: track which pages are in/near the viewport and render only those
  useEffect(() => {
    if (viewMode !== "continuous") return;
    if (pageLayout.length === 0) return;

    const scrollContainer = scrollSentinelRef.current?.closest(".viewer-area");
    const root = scrollContainer instanceof HTMLElement ? scrollContainer : null;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePageNums((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const pageNum = parseInt((entry.target as HTMLElement).dataset.page ?? "0");
            if (!pageNum) continue;
            if (entry.isIntersecting) {
              if (!next.has(pageNum)) { next.add(pageNum); changed = true; }
            } else {
              if (next.has(pageNum)) { next.delete(pageNum); changed = true; }
            }
          }
          return changed ? next : prev;
        });
      },
      { root, rootMargin: "600px 0px", threshold: 0 }
    );

    // Observe all placeholder/page elements that are currently in the DOM
    pageElementsRef.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [viewMode, pageLayout]);

  // Sync active page indicator while scrolling in continuous mode
  useEffect(() => {
    if (viewMode !== "continuous") return;
    if (pageLayout.length === 0) return;
    if (!onActivePageChange) return;

    const scrollContainer = scrollSentinelRef.current?.closest(".viewer-area");
    if (!(scrollContainer instanceof HTMLElement)) return;

    let frameId = 0;

    const syncActivePage = () => {
      frameId = 0;
      if (document.body.dataset.opdfSelecting === "1") return;
      if (programmingScrollRef.current) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      let nearestPage = page;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const [pageNumber, element] of pageElementsRef.current.entries()) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;

        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - containerCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPage = pageNumber;
        }
      }

      if (nearestPage !== page) {
        onActivePageChange(nearestPage);
      }
    };

    const scheduleSync = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(syncActivePage);
    };

    scrollContainer.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    scheduleSync();

    return () => {
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      scrollContainer.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [onActivePageChange, page, pageLayout.length, viewMode]);

  // Scroll to target page — works immediately in continuous (placeholder in DOM) and after render in page mode
  useEffect(() => {
    if (viewMode !== "continuous") return;
    if (document.body.dataset.opdfSelecting === "1") return;
    
    // Lock syncActivePage synchronously to prevent the active page from being reset
    // by scroll events fired before our scrollToPage runs in the next animation frame.
    programmingScrollRef.current = true;
    
    let frameId = 0;
    let lockTimeout = 0;
    let attempts = 0;
    const scrollToPage = () => {
      attempts += 1;
      const target = pageElementsRef.current.get(page);
      const scrollContainer = target?.closest(".viewer-area");
      if (target && scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 12;
        // Lock syncActivePage for the duration of the smooth scroll (~500ms)
        programmingScrollRef.current = true;
        window.clearTimeout(lockTimeout);
        lockTimeout = window.setTimeout(() => { programmingScrollRef.current = false; }, 600);
        scrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        return;
      }
      if (attempts < 8) {
        frameId = window.requestAnimationFrame(scrollToPage);
      } else {
        programmingScrollRef.current = false;
      }
    };
    frameId = window.requestAnimationFrame(scrollToPage);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(lockTimeout);
      programmingScrollRef.current = false;
    };
  }, [page, viewMode, pageLayout.length]);

  const renderedPageMap = new Map(renderedPages.map((p) => [p.pageNumber, p]));

  const isEmpty = pageLayout.length === 0 && renderedPages.length === 0;

  return (
    <div className="viewer-shell">
      {isEmpty ? (
        <PdfViewerEmpty />
      ) : (
        <div className={`doc-column ${viewMode === "page" ? "single" : "continuous"}`} key={transitionTick}>
          {viewMode === "continuous"
            ? pageLayout.map((dim) => (
                <PdfPageStage
                  key={`${dim.pageNumber}-${transitionDirection}-${viewMode}`}
                  dimension={dim}
                  pageData={renderedPageMap.get(dim.pageNumber)}
                  isSelected={selectedPages?.has(dim.pageNumber) ?? false}
                  targetScale={scale}
                  targetRotation={dim.rotation}
                  transitionDirection={transitionDirection}
                  viewMode={viewMode}
                  highlightMode={highlightMode}
                  shapeMode={shapeMode}
                  redactMode={redactMode}
                  measureMode={measureMode}
                  activeTool={activeTool}
                  annotationToolDefaults={annotationToolDefaults}
                  annotations={annotations}
                  pageElementsRef={pageElementsRef}
                  onActivePageChange={onActivePageChange}
                  onPageToolAction={onPageToolAction}
                  onAnnotationUpdated={onAnnotationUpdated}
                  onAnnotationDeleted={onAnnotationDeleted}
                  onPatchApplied={onPatchApplied}
                  createToolAnnotation={createToolAnnotation}
                  onPageSelectionClick={onPageSelectionClick}
                />
              ))
            : renderedPages.map((p) => (
                <PdfPageStage
                  key={`${p.pageNumber}-${transitionDirection}-${viewMode}`}
                  dimension={{ pageNumber: p.pageNumber, cssWidth: p.width, cssHeight: p.height, rotation: p.rotation }}
                  pageData={p}
                  isSelected={selectedPages?.has(p.pageNumber) ?? false}
                  targetScale={scale}
                  targetRotation={p.rotation}
                  transitionDirection={transitionDirection}
                  viewMode={viewMode}
                  highlightMode={highlightMode}
                  shapeMode={shapeMode}
                  redactMode={redactMode}
                  measureMode={measureMode}
                  activeTool={activeTool}
                  annotationToolDefaults={annotationToolDefaults}
                  annotations={annotations}
                  pageElementsRef={pageElementsRef}
                  onActivePageChange={onActivePageChange}
                  onPageToolAction={onPageToolAction}
                  onAnnotationUpdated={onAnnotationUpdated}
                  onAnnotationDeleted={onAnnotationDeleted}
                  onPatchApplied={onPatchApplied}
                  createToolAnnotation={createToolAnnotation}
                  onPageSelectionClick={onPageSelectionClick}
                />
              ))}
          {viewMode === "continuous" ? <div ref={scrollSentinelRef} style={{ height: "1px" }} aria-hidden="true" /> : null}
        </div>
      )}
    </div>
  );
}
