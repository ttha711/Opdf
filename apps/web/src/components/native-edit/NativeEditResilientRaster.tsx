import { useEffect, useRef, useState } from "react";
import { RenderLayer } from "@embedpdf/plugin-render/react";

// EmbedPDF may settle a page layout without ever publishing its first raster
// on some vector-heavy documents. Remount only the raster layer (not the
// document, Scroller or editor) if it remains blank after a bounded wait.
export function NativeEditResilientRaster({
  documentId,
  pageIndex,
}: {
  documentId: string;
  pageIndex: number;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    // Wait for slow CAD rasterization; do not restart a working image.
    const delay = retry === 0 ? 8000 : 10000;
    const timeout = window.setTimeout(() => {
      const rasters = surfaceRef.current?.querySelectorAll<HTMLImageElement | HTMLCanvasElement>("img, canvas");
      if (!rasters) return;
      const ready = Array.from(rasters).some((raster) => raster instanceof HTMLImageElement
        ? raster.complete && raster.naturalWidth > 0
        : raster.width > 0 && raster.height > 0);
      if (!ready && retry < 2) setRetry((value) => value + 1);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [documentId, pageIndex, retry]);

  return (
    <div
      ref={surfaceRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      data-opdf-raster-retry={retry}
    >
      <RenderLayer key={retry} documentId={documentId} pageIndex={pageIndex} />
    </div>
  );
}
