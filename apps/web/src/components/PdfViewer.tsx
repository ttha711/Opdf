import { useEffect, useRef, useState } from "react";
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
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [continuousLoadedUntil, setContinuousLoadedUntil] = useState(0);
  const renderedPagesRef = useRef<RenderedPage[]>([]);
  const lastParamsRef = useRef<{ pdf: PDFDocumentProxy | null; scale: number; rotation: number; viewMode: ViewMode }>({ pdf: null, scale, rotation, viewMode });
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
    renderedUrlsRef,
    setPdf,
    setRenderedPages,
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
    scale,
    rotation,
    searchText,
    viewMode,
    continuousLoadedUntil,
    setRenderedPages,
    renderedPagesRef,
    renderedUrlsRef,
    lastParamsRef,
    onSearchResultRef,
  });

  useEffect(
    () => () => {
      renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      renderedUrlsRef.current = [];
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
      pdf?.destroy();
    },
    [pdf]
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
              transitionDirection={transitionDirection}
              viewMode={viewMode}
              highlightMode={highlightMode}
              shapeMode={shapeMode}
              redactMode={redactMode}
              measureMode={measureMode}
              activeTool={activeTool}
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
