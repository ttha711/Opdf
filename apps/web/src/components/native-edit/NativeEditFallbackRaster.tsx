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

type WorkerResult =
  | { ok: true; width: number; height: number; rgba: ArrayBuffer }
  | { ok: false; error: string };

function nativeBitmapReady(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLImageElement>("img"))
    .some((image) => image.complete && image.naturalWidth > 0);
}

/** Off-thread PDFium raster fallback, with PDF.js as the second independent renderer. */
export function NativeEditFallbackRaster({
  pageIndex, revisionKey, enabled, width, height, getDocumentBytes,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bytesProvider = useRef(getDocumentBytes);
  const dimensions = useRef({ width, height });
  bytesProvider.current = getDocumentBytes;
  dimensions.current = { width, height };
  const [stage, setStage] = useState("waiting");
  const [painted, setPainted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPainted(false);
    setStage("waiting");
    setError(null);
    if (!enabled || width <= 0 || height <= 0) return;
    let cancelled = false;
    let finished = false;
    let worker: Worker | null = null;
    let disposePdf: (() => void) | undefined;
    let cancelRender: (() => void) | undefined;
    let fallbackStarted = false;

    const shouldStop = () => {
      const pageNode = canvasRef.current?.closest<HTMLElement>(".native-edit-page");
      return cancelled || finished || !pageNode || nativeBitmapReady(pageNode);
    };
    const paint = (rgba: Uint8ClampedArray, w: number, h: number) => {
      if (shouldStop()) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { alpha: false });
      if (!canvas || !ctx) return;
      canvas.width = w;
      canvas.height = h;
      const image = ctx.createImageData(w, h);
      image.data.set(rgba);
      ctx.putImageData(image, 0, 0);
      finished = true;
      setPainted(true);
      setStage("ready");
      worker?.terminate();
      cancelRender?.();
      disposePdf?.();
    };

    const renderWithPdfJs = async (bytes: Uint8Array) => {
      if (fallbackStarted || shouldStop()) return;
      fallbackStarted = true;
      setStage("pdfjs-rendering");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const loading = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
        disposePdf = () => { void loading.destroy(); };
        const doc = await loading.promise;
        const pdfPage = await doc.getPage(pageIndex + 1);
        const viewport1 = pdfPage.getViewport({ scale: 1 });
        const view = dimensions.current;
        const target = Math.min(
          view.width / Math.max(1, viewport1.width),
          view.height / Math.max(1, viewport1.height),
          Math.sqrt(650_000 / Math.max(1, viewport1.width * viewport1.height)),
        );
        const viewport = pdfPage.getViewport({ scale: Math.max(0.001, target) });
        const scratch = document.createElement("canvas");
        scratch.width = Math.max(1, Math.ceil(viewport.width));
        scratch.height = Math.max(1, Math.ceil(viewport.height));
        const ctx = scratch.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("PDF.js fallback canvas unavailable.");
        const rendering = pdfPage.render({ canvasContext: ctx, viewport });
        cancelRender = () => rendering.cancel();
        await rendering.promise;
        if (!shouldStop()) {
          const rgba = ctx.getImageData(0, 0, scratch.width, scratch.height);
          paint(rgba.data, scratch.width, scratch.height);
        }
      } catch (reason) {
        if (!cancelled && !finished) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setStage("error");
        }
      }
    };

    const start = window.setTimeout(() => {
      if (shouldStop()) return;
      setStage("pdfium-rendering");
      void (async () => {
        try {
          const bytes = await bytesProvider.current();
          if (!bytes || shouldStop()) return;
          const copy = bytes.slice();
          worker = new Worker(new URL("./nativeEditPdfiumRaster.worker.ts", import.meta.url), { type: "module" });
          worker.onmessage = (event: MessageEvent<WorkerResult>) => {
            if (shouldStop()) return;
            const result = event.data;
            if (result.ok) paint(new Uint8ClampedArray(result.rgba), result.width, result.height);
            else void renderWithPdfJs(bytes);
          };
          worker.onerror = () => { void renderWithPdfJs(bytes); };
          worker.postMessage({
            pdf: copy.buffer, pageIndex,
            maxWidth: dimensions.current.width, maxHeight: dimensions.current.height,
          }, [copy.buffer]);
          rescue = window.setTimeout(() => { void renderWithPdfJs(bytes); }, 12000);
        } catch (reason) {
          if (!cancelled) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setStage("error");
          }
        }
      })();
    }, 1200);

    let rescue: number | undefined;
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      if (rescue !== undefined) window.clearTimeout(rescue);
      worker?.terminate();
      cancelRender?.();
      disposePdf?.();
    };
  }, [enabled, pageIndex, revisionKey]);

  return (
    <>
      <canvas ref={canvasRef} data-opdf-pdfjs-fallback="true" data-opdf-fallback-stage={stage}
        style={{ display: painted ? "block" : "none", position: "absolute", inset: 0,
          width: "100%", height: "100%", pointerEvents: "none" }} />
      {error && <div role="status" className="native-edit-error">
        Unable to display PDF page: {error}
      </div>}
    </>
  );
}
