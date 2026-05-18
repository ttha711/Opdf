import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import type { Annotation } from "@opdf/core";
import { canvasToBlob, drawAnnotationsToCanvas } from "./PdfViewer.utils";
import { CONTINUOUS_BATCH_SIZE, WINDOW_RADIUS, type RenderedPage, type ViewMode } from "./PdfViewer.types";

const THUMBNAIL_CSS_WIDTH = 188;
const THUMBNAIL_MAX_DEVICE_SCALE = 2;
const THUMBNAIL_JPEG_QUALITY = 0.72;

function getThumbnailScale(pageWidth: number) {
  const deviceScale = Math.min(window.devicePixelRatio || 1, THUMBNAIL_MAX_DEVICE_SCALE);
  return Math.max(0.1, (THUMBNAIL_CSS_WIDTH * deviceScale) / Math.max(1, pageWidth));
}

export function usePdfDataLoader(params: {
  data: Uint8Array | null;
  annotations: Annotation[];
  initialThumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  onThumbsLoaded?: (thumbs: Array<{ page: number; url: string; blob: Blob }>) => void;
  onDocumentLoadedRef: MutableRefObject<((pages: number) => void) | undefined>;
  onErrorRef: MutableRefObject<((message: string | null) => void) | undefined>;
  onThumbsLoadedRef: MutableRefObject<((thumbs: Array<{ page: number; url: string; blob: Blob }>) => void) | undefined>;
  thumbnailUrlsRef: MutableRefObject<string[]>;
  renderedPagesRef: MutableRefObject<RenderedPage[]>;
  renderedUrlsRef: MutableRefObject<string[]>;
  setPdf: Dispatch<SetStateAction<PDFDocumentProxy | null>>;
  setRenderedPages: Dispatch<SetStateAction<RenderedPage[]>>;
  setContinuousLoadedUntil: Dispatch<SetStateAction<number>>;
}) {
  const { data, annotations, initialThumbnails, onThumbsLoaded, onDocumentLoadedRef, onErrorRef, onThumbsLoadedRef, thumbnailUrlsRef, renderedPagesRef, renderedUrlsRef, setPdf, setRenderedPages, setContinuousLoadedUntil } = params;

  useEffect(() => {
    if (!data) {
      renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      renderedUrlsRef.current = [];
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
      setPdf(null);
      renderedPagesRef.current = [];
      setRenderedPages([]);
      setContinuousLoadedUntil(0);
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
        if (cancelled) return void nextPdf.destroy();

        setPdf((prev) => {
          prev?.destroy();
          return nextPdf;
        });
        renderedPagesRef.current = [];
        setRenderedPages([]);
        setContinuousLoadedUntil(Math.min(CONTINUOUS_BATCH_SIZE, nextPdf.numPages));
        onDocumentLoadedRef.current?.(nextPdf.numPages);
        onErrorRef.current?.(null);

        thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        thumbnailUrlsRef.current = [];

        if (initialThumbnails && initialThumbnails.length > 0) {
          onThumbsLoadedRef.current?.(initialThumbnails);
          initialThumbnails.forEach((t) => thumbnailUrlsRef.current.push(t.url));
          return;
        }

        const thumbCount = Math.min(nextPdf.numPages, 40);
        const thumbs: Array<{ page: number; url: string; blob: Blob }> = [];
        for (let i = 1; i <= thumbCount; i += 1) {
          if (cancelled) break;
          const p = await nextPdf.getPage(i);
          const baseViewport = p.getViewport({ scale: 1 });
          const vp = p.getViewport({ scale: getThumbnailScale(baseViewport.width) });
          const c = document.createElement("canvas");
          const ctx = c.getContext("2d");
          if (!ctx) continue;
          c.width = Math.max(1, Math.floor(vp.width));
          c.height = Math.max(1, Math.floor(vp.height));
          await p.render({ canvasContext: ctx, viewport: vp }).promise;
          drawAnnotationsToCanvas(ctx, annotations, i, c.width, c.height);
          const blob = await canvasToBlob(c, "image/jpeg", THUMBNAIL_JPEG_QUALITY);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          thumbnailUrlsRef.current.push(url);
          thumbs.push({ page: i, url, blob });
          p.cleanup();
        }
        if (!cancelled) onThumbsLoadedRef.current?.(thumbs);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load PDF";
        onDocumentLoadedRef.current?.(0);
        onErrorRef.current?.(message);
        setPdf(null);
        renderedPagesRef.current = [];
        setRenderedPages([]);
      }
    })();

    return () => {
      cancelled = true;
      if (!loadingResolved) loadingTask.destroy();
    };
  }, [data]);
}

export function useContinuousLoading(params: {
  pdf: PDFDocumentProxy | null;
  page: number;
  viewMode: ViewMode;
  renderedPagesLength: number;
  continuousLoadedUntil: number;
  setContinuousLoadedUntil: Dispatch<SetStateAction<number>>;
  loadMoreRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const { pdf, page, viewMode, renderedPagesLength, continuousLoadedUntil, setContinuousLoadedUntil, loadMoreRef } = params;

  useEffect(() => {
    if (!pdf) return void setContinuousLoadedUntil(0);
    if (viewMode !== "continuous") return;
    setContinuousLoadedUntil((prev) => (prev >= pdf.numPages ? prev : Math.max(Math.min(page + WINDOW_RADIUS, pdf.numPages), Math.min(CONTINUOUS_BATCH_SIZE, pdf.numPages))));
  }, [pdf, viewMode, page]);

  useEffect(() => {
    if (viewMode !== "continuous" || !pdf || continuousLoadedUntil >= pdf.numPages) return;
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
  }, [viewMode, pdf, renderedPagesLength, continuousLoadedUntil]);
}

export function useThumbnailRefresh(params: {
  pdf: PDFDocumentProxy | null;
  annotations: Annotation[];
  page: number;
  initialThumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  onThumbsLoaded?: (thumbs: Array<{ page: number; url: string; blob: Blob }>) => void;
}) {
  const { pdf, annotations, page, initialThumbnails, onThumbsLoaded } = params;

  useEffect(() => {
    if (!pdf || !onThumbsLoaded) return;
    const timeout = setTimeout(async () => {
      try {
        const p = await pdf.getPage(page);
        const baseViewport = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: getThumbnailScale(baseViewport.width) });
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        if (!ctx) return;
        c.width = Math.max(1, Math.floor(vp.width));
        c.height = Math.max(1, Math.floor(vp.height));
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        drawAnnotationsToCanvas(ctx, annotations, page, c.width, c.height);
        const blob = await canvasToBlob(c, "image/jpeg", THUMBNAIL_JPEG_QUALITY);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const nextThumbs = (initialThumbnails || []).map((t) => {
          if (t.page === page) {
            URL.revokeObjectURL(t.url);
            return { page, url, blob };
          }
          return t;
        });
        onThumbsLoaded(nextThumbs);
        p.cleanup();
      } catch {
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [annotations.length, page, pdf]);
}
