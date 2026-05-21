import { useDeferredValue, useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { type PdfViewerProps, type RenderedPage, type ViewMode } from "./PdfViewer.types";
import { useContinuousLoading, usePdfDataLoader, useThumbnailRefresh } from "./PdfViewer.hooks";
import { PdfPageStage, PdfViewerEmpty } from "./PdfViewer.parts";
import { usePageRendering } from "./usePageRendering";

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
  initialThumbnails,
  onAnnotationUpdated,
  onAnnotationDeleted,
  pageRotations = {},
}: PdfViewerProps & { pageRotations?: Record<number, number> }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [continuousLoadedUntil, setContinuousLoadedUntil] = useState(0);
  const renderScale = useDeferredValue(scale);
  const renderedPagesRef = useRef<RenderedPage[]>([]);
  const lastParamsRef = useRef<{ pdf: PDFDocumentProxy | null; scale: number; rotation: number; pageRotations?: Record<number, number>; viewMode: ViewMode }>({ pdf: null, scale, rotation, pageRotations, viewMode });
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
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
    setContinuousLoadedUntil,
  });

  useContinuousLoading({
    pdf,
    page,
    viewMode,
    renderedPagesLength: renderedPages.length,
    continuousLoadedUntil,
    setContinuousLoadedUntil,
    loadMoreRef,
  });

  usePageRendering({
    pdf,
    page,
    scale: renderScale,
    rotation,
    pageRotations,
    searchText,
    viewMode,
    continuousLoadedUntil,
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

  useThumbnailRefresh({ pdf, annotations, page, initialThumbnails, onThumbsLoaded });

  useEffect(() => {
    if (viewMode !== "continuous") return;
    let frameId = 0;
    let attempts = 0;
    const scrollToPage = () => {
      attempts += 1;
      const target = pageElementsRef.current.get(page);
      const scrollContainer = target?.closest(".viewer-area");
      if (target && scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 12;
        scrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        return;
      }
      if (attempts < 8) frameId = window.requestAnimationFrame(scrollToPage);
    };
    frameId = window.requestAnimationFrame(scrollToPage);
    return () => window.cancelAnimationFrame(frameId);
  }, [page, viewMode, renderedPages]);

  return (
    <div className="viewer-shell">
      {renderedPages.length === 0 ? (
        <PdfViewerEmpty />
      ) : (
        <div className={`doc-column ${viewMode === "page" ? "single" : "continuous"}`} key={transitionTick}>
          {renderedPages.map((p) => (
            <PdfPageStage
              key={`${p.pageNumber}-${transitionDirection}-${viewMode}`}
              pageData={p}
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
            />
          ))}
          {viewMode === "continuous" ? <div ref={loadMoreRef} style={{ height: "1px" }} aria-hidden="true" /> : null}
        </div>
      )}
    </div>
  );
}
