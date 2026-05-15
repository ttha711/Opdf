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
  activeTool?: string;
  onPageToolAction?: (page: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
  shapeMode?: boolean;
  redactMode?: boolean;
  measureMode?: boolean;
  onDocumentLoaded?: (pages: number) => void;
  onSearchResult?: (found: boolean, message: string) => void;
  onError?: (message: string | null) => void;
  onActivePageChange?: (page: number) => void;
  onThumbsLoaded?: (thumbs: Array<{ page: number; url: string; blob: Blob }>) => void;
  initialThumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
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
  const lastParamsRef = useRef({ pdf: null as PDFDocumentProxy | null, scale, rotation, viewMode });
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

        if (initialThumbnails && initialThumbnails.length > 0) {
          onThumbsLoadedRef.current?.(initialThumbnails);
          // Still register them for cleanup
          initialThumbnails.forEach(t => thumbnailUrlsRef.current.push(t.url));
        } else {
          const thumbCount = Math.min(nextPdf.numPages, 40);
          const thumbs: Array<{ page: number; url: string; blob: Blob }> = [];
          for (let i = 1; i <= thumbCount; i += 1) {
            if (cancelled) break;
            const p = await nextPdf.getPage(i);
            const vp = p.getViewport({ scale: 0.1 });
            const c = document.createElement("canvas");
            const ctx = c.getContext("2d");
            if (!ctx) continue;
            c.width = Math.max(1, Math.floor(vp.width));
            c.height = Math.max(1, Math.floor(vp.height));
            const renderTask = p.render({ canvasContext: ctx, viewport: vp });
            await renderTask.promise;
            
            // Draw annotations on thumbnail
            drawAnnotationsToCanvas(ctx, annotations, i, c.width, c.height);

            const blob = await canvasToBlob(c, "image/jpeg", 0.4);
            if (!blob) continue;
            const url = URL.createObjectURL(blob);
            thumbnailUrlsRef.current.push(url);
            thumbs.push({ page: i, url, blob });
            p.cleanup();
          }
          if (!cancelled) onThumbsLoadedRef.current?.(thumbs);
        }
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
      const paramsChanged = 
        lastParamsRef.current.pdf !== pdf || 
        lastParamsRef.current.scale !== scale || 
        lastParamsRef.current.rotation !== rotation || 
        lastParamsRef.current.viewMode !== viewMode;

      if (paramsChanged) {
        // Revoke all previous URLs and clear the rendered state
        renderedPagesRef.current.forEach((p) => URL.revokeObjectURL(p.imageUrl));
        renderedPagesRef.current = [];
        setRenderedPages([]);
        lastParamsRef.current = { pdf, scale, rotation, viewMode };
      }

      const targetPages: number[] = [];
      if (viewMode === "continuous") {
        const endPage = Math.max(1, Math.min(pdf.numPages, continuousLoadedUntil || Math.min(CONTINUOUS_BATCH_SIZE, pdf.numPages)));
        for (let i = 1; i <= endPage; i += 1) {
          targetPages.push(i);
        }
      } else {
        targetPages.push(Math.min(Math.max(1, page), pdf.numPages));
      }

      // Find page numbers not yet rendered in our current set
      const renderedPageNums = new Set(renderedPagesRef.current.map(p => p.pageNumber));
      const pagesToRender = targetPages.filter(pNum => !renderedPageNums.has(pNum));

      if (pagesToRender.length === 0) {
        // Everything is already rendered, just handle search if applicable
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
        return;
      }

      const newlyRendered: RenderedPage[] = [];
      for (const pNum of pagesToRender) {
        if (cancelled) break;
        const p = await pdf.getPage(pNum);
        const vp = p.getViewport({ scale, rotation });
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        if (!ctx) { p.cleanup(); continue; }
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
        newlyRendered.push({ pageNumber: pNum, width: vp.width, height: vp.height, imageUrl: url });
        p.cleanup();
      }

      if (!cancelled) {
        setRenderedPages(prev => {
          // Merge existing rendered pages with new ones and sort them by page number
          const combined = [...prev, ...newlyRendered].sort((a, b) => a.pageNumber - b.pageNumber);
          const next = viewMode === "continuous" ? combined : newlyRendered;
          renderedPagesRef.current = next;
          renderedUrlsRef.current = next.map((p) => p.imageUrl);
          return next;
        });
      } else {
        // Cleanup the newly generated URLs if execution was cancelled mid-flight
        newlyRendered.forEach((p) => URL.revokeObjectURL(p.imageUrl));
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

  // ── Update active page thumbnail when annotations change ──────────────
  useEffect(() => {
    if (!pdf || !onThumbsLoaded) return;
    const timeout = setTimeout(async () => {
      try {
        const pNum = page;
        const p = await pdf.getPage(pNum);
        const vp = p.getViewport({ scale: 0.1 });
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        if (!ctx) return;
        c.width = Math.max(1, Math.floor(vp.width));
        c.height = Math.max(1, Math.floor(vp.height));
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        
        drawAnnotationsToCanvas(ctx, annotations, pNum, c.width, c.height);
        
        const blob = await canvasToBlob(c, "image/jpeg", 0.4);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        
        // Update App state
        const nextThumbs = (initialThumbnails || []).map(t => {
          if (t.page === pNum) {
            URL.revokeObjectURL(t.url);
            return { page: pNum, url, blob };
          }
          return t;
        });
        onThumbsLoaded(nextThumbs);
        p.cleanup();
      } catch (e) {
        console.error("Failed to update thumbnail", e);
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [annotations.length, page, pdf]);

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
        <div className="empty-viewer">
          <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="10" y="4" width="36" height="48" rx="3"/>
            <path d="M34 4v14h12"/>
            <path d="M18 28h20M18 34h16M18 40h12"/>
          </svg>
          <p>Open a PDF to get started</p>
          <small>Use File → Open or drag &amp; drop a PDF file</small>
        </div>
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
                // FabricPage handles dragging for shape/highlight/redact/measure
                if (!shapeMode && !highlightMode && !redactMode && !measureMode) {
                  const pt = getNormalizedRect(event.currentTarget, event.clientX, event.clientY);
                  // Add a tiny jitter to prevent overlapping
                  const jitterX = (Math.random() - 0.5) * 0.02;
                  const jitterY = (Math.random() - 0.5) * 0.02;
                  // Forward the current tool kind (note / signature) for correct dispatch
                  onPageToolAction?.(p.pageNumber, activeTool, { 
                    x: Math.max(0, Math.min(1, pt.x + jitterX)), 
                    y: Math.max(0, Math.min(1, pt.y + jitterY)), 
                    width: 0.18, height: 0.08 
                  });
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
                measureMode={measureMode || false}
                onAnnotationCreated={(pageNum, kind, rect) => {
                  onPageToolAction?.(pageNum, kind, rect as any);
                }}
                onAnnotationUpdated={onAnnotationUpdated}
                onAnnotationDeleted={onAnnotationDeleted}
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

function drawAnnotationsToCanvas(ctx: CanvasRenderingContext2D, annotations: Annotation[], page: number, width: number, height: number) {
  const pageAnns = annotations.filter(a => a.page === page);
  for (const ann of pageAnns) {
    const payload = ann.payload as any;
    if (!payload) continue;
    
    const { x, y, width: w, height: h, color, stroke, opacity } = payload;
    const absX = (x || 0) * width;
    const absY = (y || 0) * height;
    const absW = (w || 0) * width;
    const absH = (h || 0) * height;

    ctx.save();
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
    
    if (ann.kind === "highlight") {
      ctx.fillStyle = color || "#facc15";
      ctx.globalAlpha = opacity !== undefined ? opacity : 0.4;
      ctx.fillRect(absX, absY, absW, absH);
    } else if (ann.kind === "shape") {
      ctx.strokeStyle = stroke || "#ef4444";
      ctx.lineWidth = Math.max(1, 2 * (width / 200)); // Scale line width
      ctx.strokeRect(absX, absY, absW, absH);
    } else if (ann.kind === "redact") {
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 1;
      ctx.fillRect(absX, absY, absW, absH);
    }
    ctx.restore();
  }
}
