import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageDimension } from "./PdfViewer.types";

export function usePageLayout(params: {
  pdf: PDFDocumentProxy | null;
  scale: number;
  rotation: number;
  pageRotations: Record<number, number>;
}): PageDimension[] {
  const { pdf, scale, rotation, pageRotations } = params;
  const [dimensions, setDimensions] = useState<PageDimension[]>([]);

  useEffect(() => {
    if (!pdf) return void setDimensions([]);
    let cancelled = false;

    (async () => {
      // Fetch all page objects in parallel — just metadata, no pixel rendering
      const pageObjects = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1))
      );
      if (cancelled) return;

      const dims: PageDimension[] = pageObjects.map((p, idx) => {
        const pNum = idx + 1;
        const pageRotation = p.rotate || 0;
        const specificRotation = pageRotations[pNum] || 0;
        const combinedRotation = (pageRotation + specificRotation + rotation) % 360;
        const vp = p.getViewport({ scale, rotation: combinedRotation });
        const cssWidth = Math.max(1, Math.round(vp.width));
        const renderScale = cssWidth / vp.width;
        const renderVp = p.getViewport({ scale: scale * renderScale, rotation: combinedRotation });
        const cssHeight = Math.max(1, Math.round(renderVp.height));
        p.cleanup();
        return { pageNumber: pNum, cssWidth, cssHeight, rotation: combinedRotation };
      });

      if (!cancelled) setDimensions(dims);
    })();

    return () => { cancelled = true; };
  }, [pdf, scale, rotation, pageRotations]);

  return dimensions;
}
