import { useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

type PdfSource = Blob | Uint8Array | null;
type CompareMode = "side-by-side" | "overlay";

const MAX_COMPARE_PIXELS = 10_000_000;

function toBlob(source: PdfSource): Blob | null {
  if (!source) return null;
  if (source instanceof Blob) return source;
  return new Blob([source as unknown as BlobPart], { type: "application/pdf" });
}

async function renderPage(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const safePage = Math.min(Math.max(1, pageNumber), pdf.numPages);
  const page = await pdf.getPage(safePage);
  try {
    const base = page.getViewport({ scale: 1 });
    const parentWidth = Math.max(320, canvas.parentElement?.clientWidth ?? 900);
    const cssScale = Math.min(2.5, Math.max(0.2, parentWidth / Math.max(1, base.width)));
    const viewport = page.getViewport({ scale: cssScale });
    const basePixels = Math.max(1, viewport.width * viewport.height);
    const pixelScale = Math.min(1.5, Math.sqrt(MAX_COMPARE_PIXELS / basePixels));
    const renderViewport = page.getViewport({ scale: cssScale * Math.max(0.5, pixelScale) });
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = Math.max(1, Math.floor(renderViewport.width));
    canvas.height = Math.max(1, Math.floor(renderViewport.height));
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    await page.render({ canvasContext: context, viewport: renderViewport }).promise;
  } finally {
    page.cleanup();
  }
}

function usePdfDocument(source: PdfSource, enabled: boolean) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const blob = toBlob(source);
    if (!blob) {
      setPdf(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    const task = getDocument({ url });
    let active = true;

    void task.promise
      .then((next) => {
        if (!active) {
          void next.destroy();
          return;
        }
        setPdf((previous) => {
          void previous?.destroy();
          return next;
        });
        setError(null);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể mở PDF");
      });

    return () => {
      active = false;
      void task.destroy();
      URL.revokeObjectURL(url);
    };
  }, [source, enabled]);

  useEffect(
    () => () => {
      void pdf?.destroy();
    },
    [pdf],
  );

  return { pdf, error };
}

export function RevisionCompareModal({
  isOpen,
  onClose,
  baseSource,
  baseFileName,
  initialPage = 1,
}: {
  isOpen: boolean;
  onClose: () => void;
  baseSource: PdfSource;
  baseFileName: string;
  initialPage?: number;
}) {
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [mode, setMode] = useState<CompareMode>("side-by-side");
  const [opacity, setOpacity] = useState(0.5);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const revisionCanvasRef = useRef<HTMLCanvasElement>(null);

  const { pdf: basePdf, error: baseError } = usePdfDocument(baseSource, isOpen);
  const { pdf: revisionPdf, error: revisionError } = usePdfDocument(revisionFile, isOpen);

  useEffect(() => {
    if (isOpen) setPageNumber(initialPage);
  }, [initialPage, isOpen]);

  const maxPage = useMemo(() => {
    if (!basePdf && !revisionPdf) return 1;
    if (!basePdf) return revisionPdf?.numPages ?? 1;
    if (!revisionPdf) return basePdf.numPages;
    return Math.min(basePdf.numPages, revisionPdf.numPages);
  }, [basePdf, revisionPdf]);

  useEffect(() => {
    if (!isOpen || !basePdf) return;
    void renderPage(basePdf, pageNumber, baseCanvasRef.current);
  }, [basePdf, isOpen, pageNumber, mode]);

  useEffect(() => {
    if (!isOpen || !revisionPdf) return;
    void renderPage(revisionPdf, pageNumber, revisionCanvasRef.current);
  }, [revisionPdf, isOpen, pageNumber, mode]);

  if (!isOpen) return null;

  const safePage = Math.min(Math.max(1, pageNumber), Math.max(1, maxPage));

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-slate-950/95 text-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900 px-4 py-2">
        <div className="mr-auto min-w-0">
          <div className="text-sm font-bold">Compare revisions</div>
          <div className="max-w-[420px] truncate text-[11px] text-slate-400">{baseFileName || "Current PDF"}</div>
        </div>

        <label className="cursor-pointer rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
          Chọn revision…
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => setRevisionFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as CompareMode)}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs"
          aria-label="Comparison mode"
        >
          <option value="side-by-side">Side by side</option>
          <option value="overlay">Overlay</option>
        </select>

        {mode === "overlay" ? (
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Revision
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              className="w-28"
            />
            {Math.round(opacity * 100)}%
          </label>
        ) : null}

        <div className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1">
          <button type="button" className="px-2 py-0.5 text-xs" onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>‹</button>
          <input
            type="number"
            min={1}
            max={Math.max(1, maxPage)}
            value={safePage}
            onChange={(event) => setPageNumber(Math.min(Math.max(1, Number(event.target.value) || 1), Math.max(1, maxPage)))}
            className="w-14 rounded bg-slate-950 px-1 py-0.5 text-center text-xs"
            aria-label="Comparison page"
          />
          <span className="text-[11px] text-slate-400">/ {Math.max(1, maxPage)}</span>
          <button type="button" className="px-2 py-0.5 text-xs" onClick={() => setPageNumber((value) => Math.min(Math.max(1, maxPage), value + 1))}>›</button>
        </div>

        <button type="button" className="rounded bg-white px-3 py-1.5 text-xs font-bold text-slate-900" onClick={onClose}>Đóng</button>
      </header>

      {(baseError || revisionError) ? (
        <div className="border-b border-red-900/50 bg-red-950/60 px-4 py-2 text-xs text-red-200">
          {baseError || revisionError}
        </div>
      ) : null}

      {!revisionFile ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <div className="mb-2 text-lg font-bold">Chọn PDF revision để so sánh</div>
            <div className="text-sm text-slate-400">Chỉ trang đang xem được rasterize, không render toàn bộ bộ bản vẽ.</div>
          </div>
        </div>
      ) : mode === "side-by-side" ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-px overflow-auto bg-slate-700">
          <div className="min-w-0 bg-slate-900 p-3">
            <div className="mb-2 truncate text-xs font-semibold text-slate-300">Current · trang {safePage}</div>
            <div className="mx-auto max-w-full bg-white shadow-2xl"><canvas ref={baseCanvasRef} /></div>
          </div>
          <div className="min-w-0 bg-slate-900 p-3">
            <div className="mb-2 truncate text-xs font-semibold text-slate-300">{revisionFile.name} · trang {safePage}</div>
            <div className="mx-auto max-w-full bg-white shadow-2xl"><canvas ref={revisionCanvasRef} /></div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-4">
          <div className="relative mx-auto w-fit max-w-full bg-white shadow-2xl">
            <canvas ref={baseCanvasRef} className="block max-w-full" />
            <canvas
              ref={revisionCanvasRef}
              className="pointer-events-none absolute inset-0 block max-w-full mix-blend-multiply"
              style={{ opacity }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
