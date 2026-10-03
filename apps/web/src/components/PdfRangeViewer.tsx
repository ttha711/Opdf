import { useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PdfViewerProps } from "./PdfViewer.types";
import { getServerDocumentUrl } from "../lib/documentSource";
import {
  registerViewerControls,
  registerViewerThumbnailProvider,
} from "../lib/viewer-runtime";

GlobalWorkerOptions.workerSrc = workerSrc;

export function PdfRangeViewer(props: PdfViewerProps) {
  const {
    sourceIdentity = "",
    page,
    scale,
    onDocumentLoaded,
    onError,
    onActivePageChange,
    onViewerScaleChange,
  } = props;
  const sourceUrl = useMemo(() => getServerDocumentUrl(sourceIdentity), [sourceIdentity]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [localScale, setLocalScale] = useState(scale);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    setLocalScale(scale);
  }, [scale]);

  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    const task = getDocument({
      url: sourceUrl,
      rangeChunkSize: 64 * 1024,
      disableStream: true,
      disableAutoFetch: true,
    });
    task.promise.then((document) => {
      if (cancelled) {
        void document.destroy();
        return;
      }
      setPdf(document);
      onDocumentLoaded?.(document.numPages);
      onError?.(null);
    }).catch((error) => {
      if (!cancelled) onError?.(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      setPdf(null);
      void task.destroy();
    };
  }, [sourceUrl, onDocumentLoaded, onError]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const token = ++renderTokenRef.current;
    let renderTask: any = null;
    void (async () => {
      try {
        const pdfPage = await pdf.getPage(Math.min(Math.max(1, page), pdf.numPages));
        if (token !== renderTokenRef.current || !canvasRef.current) return;
        const viewport = pdfPage.getViewport({ scale: Math.max(0.1, localScale) });
        const canvas = canvasRef.current;
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        onActivePageChange?.(page);
      } catch (error: any) {
        if (error?.name !== "RenderingCancelledException") {
          onError?.(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => renderTask?.cancel();
  }, [pdf, page, localScale, onActivePageChange, onError]);

  useEffect(() => {
    if (!pdf) return;
    const clamp = (value: number) => Math.min(5, Math.max(0.1, value));
    const updateScale = (value: number) => {
      const next = clamp(value);
      setLocalScale(next);
      onViewerScaleChange?.(next);
    };
    return registerViewerControls({
      zoomIn: () => updateScale(localScale * 1.15),
      zoomOut: () => updateScale(localScale / 1.15),
      resetZoom: () => updateScale(1),
      fitWidth: () => {
        const width = canvasRef.current?.parentElement?.clientWidth ?? 1000;
        void pdf.getPage(Math.min(Math.max(1, page), pdf.numPages)).then((pdfPage) => {
          const viewport = pdfPage.getViewport({ scale: 1 });
          updateScale(Math.max(0.1, (width - 32) / viewport.width));
        });
      },
      fitPage: () => updateScale(1),
    });
  }, [pdf, page, localScale, onViewerScaleChange]);

  useEffect(() => {
    if (!pdf) return;
    return registerViewerThumbnailProvider(async (pageNumber) => {
      const pdfPage = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
      const viewport = pdfPage.getViewport({ scale: 0.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return null;
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    });
  }, [pdf]);

  if (!sourceUrl) return null;

  return (
    <div
      className="viewer-shell h-full min-h-0 overflow-auto bg-[var(--viewer-bg)]"
      data-opdf-engine="pdfjs-range"
      data-opdf-source="server-range"
    >
      <div className="mx-auto min-h-full w-fit p-4">
        <canvas ref={canvasRef} className="block bg-white shadow" />
      </div>
    </div>
  );
}
