import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Util, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { canvasToBlob, isRenderingCancelled } from "./PdfViewer.utils";
import { type RenderedPage, type RenderedTextItem, type ViewMode } from "./PdfViewer.types";

const MAX_RENDERED_PAGES = 7;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_DEVICE_SCALE = 2;

async function extractTextItems(
  pdfPage: PDFPageProxy,
  scale: number,
  rotation: number,
): Promise<RenderedTextItem[]> {
  const viewport = pdfPage.getViewport({ scale, rotation });
  const content = await pdfPage.getTextContent();
  return content.items
    .filter(
      (item): item is typeof item & { str: string; width: number; height: number; transform: number[] } =>
        "str" in item && item.str.trim().length > 0,
    )
    .map((item) => {
      const tx = Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.max(1, Math.hypot(tx[2], tx[3]));
      return {
        str: item.str,
        left: tx[4],
        top: tx[5] - fontHeight,
        width: Math.max(1, item.width * viewport.scale),
        height: Math.max(fontHeight, item.height * viewport.scale),
        fontSize: fontHeight,
        transform: "none",
        fontName: (item as { fontName?: string }).fontName,
      };
    });
}

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
  lastParamsRef: MutableRefObject<{
    pdf: PDFDocumentProxy | null;
    scale: number;
    rotation: number;
    pageRotations?: Record<number, number>;
    viewMode: ViewMode;
  }>;
  onSearchResultRef: MutableRefObject<((found: boolean, message: string) => void) | undefined>;
}) {
  const {
    pdf,
    page,
    scale,
    rotation,
    pageRotations = {},
    searchText,
    viewMode,
    visiblePages,
    setRenderedPages,
    renderedPagesRef,
    renderedUrlsRef,
    lastParamsRef,
    onSearchResultRef,
  } = params;

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

      const renderedPageNums = new Set(renderedPagesRef.current.map((item) => item.pageNumber));
      const targetPages: number[] = [];

      if (viewMode === "continuous") {
        if (paramsChanged) {
          visiblePages.forEach((pageNumber) => targetPages.push(pageNumber));
          if (targetPages.length === 0) targetPages.push(Math.min(Math.max(1, page), pdf.numPages));
        } else {
          visiblePages.forEach((pageNumber) => {
            if (!renderedPageNums.has(pageNumber)) targetPages.push(pageNumber);
          });
        }
        targetPages.sort((a, b) => a - b);
      } else {
        targetPages.push(Math.min(Math.max(1, page), pdf.numPages));
      }

      const pagesToRender = paramsChanged
        ? targetPages
        : targetPages.filter((pageNumber) => !renderedPageNums.has(pageNumber));

      let replacedExistingPages = false;
      for (const pageNumber of pagesToRender) {
        if (cancelled) break;

        const pdfPage = await pdf.getPage(pageNumber);
        const pageRotation = pdfPage.rotate || 0;
        const specificRotation = pageRotations[pageNumber] || 0;
        const combinedRotation = ((pageRotation + specificRotation + rotation) % 360 + 360) % 360;
        const viewport = pdfPage.getViewport({ scale, rotation: combinedRotation });
        const cssWidth = Math.max(1, Math.round(viewport.width));
        const renderScale = cssWidth / Math.max(1, viewport.width);
        const renderViewport = pdfPage.getViewport({
          scale: scale * renderScale,
          rotation: combinedRotation,
        });
        const cssHeight = Math.max(1, Math.round(renderViewport.height));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          pdfPage.cleanup();
          continue;
        }

        const basePixels = Math.max(1, cssWidth * cssHeight);
        const pixelBudgetScale = Math.sqrt(MAX_CANVAS_PIXELS / basePixels);
        const outputScale = Math.max(
          0.35,
          Math.min(MAX_DEVICE_SCALE, window.devicePixelRatio || 1, pixelBudgetScale),
        );
        canvas.width = Math.max(1, Math.round(cssWidth * outputScale));
        canvas.height = Math.max(1, Math.round(cssHeight * outputScale));

        const renderTask = pdfPage.render({
          canvasContext: context,
          viewport: renderViewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        activeRenderTasks.push(renderTask);

        try {
          await renderTask.promise;
        } catch (error) {
          pdfPage.cleanup();
          if (isRenderingCancelled(error)) return;
          throw error;
        }

        if (cancelled) {
          pdfPage.cleanup();
          return;
        }

        const blob = await canvasToBlob(canvas, "image/webp", 0.9);
        if (!blob) {
          pdfPage.cleanup();
          continue;
        }

        const imageUrl = URL.createObjectURL(blob);
        const shouldLoadText = pageNumber === page;
        const textItems = shouldLoadText
          ? await extractTextItems(pdfPage, scale * renderScale, combinedRotation)
          : [];

        const renderedPage: RenderedPage = {
          pageNumber,
          width: cssWidth,
          height: cssHeight,
          scale,
          rotation: combinedRotation,
          imageUrl,
          textItems,
          textLoaded: shouldLoadText,
        };

        pdfPage.cleanup();
        if (cancelled) {
          URL.revokeObjectURL(imageUrl);
          return;
        }

        const replacingPages = paramsChanged || viewMode !== "continuous";
        const previousUrls =
          replacingPages && !replacedExistingPages
            ? renderedPagesRef.current.map((item) => item.imageUrl)
            : [];

        setRenderedPages((previous) => {
          const base = replacingPages && !replacedExistingPages ? [] : previous;
          const withoutCurrent = base.filter((item) => item.pageNumber !== renderedPage.pageNumber);
          const all = [...withoutCurrent, renderedPage];
          const ranked = [...all].sort(
            (a, b) => Math.abs(a.pageNumber - page) - Math.abs(b.pageNumber - page),
          );
          const keep = new Set(ranked.slice(0, MAX_RENDERED_PAGES).map((item) => item.pageNumber));
          const evicted = all.filter((item) => !keep.has(item.pageNumber));
          const next = all
            .filter((item) => keep.has(item.pageNumber))
            .map((item) =>
              item.pageNumber === page
                ? item
                : item.textLoaded || item.textItems.length > 0
                  ? { ...item, textItems: [], textLoaded: false }
                  : item,
            )
            .sort((a, b) => a.pageNumber - b.pageNumber);

          renderedPagesRef.current = next;
          renderedUrlsRef.current = next.map((item) => item.imageUrl);

          if (evicted.length > 0) {
            window.setTimeout(() => {
              const activeUrls = new Set(renderedUrlsRef.current);
              evicted.forEach((item) => {
                if (!activeUrls.has(item.imageUrl)) URL.revokeObjectURL(item.imageUrl);
              });
            }, 0);
          }
          return next;
        });

        if (previousUrls.length > 0) {
          window.setTimeout(() => {
            const activeUrls = new Set(renderedUrlsRef.current);
            previousUrls.forEach((url) => {
              if (!activeUrls.has(url)) URL.revokeObjectURL(url);
            });
          }, 0);
        }
        replacedExistingPages = replacedExistingPages || replacingPages;
      }
    })().catch((error) => {
      if (!cancelled) console.error("Page render failed:", error);
    });

    return () => {
      cancelled = true;
      activeRenderTasks.forEach((task) => task.cancel());
    };
  }, [pdf, page, scale, rotation, pageRotations, viewMode, visiblePages]);

  // Text content can be huge on CAD/vector drawings. Keep it only for the
  // active sheet, and populate it lazily even when the raster is already cached.
  useEffect(() => {
    if (!pdf) return;
    const cached = renderedPagesRef.current.find((item) => item.pageNumber === page);
    if (!cached || cached.textLoaded) return;

    let cancelled = false;
    (async () => {
      const pdfPage = await pdf.getPage(page);
      try {
        const textItems = await extractTextItems(pdfPage, cached.scale, cached.rotation);
        if (cancelled) return;
        setRenderedPages((previous) => {
          const next = previous.map((item) =>
            item.pageNumber === page
              ? { ...item, textItems, textLoaded: true }
              : item.textLoaded || item.textItems.length > 0
                ? { ...item, textItems: [], textLoaded: false }
                : item,
          );
          renderedPagesRef.current = next;
          return next;
        });
      } finally {
        pdfPage.cleanup();
      }
    })().catch((error) => {
      if (!cancelled) console.error("Text extraction failed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale, rotation, pageRotations, setRenderedPages, renderedPagesRef]);

  // Search only the active page and do not retain another permanent text array.
  useEffect(() => {
    if (!pdf) return;
    const query = searchText?.trim();
    if (!query) {
      onSearchResultRef.current?.(false, "enter text to search");
      return;
    }

    let cancelled = false;
    (async () => {
      const safePage = Math.min(Math.max(1, page), pdf.numPages);
      const pdfPage = await pdf.getPage(safePage);
      try {
        const content = await pdfPage.getTextContent();
        if (cancelled) return;
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .toLowerCase();
        onSearchResultRef.current?.(
          pageText.includes(query.toLowerCase()),
          `"${query}" on page ${safePage}`,
        );
      } finally {
        pdfPage.cleanup();
      }
    })().catch((error) => {
      if (!cancelled) console.error("PDF search failed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, page, searchText, onSearchResultRef]);
}
