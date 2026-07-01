import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import type { Annotation } from "@opdf/core";
import { canvasToBlob, drawAnnotationsToCanvas } from "./PdfViewer.utils";
import { type RenderedPage } from "./PdfViewer.types";

const THUMBNAIL_CSS_WIDTH = 188;
const THUMBNAIL_MAX_DEVICE_SCALE = 2;
const THUMBNAIL_JPEG_QUALITY = 0.72;

async function createFallbackThumbnail(pageNumber: number) {
  const fallbackCanvas = document.createElement("canvas");
  fallbackCanvas.width = 180;
  fallbackCanvas.height = 240;
  const context = fallbackCanvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
  context.strokeStyle = "#d1d5db";
  context.strokeRect(0.5, 0.5, fallbackCanvas.width - 1, fallbackCanvas.height - 1);

  context.fillStyle = "#6b7280";
  context.font = "600 18px Segoe UI, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`Page ${pageNumber}`, fallbackCanvas.width / 2, fallbackCanvas.height / 2);

  return canvasToBlob(fallbackCanvas, "image/jpeg", THUMBNAIL_JPEG_QUALITY);
}

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
}) {
  const { data, annotations, initialThumbnails, onThumbsLoaded, onDocumentLoadedRef, onErrorRef, onThumbsLoadedRef, thumbnailUrlsRef, renderedPagesRef, renderedUrlsRef, setPdf, setRenderedPages } = params;

  useEffect(() => {
    if (!data) {
      renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      renderedUrlsRef.current = [];
      setPdf(null);
      renderedPagesRef.current = [];
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
        if (cancelled) return void nextPdf.destroy();

        setPdf((prev) => {
          prev?.destroy();
          return nextPdf;
        });
        renderedPagesRef.current = [];
        setRenderedPages([]);
        onDocumentLoadedRef.current?.(nextPdf.numPages);
        onErrorRef.current?.(null);

        thumbnailUrlsRef.current = [];

        if (initialThumbnails && initialThumbnails.length > 0) {
          onThumbsLoadedRef.current?.(initialThumbnails);
          initialThumbnails.forEach((t) => thumbnailUrlsRef.current.push(t.url));
          return;
        }

        // Yield ~300ms so the PDF.js worker can finish rendering page 1 before thumbnails compete for it.
        await new Promise<void>((r) => setTimeout(r, 300));
        if (cancelled) return;

        const thumbCount = nextPdf.numPages;
        const thumbs: Array<{ page: number; url: string; blob: Blob }> = [];

        // Controlled Concurrency Batching (Batch size = 4 to fully utilize CPU/GPU cores without memory issues)
        const BATCH_SIZE = 4;

        for (let i = 1; i <= thumbCount; i += BATCH_SIZE) {
          if (cancelled) break;

          const batchPageNums: number[] = [];
          for (let j = 0; j < BATCH_SIZE && i + j <= thumbCount; j++) {
            batchPageNums.push(i + j);
          }

          const batchResults = await Promise.all(
            batchPageNums.map(async (pNum) => {
              if (cancelled) return null;
              let p: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null = null;
              try {
                p = await nextPdf.getPage(pNum);
                const baseViewport = p.getViewport({ scale: 1 });
                const vp = p.getViewport({ scale: getThumbnailScale(baseViewport.width) });
                const c = document.createElement("canvas");
                const ctx = c.getContext("2d");
                if (!ctx) {
                  const fallbackBlob = await createFallbackThumbnail(pNum);
                  if (!fallbackBlob) return null;
                  const fallbackUrl = URL.createObjectURL(fallbackBlob);
                  return { page: pNum, url: fallbackUrl, blob: fallbackBlob };
                }

                c.width = Math.max(1, Math.floor(vp.width));
                c.height = Math.max(1, Math.floor(vp.height));

                await p.render({ canvasContext: ctx, viewport: vp }).promise;
                drawAnnotationsToCanvas(ctx, annotations, pNum, c.width, c.height);

                const blob = await canvasToBlob(c, "image/jpeg", THUMBNAIL_JPEG_QUALITY);
                if (!blob) {
                  const fallbackBlob = await createFallbackThumbnail(pNum);
                  if (!fallbackBlob) return null;
                  const fallbackUrl = URL.createObjectURL(fallbackBlob);
                  return { page: pNum, url: fallbackUrl, blob: fallbackBlob };
                }
                const url = URL.createObjectURL(blob);
                return { page: pNum, url, blob };
              } catch (err) {
                console.error(`Failed to render thumbnail for page ${pNum}:`, err);
                const fallbackBlob = await createFallbackThumbnail(pNum);
                if (!fallbackBlob) return null;
                const fallbackUrl = URL.createObjectURL(fallbackBlob);
                return { page: pNum, url: fallbackUrl, blob: fallbackBlob };
              } finally {
                p?.cleanup();
              }
            })
          );

          if (cancelled) break;

          for (const res of batchResults) {
            if (res) {
              thumbnailUrlsRef.current.push(res.url);
              thumbs.push(res);
            }
          }
          // Progressive: emit after each batch so thumbnail panel populates as they render
          if (!cancelled) onThumbsLoadedRef.current?.([...thumbs]);
        }
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


export function useThumbnailRefresh(params: {
  pdf: PDFDocumentProxy | null;
  annotations: Annotation[];
  page: number;
  initialThumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  setThumbnails: Dispatch<SetStateAction<Array<{ page: number; url: string; blob: Blob }>>>;
}) {
  const { pdf, annotations, page, initialThumbnails, setThumbnails } = params;

  useEffect(() => {
    if (!pdf) return;
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
        setThumbnails((prev) => {
          const baseThumbs = prev.length > 0 ? prev : (initialThumbnails || []);
          if (baseThumbs.length === 0) {
            URL.revokeObjectURL(url);
            return prev;
          }

          const nextThumbs = baseThumbs.map((t) => {
            if (t.page === page) {
              URL.revokeObjectURL(t.url);
              return { page, url, blob };
            }
            return t;
          });
          return nextThumbs;
        });
        p.cleanup();
      } catch {
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [annotations.length, page, pdf, initialThumbnails, setThumbnails]);
}
