import { useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageDimension } from "./PdfViewer.types";

type BasePageDimension = {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
};

const METADATA_BATCH_SIZE = 8;

export function usePageLayout(params: {
  pdf: PDFDocumentProxy | null;
  scale: number;
  rotation: number;
  pageRotations: Record<number, number>;
}): PageDimension[] {
  const { pdf, scale, rotation, pageRotations } = params;
  const [baseDimensions, setBaseDimensions] = useState<BasePageDimension[]>([]);

  useEffect(() => {
    if (!pdf) {
      setBaseDimensions([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const next: BasePageDimension[] = [];

      // Page boxes are document metadata. Read them once per PDF rather than
      // refetching every page whenever zoom/rotation changes.
      for (let start = 1; start <= pdf.numPages; start += METADATA_BATCH_SIZE) {
        if (cancelled) return;
        const end = Math.min(pdf.numPages, start + METADATA_BATCH_SIZE - 1);
        const pages = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, index) => pdf.getPage(start + index)),
        );

        for (const p of pages) {
          const viewport = p.getViewport({ scale: 1, rotation: 0 });
          next.push({
            pageNumber: p.pageNumber,
            width: viewport.width,
            height: viewport.height,
            rotation: p.rotate || 0,
          });
          p.cleanup();
        }

        // Publish progressively so very large sets become navigable early.
        if (!cancelled) setBaseDimensions([...next]);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    })().catch((error) => {
      if (!cancelled) console.error("Failed to read PDF page layout:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return useMemo(
    () =>
      baseDimensions.map((base) => {
        const specificRotation = pageRotations[base.pageNumber] || 0;
        const combinedRotation = ((base.rotation + specificRotation + rotation) % 360 + 360) % 360;
        const swapsAxes = combinedRotation === 90 || combinedRotation === 270;
        const cssWidth = Math.max(1, Math.round((swapsAxes ? base.height : base.width) * scale));
        const cssHeight = Math.max(1, Math.round((swapsAxes ? base.width : base.height) * scale));
        return {
          pageNumber: base.pageNumber,
          cssWidth,
          cssHeight,
          rotation: combinedRotation,
        };
      }),
    [baseDimensions, pageRotations, rotation, scale],
  );
}
