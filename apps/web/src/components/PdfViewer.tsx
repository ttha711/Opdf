import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import type { Annotation } from "@opdf/core";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FabricPage } from "./FabricPage";

GlobalWorkerOptions.workerSrc = workerSrc;

type ViewMode = "continuous" | "page";

interface PdfViewerProps {
  transitionTick?: number;
  transitionDirection?: "next" | "prev";
  data: Uint8Array | null;
  page: number;
  scale: number;
  rotation?: number;
  viewMode?: ViewMode;
  annotations?: Annotation[];
  highlightMode?: boolean;
  searchText?: string;
  onPageToolAction?: (page: number, rect: { x: number; y: number; width: number; height: number }) => void;
  shapeMode?: boolean;
  redactMode?: boolean;
  onDocumentLoaded?: (pages: number) => void;
  onSearchResult?: (found: boolean, message: string) => void;
  onError?: (message: string | null) => void;
  onActivePageChange?: (page: number) => void;
  onThumbsLoaded?: (thumbs: Array<{ page: number; url: string }>) => void;
}

interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  imageUrl: string;
}

const WINDOW_RADIUS = 2;
const CONTINUOUS_BATCH_SIZE = 4;

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
  onPageToolAction,
  shapeMode = false,
  redactMode = false,
  onDocumentLoaded,
  onSearchResult,
  onError,
  onActivePageChange,
  onThumbsLoaded,
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [continuousLoadedUntil, setContinuousLoadedUntil] = useState(0);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const renderedUrlsRef = useRef<string[]>([]);
  const thumbnailUrlsRef = useRef<string[]>([]);
  const onDocumentLoadedRef = useRef(onDocumentLoaded);
  const onErrorRef = useRef(onError);
  const onThumbsLoadedRef = useRef(onThumbsLoaded);
  const onSearchResultRef = useRef(onSearchResult);
  const [draftRect, setDraftRect] = useState<{ page: number; x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    onDocumentLoadedRef.current = onDocumentLoaded;
    onErrorRef.current = onError;
    onThumbsLoadedRef.current = onThumbsLoaded;
    onSearchResultRef.current = onSearchResult;
  }, [onDocumentLoaded, onError, onThumbsLoaded, onSearchResult]);

  useEffect(() => {
    if (!data) {
      renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      renderedUrlsRef.current = [];
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
      setPdf(null);
      setRenderedPages([]);
      onThumbsLoaded?.([]);
      return;
    }

    let cancelled = false;
    let loadingResolved = false;
    const loadingTask = getDocument({ data: data.slice() });

    (async () => {
      try {
        const nextPdf = await loadingTask.promise;
        loadingResolved = true;
        if (cancelled) {
          nextPdf.destroy();
          return;
        }
        setPdf((prev) => {
          prev?.destroy();
          return nextPdf;
        });
        onDocumentLoadedRef.current?.(nextPdf.numPages);
        onErrorRef.current?.(null);

        thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        thumbnailUrlsRef.current = [];
        const thumbCount = Math.min(nextPdf.numPages, 40);
        const thumbs: Array<{ page: number; url: string }> = [];
        for (let i = 1; i <= thumbCount; i += 1) {
          if (cancelled) break;
          const p = await nextPdf.getPage(i);
          const vp = p.getViewport({ scale: 0.2 });
          const c = document.createElement("canvas");
          const ctx = c.getContext("2d");
          if (!ctx) continue;
          c.width = Math.max(1, Math.floor(vp.width));
          c.height = Math.max(1, Math.floor(vp.height));
          const renderTask = p.render({ canvasContext: ctx, viewport: vp });
          await renderTask.promise;
          const blob = await canvasToBlob(c, "image/jpeg", 0.7);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          thumbnailUrlsRef.current.push(url);
          thumbs.push({ page: i, url });
          p.cleanup();
        }
        if (!cancelled) onThumbsLoadedRef.current?.(thumbs);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load PDF";
        onDocumentLoadedRef.current?.(0);
        onErrorRef.current?.(message);
        setPdf(null);
        setRenderedPages([]);
      }
    })();

    return () => {
      cancelled = true;
      if (!loadingResolved) loadingTask.destroy();
    };
  }, [data]);

  useEffect(() => {
    if (!pdf) {
      setContinuousLoadedUntil(0);
      return;
    }
    if (viewMode !== "continuous") return;
    setContinuousLoadedUntil((prev) => {
      if (prev >= pdf.numPages) return prev;
      return Math.max(Math.min(page + WINDOW_RADIUS, pdf.numPages), Math.min(CONTINUOUS_BATCH_SIZE, pdf.numPages));
    });
  }, [pdf, viewMode, page]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    if (!pdf || continuousLoadedUntil >= pdf.numPages) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const scrollRoot = sentinel.closest(".viewer-area");
    const root = scrollRoot instanceof HTMLElement ? scrollRoot : null;
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;
        setContinuousLoadedUntil((prev) => Math.min(pdf.numPages, prev + CONTINUOUS_BATCH_SIZE));
      },
      { root, rootMargin: "300px 0px", threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, pdf, renderedPages.length, continuousLoadedUntil]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const activeRenderTasks: Array<{ cancel: () => void }> = [];

    (async () => {
      const pagesToRender: number[] = [];
      if (viewMode === "continuous") {
        const endPage = Math.max(1, Math.min(pdf.numPages, continuousLoadedUntil || Math.min(CONTINUOUS_BATCH_SIZE, pdf.numPages)));
        for (let i = 1; i <= endPage; i += 1) {
          pagesToRender.push(i);
        }
      } else {
        pagesToRender.push(Math.min(Math.max(1, page), pdf.numPages));
      }

      const next: RenderedPage[] = [];
      for (const pNum of pagesToRender) {
        const p = await pdf.getPage(pNum);
        const vp = p.getViewport({ scale, rotation });
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        const renderTask = p.render({ canvasContext: ctx, viewport: vp });
        activeRenderTasks.push(renderTask);
        try {
          await renderTask.promise;
        } catch (error) {
          p.cleanup();
          if (isRenderingCancelled(error)) return;
          throw error;
        }
        if (cancelled) {
          p.cleanup();
          return;
        }
        const blob = await canvasToBlob(c, "image/jpeg", 0.85);
        if (!blob) {
          p.cleanup();
          continue;
        }
        const url = URL.createObjectURL(blob);
        next.push({ pageNumber: pNum, width: vp.width, height: vp.height, imageUrl: url });
        p.cleanup();
      }

      if (!cancelled) {
        renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        renderedUrlsRef.current = next.map((p) => p.imageUrl);
        setRenderedPages(next);
      } else {
        next.forEach((p) => URL.revokeObjectURL(p.imageUrl));
      }

      if (searchText && searchText.trim().length > 0) {
        const safePage = Math.min(Math.max(1, page), pdf.numPages);
        const searchPage = await pdf.getPage(safePage);
        const content = await searchPage.getTextContent();
        const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").toLowerCase();
        const query = searchText.toLowerCase();
        onSearchResultRef.current?.(pageText.includes(query), `"${searchText}" on page ${safePage}`);
      } else {
        onSearchResultRef.current?.(false, "enter text to search");
      }
    })();

    return () => {
      cancelled = true;
      activeRenderTasks.forEach((task) => task.cancel());
    };
  }, [pdf, page, scale, rotation, searchText, viewMode, continuousLoadedUntil]);

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
        <p className="empty-viewer">Open a PDF to start</p>
      ) : (
        <div className={`doc-column ${viewMode === "page" ? "single" : "continuous"}`} key={transitionTick}>
          {renderedPages.map((p) => (
            <div
              key={`${p.pageNumber}-${transitionDirection}-${viewMode}`}
              data-page={p.pageNumber}
              ref={(el) => {
                if (el) pageElementsRef.current.set(p.pageNumber, el);
              }}
              className={`page-stage page-transition ${transitionDirection} ${highlightMode ? "highlight-mode" : ""} ${shapeMode ? "shape-mode" : ""} ${redactMode ? "redact-mode" : ""}`}
              style={{ width: `${p.width}px`, height: `${p.height}px` }}
              onClick={(event) => {
                onActivePageChange?.(p.pageNumber);
                // Allow clicking to place note/signature only if we are in those modes
                // FabricPage handles dragging for shape/highlight/redact
                if (!shapeMode && !highlightMode && !redactMode) {
                  const pt = getNormalizedRect(event.currentTarget, event.clientX, event.clientY);
                  onPageToolAction?.(p.pageNumber, { x: pt.x, y: pt.y, width: 0.18, height: 0.08 });
                }
              }}
            >
              <FabricPage
                pageNumber={p.pageNumber}
                width={p.width}
                height={p.height}
                imageUrl={p.imageUrl}
                annotations={annotations}
                highlightMode={highlightMode || false}
                shapeMode={shapeMode || false}
                redactMode={redactMode || false}
                onAnnotationCreated={(pageNum, kind, rect) => {
                  onPageToolAction?.(pageNum, rect as any);
                }}
              />
            </div>
          ))}
          {viewMode === "continuous" ? <div ref={loadMoreRef} style={{ height: "1px" }} aria-hidden="true" /> : null}
        </div>
      )}
    </div>
  );
}
function getNormalizedRect(container: HTMLDivElement, clientX: number, clientY: number) {
  const bounds = container.getBoundingClientRect();
  const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
  const y = Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1);
  return { x, y };
}

function normalizeUsableRect(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width < 0.005 ? 0 : rect.width,
    height: rect.height < 0.005 ? 0 : rect.height,
  };
}

function isRenderingCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
