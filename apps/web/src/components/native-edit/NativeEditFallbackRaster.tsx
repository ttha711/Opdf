import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type Props = {
  pageIndex: number;
  revisionKey: string;
  enabled: boolean;
  width: number;
  height: number;
  getDocumentBytes: () => Promise<Uint8Array | null>;
};

function hasPageBitmap(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLImageElement>("img"))
    .some((image) => image.complete && image.naturalWidth > 0);
}

/** PDF.js paints a fallback only if the native renderer never supplies a bitmap. */
export function NativeEditFallbackRaster({
  pageIndex, revisionKey, enabled, width, height, getDocumentBytes,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPainted(false);
    setError(null);
    if (!enabled || width <= 0 || height <= 0) return;
    let cancelled = false;
    let disposePdf: (() => void) | undefined;
    let cancelRender: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const canvas = ref.current;
      const pageNode = canvas?.closest<HTMLElement>(".native-edit-page");
      if (!canvas || !pageNode || hasPageBitmap(pageNode)) return;
      void (async () => {
        try {
          const [pdfjs, bytes] = await Promise.all([import("pdfjs-dist"), getDocumentBytes()]);
          if (!bytes || cancelled) return;
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
          const loading = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
          disposePdf = () => { void loading.destroy(); };
          const doc = await loading.promise;
          const page = await doc.getPage(pageIndex + 1);
          const original = page.getViewport({ scale: 1 });
          const target = Math.min(
            width / Math.max(1, original.width),
            height / Math.max(1, original.height),
            Math.sqrt(4_000_000 / Math.max(1, original.width * original.height)),
          );
          const viewport = page.getViewport({ scale: Math.max(0.001, target) });
          canvas.width = Math.max(1, Math.ceil(viewport.width));
          canvas.height = Math.max(1, Math.ceil(viewport.height));
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("PDF fallback canvas unavailable.");
          const rendering = page.render({ canvasContext: context, viewport });
          cancelRender = () => rendering.cancel();
          await rendering.promise;
          if (!cancelled && !hasPageBitmap(pageNode)) setPainted(true);
        } catch (reason) {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        }
      })();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelRender?.();
      disposePdf?.();
    };
  }, [enabled, getDocumentBytes, height, pageIndex, revisionKey, width]);

  return (
    <>
      <canvas ref={ref} data-opdf-pdfjs-fallback="true" style={{
        display: painted ? "block" : "none", position: "absolute", inset: 0,
        width: "100%", height: "100%", pointerEvents: "none",
      }} />
      {error && <div role="status" className="native-edit-error">
        Unable to display PDF page: {error}
      </div>}
    </>
  );
}
