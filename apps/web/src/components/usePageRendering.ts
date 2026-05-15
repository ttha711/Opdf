import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { canvasToBlob, isRenderingCancelled } from "./PdfViewer.utils";
import { CONTINUOUS_BATCH_SIZE, type RenderedPage, type ViewMode } from "./PdfViewer.types";

export function usePageRendering(params: {
  pdf: PDFDocumentProxy | null;
  page: number;
  scale: number;
  rotation: number;
  searchText?: string;
  viewMode: ViewMode;
  continuousLoadedUntil: number;
  setRenderedPages: Dispatch<SetStateAction<RenderedPage[]>>;
  renderedPagesRef: MutableRefObject<RenderedPage[]>;
  renderedUrlsRef: MutableRefObject<string[]>;
  lastParamsRef: MutableRefObject<{ pdf: PDFDocumentProxy | null; scale: number; rotation: number; viewMode: ViewMode }>;
  onSearchResultRef: MutableRefObject<((found: boolean, message: string) => void) | undefined>;
}) {
  const { pdf, page, scale, rotation, searchText, viewMode, continuousLoadedUntil, setRenderedPages, renderedPagesRef, renderedUrlsRef, lastParamsRef, onSearchResultRef } = params;

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
        renderedPagesRef.current.forEach((p) => URL.revokeObjectURL(p.imageUrl));
        renderedPagesRef.current = [];
        setRenderedPages([]);
        lastParamsRef.current = { pdf, scale, rotation, viewMode };
      }

      const targetPages: number[] = [];
      if (viewMode === "continuous") {
        const endPage = Math.max(1, Math.min(pdf.numPages, continuousLoadedUntil || Math.min(CONTINUOUS_BATCH_SIZE, pdf.numPages)));
        for (let i = 1; i <= endPage; i += 1) targetPages.push(i);
      } else {
        targetPages.push(Math.min(Math.max(1, page), pdf.numPages));
      }

      const renderedPageNums = new Set(renderedPagesRef.current.map((p) => p.pageNumber));
      const pagesToRender = targetPages.filter((pNum) => !renderedPageNums.has(pNum));

      if (pagesToRender.length === 0) {
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
        setRenderedPages((prev) => {
          const combined = [...prev, ...newlyRendered].sort((a, b) => a.pageNumber - b.pageNumber);
          const next = viewMode === "continuous" ? combined : newlyRendered;
          renderedPagesRef.current = next;
          renderedUrlsRef.current = next.map((p) => p.imageUrl);
          return next;
        });
      } else {
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
}
