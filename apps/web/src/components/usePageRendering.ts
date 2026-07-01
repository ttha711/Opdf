import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Util, type PDFDocumentProxy } from "pdfjs-dist";
import { canvasToBlob, isRenderingCancelled } from "./PdfViewer.utils";
import { type RenderedPage, type RenderedTextItem, type ViewMode } from "./PdfViewer.types";

export function usePageRendering(params: {
  pdf: PDFDocumentProxy | null;
  page: number;
  scale: number;
  rotation: number;
  pageRotations?: Record<number, number>;
  searchText?: string;
  viewMode: ViewMode;
  visiblePages: Set<number>;
  setRenderedPages: Dispatch<SetStateAction<RenderedPage[]>>;
  renderedPagesRef: MutableRefObject<RenderedPage[]>;
  renderedUrlsRef: MutableRefObject<string[]>;
  lastParamsRef: MutableRefObject<{ pdf: PDFDocumentProxy | null; scale: number; rotation: number; pageRotations?: Record<number, number>; viewMode: ViewMode }>;
  onSearchResultRef: MutableRefObject<((found: boolean, message: string) => void) | undefined>;
}) {
  const { pdf, page, scale, rotation, pageRotations = {}, searchText, viewMode, visiblePages, setRenderedPages, renderedPagesRef, renderedUrlsRef, lastParamsRef, onSearchResultRef } = params;

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const activeRenderTasks: Array<{ cancel: () => void }> = [];

    (async () => {
      const paramsChanged =
        lastParamsRef.current.pdf !== pdf ||
        lastParamsRef.current.scale !== scale ||
        lastParamsRef.current.rotation !== rotation ||
        JSON.stringify(lastParamsRef.current.pageRotations) !== JSON.stringify(pageRotations) ||
        lastParamsRef.current.viewMode !== viewMode;

      if (paramsChanged) {
        lastParamsRef.current = { pdf, scale, rotation, pageRotations, viewMode };
      }

      const renderedPageNums = new Set(renderedPagesRef.current.map((p) => p.pageNumber));

      const targetPages: number[] = [];
      if (viewMode === "continuous") {
        if (paramsChanged) {
          // Scale/rotation/pdf changed: re-render currently visible pages
          visiblePages.forEach((p) => targetPages.push(p));
          // Fallback: if visiblePages is empty (e.g. IntersectionObserver hasn't fired yet
          // after elements remounted), render the current page so the viewer isn't blank.
          if (targetPages.length === 0) targetPages.push(Math.min(Math.max(1, page), pdf.numPages));
        } else {
          // Only render newly visible pages that aren't rendered yet
          visiblePages.forEach((p) => {
            if (!renderedPageNums.has(p)) targetPages.push(p);
          });
        }
        targetPages.sort((a, b) => a - b);
      } else {
        targetPages.push(Math.min(Math.max(1, page), pdf.numPages));
      }

      const pagesToRender = paramsChanged ? targetPages : targetPages.filter((pNum) => !renderedPageNums.has(pNum));

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

      let replacedExistingPages = false;
      for (const pNum of pagesToRender) {
        if (cancelled) break;
        const p = await pdf.getPage(pNum);
        const pageRotation = p.rotate || 0;
        const specificRotation = pageRotations[pNum] || 0;
        const combinedRotation = (pageRotation + specificRotation + rotation) % 360;
        const vp = p.getViewport({ scale, rotation: combinedRotation });
        const cssWidth = Math.max(1, Math.round(vp.width));
        const renderScale = cssWidth / vp.width;
        const renderViewport = p.getViewport({ scale: scale * renderScale, rotation: combinedRotation });
        const cssHeight = Math.max(1, Math.round(renderViewport.height));
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        if (!ctx) { p.cleanup(); continue; }
        const outputScale = Math.max(1, window.devicePixelRatio || 1);
        c.width = Math.max(1, Math.round(cssWidth * outputScale));
        c.height = Math.max(1, Math.round(cssHeight * outputScale));
        const renderTask = p.render({
          canvasContext: ctx,
          viewport: renderViewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
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
        const blob = await canvasToBlob(c, "image/webp", 0.92);
        if (!blob) {
          p.cleanup();
          continue;
        }
        const url = URL.createObjectURL(blob);
        const textContent = await p.getTextContent();
        const textItems: RenderedTextItem[] = textContent.items
          .filter((item): item is typeof item & { str: string; width: number; height: number; transform: number[] } => "str" in item && item.str.trim().length > 0)
          .map((item) => {
            const tx = Util.transform(renderViewport.transform, item.transform);
            const fontHeight = Math.max(1, Math.hypot(tx[2], tx[3]));
            const width = Math.max(1, item.width * renderViewport.scale);
            return {
              str: item.str,
              left: tx[4],
              top: tx[5] - fontHeight,
              width,
              height: Math.max(fontHeight, item.height * renderViewport.scale),
              fontSize: fontHeight,
              transform: "none",
              fontName: (item as any).fontName,
            };
          });
        const renderedPage = { pageNumber: pNum, width: cssWidth, height: cssHeight, scale, rotation: combinedRotation, imageUrl: url, textItems };
        p.cleanup();
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        const replacingPages = paramsChanged || viewMode !== "continuous";
        const previousUrls = replacingPages && !replacedExistingPages ? renderedPagesRef.current.map((pageData) => pageData.imageUrl) : [];
        setRenderedPages((prev) => {
          const base = replacingPages && !replacedExistingPages ? [] : prev;
          const withoutCurrent = base.filter((pageData) => pageData.pageNumber !== renderedPage.pageNumber);
          const next = [...withoutCurrent, renderedPage].sort((a, b) => a.pageNumber - b.pageNumber);
          renderedPagesRef.current = next;
          renderedUrlsRef.current = next.map((p) => p.imageUrl);
          return next;
        });
        if (previousUrls.length > 0) {
          window.setTimeout(() => {
            const activeUrls = new Set(renderedUrlsRef.current);
            previousUrls.forEach((urlToRevoke) => {
              if (!activeUrls.has(urlToRevoke)) URL.revokeObjectURL(urlToRevoke);
            });
          }, 0);
        }
        replacedExistingPages = replacedExistingPages || replacingPages;
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
  }, [pdf, page, scale, rotation, pageRotations, searchText, viewMode, visiblePages]);
}
