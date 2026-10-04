import { useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PdfSource } from "../lib/documentSource";
import {
import { useDialogClose } from "../hooks/useDialogClose";
  buildRevisionReportPdf,
  detectDiffRegions,
  estimateTranslation,
  type DiffAlignment,
  type DiffRegion,
} from "../lib/revisionDiff";

GlobalWorkerOptions.workerSrc = workerSrc;

type CompareMode = "side-by-side" | "overlay" | "changes";

const MAX_COMPARE_PIXELS = 10_000_000;
const MAX_ANALYSIS_PIXELS = 2_500_000;

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

async function renderAnalysisPage(pdf: PDFDocumentProxy, pageNumber: number) {
  const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, Math.sqrt(MAX_ANALYSIS_PIXELS / Math.max(1, base.width * base.height)));
    const viewport = page.getViewport({ scale: Math.max(0.25, scale) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  } finally {
    page.cleanup();
  }
}

function usePdfDocument(source: PdfSource, enabled: boolean) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!source) {
      setPdf(null);
      return;
    }

    const blob = typeof source === "string" ? null : toBlob(source);
    const objectUrl = blob ? URL.createObjectURL(blob) : null;
    const task = getDocument({ url: typeof source === "string" ? source : objectUrl! });
    let active = true;
    void task.promise.then((next) => {
      if (!active) {
        void next.destroy();
        return;
      }
      setPdf((previous) => {
        void previous?.destroy();
        return next;
      });
      setError(null);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Không thể mở PDF");
    });
    return () => {
      active = false;
      void task.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, enabled]);

  useEffect(() => () => { void pdf?.destroy(); }, [pdf]);
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
  useDialogClose(isOpen, onClose);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [mode, setMode] = useState<CompareMode>("side-by-side");
  const [opacity, setOpacity] = useState(0.5);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [threshold, setThreshold] = useState(34);
  const [autoAlign, setAutoAlign] = useState(true);
  const [regions, setRegions] = useState<DiffRegion[]>([]);
  const [alignment, setAlignment] = useState<DiffAlignment>({ dx: 0, dy: 0, score: 0 });
  const [analysisSize, setAnalysisSize] = useState({ width: 1, height: 1 });
  const [activeChange, setActiveChange] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const revisionCanvasRef = useRef<HTMLCanvasElement>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const safePage = Math.min(Math.max(1, pageNumber), Math.max(1, maxPage));

  useEffect(() => {
    if (!isOpen || !basePdf) return;
    void renderPage(basePdf, safePage, baseCanvasRef.current);
  }, [basePdf, isOpen, safePage, mode]);

  useEffect(() => {
    if (!isOpen || !revisionPdf) return;
    void renderPage(revisionPdf, safePage, revisionCanvasRef.current);
  }, [revisionPdf, isOpen, safePage, mode]);

  useEffect(() => {
    setRegions([]);
    setActiveChange(0);
    setAlignment({ dx: 0, dy: 0, score: 0 });
  }, [safePage, revisionFile]);

  const analyze = async () => {
    if (!basePdf || !revisionPdf) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const [baseCanvas, revisionCanvas] = await Promise.all([
        renderAnalysisPage(basePdf, safePage),
        renderAnalysisPage(revisionPdf, safePage),
      ]);
      const normalizedRevision = document.createElement("canvas");
      normalizedRevision.width = baseCanvas.width;
      normalizedRevision.height = baseCanvas.height;
      const normalizedContext = normalizedRevision.getContext("2d");
      const baseContext = baseCanvas.getContext("2d");
      if (!normalizedContext || !baseContext) throw new Error("Canvas analysis unavailable");
      normalizedContext.fillStyle = "#ffffff";
      normalizedContext.fillRect(0, 0, normalizedRevision.width, normalizedRevision.height);
      normalizedContext.drawImage(revisionCanvas, 0, 0, normalizedRevision.width, normalizedRevision.height);
      const baseImage = baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
      const revisionImage = normalizedContext.getImageData(0, 0, normalizedRevision.width, normalizedRevision.height);
      const nextAlignment = autoAlign
        ? estimateTranslation(baseImage, revisionImage, 12, 10)
        : { dx: 0, dy: 0, score: 0 };
      const nextRegions = detectDiffRegions(baseImage, revisionImage, threshold, nextAlignment, 18, 2);
      setAnalysisSize({ width: baseCanvas.width, height: baseCanvas.height });
      setAlignment(nextAlignment);
      setRegions(nextRegions);
      setActiveChange(0);
      setMode("changes");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Không thể phân tích revision");
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (mode !== "changes") return;
    const canvas = diffCanvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) return;
    canvas.width = base.width;
    canvas.height = base.height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    regions.forEach((region, index) => {
      const x = region.x * canvas.width;
      const y = region.y * canvas.height;
      const w = region.width * canvas.width;
      const h = region.height * canvas.height;
      ctx.fillStyle = index === activeChange ? "rgba(239,68,68,0.28)" : "rgba(245,158,11,0.18)";
      ctx.strokeStyle = index === activeChange ? "#ef4444" : "#f59e0b";
      ctx.lineWidth = index === activeChange ? 4 : 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    });
  }, [regions, activeChange, mode]);

  const moveChange = (direction: number) => {
    if (!regions.length) return;
    setActiveChange((current) => (current + direction + regions.length) % regions.length);
  };

  const exportReport = async () => {
    if (!revisionFile) return;
    const bytes = await buildRevisionReportPdf({
      baseFileName: baseFileName || "Current PDF",
      revisionFileName: revisionFile.name,
      page: safePage,
      threshold,
      alignment,
      regions,
    });
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "revision-comparison-page-" + safePage + ".pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;
  const shiftX = analysisSize.width ? alignment.dx / analysisSize.width * 100 : 0;
  const shiftY = analysisSize.height ? alignment.dy / analysisSize.height * 100 : 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950/95 text-white" style={{ zIndex: "var(--z-modal-high)" }}>
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900 px-4 py-2">
        <div className="mr-auto min-w-0">
          <div className="text-sm font-bold">So sánh phiên bản</div>
          <div className="max-w-[420px] truncate text-[11px] text-slate-400">{baseFileName || "Current PDF"}</div>
        </div>
        <label className="cursor-pointer rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
          Chọn bản PDF khác…
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => setRevisionFile(event.target.files?.[0] ?? null)} />
        </label>
        <select value={mode} onChange={(event) => setMode(event.target.value as CompareMode)} className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs" aria-label="Comparison mode">
          <option value="side-by-side">Song song</option>
          <option value="overlay">Chồng lớp</option>
          <option value="changes">Thay đổi</option>
        </select>
        <label className="flex items-center gap-1 text-[11px] text-slate-300">
          Độ nhạy
          <input type="range" min="12" max="80" step="2" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
          {threshold}
        </label>
        <label className="flex items-center gap-1 text-[11px] text-slate-300">
          <input type="checkbox" checked={autoAlign} onChange={(event) => setAutoAlign(event.target.checked)} />
          Tự căn chỉnh
        </label>
        <button type="button" disabled={!revisionFile || !basePdf || !revisionPdf || analyzing} onClick={() => void analyze()} className="rounded bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40">
          {analyzing ? "Analyzing…" : "Phát hiện thay đổi"}
        </button>
        {regions.length > 0 ? (
          <button type="button" onClick={() => void exportReport()} className="rounded border border-slate-500 px-3 py-1.5 text-xs font-semibold">Xuất báo cáo</button>
        ) : null}
        <div className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1">
          <button type="button" className="px-2 text-xs" onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>‹</button>
          <input type="number" min={1} max={Math.max(1, maxPage)} value={safePage} onChange={(event) => setPageNumber(Math.min(Math.max(1, Number(event.target.value) || 1), Math.max(1, maxPage)))} className="w-14 rounded bg-slate-950 px-1 py-0.5 text-center text-xs" />
          <span className="text-[11px] text-slate-400">/ {Math.max(1, maxPage)}</span>
          <button type="button" className="px-2 text-xs" onClick={() => setPageNumber((value) => Math.min(Math.max(1, maxPage), value + 1))}>›</button>
        </div>
        <button type="button" className="rounded bg-white px-3 py-1.5 text-xs font-bold text-slate-900" onClick={onClose}>Đóng</button>
      </header>

      {(baseError || revisionError || analysisError) ? (
        <div className="border-b border-red-900/50 bg-red-950/60 px-4 py-2 text-xs text-red-200">{baseError || revisionError || analysisError}</div>
      ) : null}

      {!revisionFile ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-300">Chọn PDF revision để bắt đầu so sánh.</div>
      ) : mode === "side-by-side" ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-px overflow-auto bg-slate-700">
          <div className="min-w-0 bg-slate-900 p-3"><div className="mb-2 text-xs font-semibold">Hiện tại · trang {safePage}</div><div className="mx-auto max-w-full bg-white"><canvas ref={baseCanvasRef} /></div></div>
          <div className="min-w-0 bg-slate-900 p-3"><div className="mb-2 truncate text-xs font-semibold">{revisionFile.name} · p.{safePage}</div><div className="mx-auto max-w-full bg-white"><canvas ref={revisionCanvasRef} /></div></div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-4">
            <div className="relative mx-auto w-fit max-w-full bg-white shadow-2xl">
              <canvas ref={baseCanvasRef} className="block max-w-full" />
              {mode === "overlay" ? (
                <canvas
                  ref={revisionCanvasRef}
                  className="pointer-events-none absolute inset-0 block max-w-full mix-blend-multiply"
                  style={{ opacity, transform: "translate(" + (-shiftX) + "%," + (-shiftY) + "%)" }}
                />
              ) : (
                <canvas ref={diffCanvasRef} className="pointer-events-none absolute inset-0 block max-w-full" />
              )}
            </div>
            {mode === "overlay" ? (
              <label className="mx-auto mt-3 flex w-fit items-center gap-2 text-xs text-slate-300">
                Revision opacity
                <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
                {Math.round(opacity * 100)}%
              </label>
            ) : null}
          </div>
          {mode === "changes" ? (
            <aside className="w-72 overflow-auto border-l border-white/10 bg-slate-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold">Thay đổi ({regions.length})</span>
                <div className="flex gap-1">
                  <button type="button" className="rounded border border-slate-600 px-2 py-1 text-xs" onClick={() => moveChange(-1)}>Trước</button>
                  <button type="button" className="rounded border border-slate-600 px-2 py-1 text-xs" onClick={() => moveChange(1)}>Sau</button>
                </div>
              </div>
              <div className="mb-3 text-[11px] text-slate-400">Alignment: {alignment.dx}px, {alignment.dy}px · score {alignment.score.toFixed(1)}</div>
              {regions.length === 0 ? <p className="text-xs text-slate-400">Chưa phát hiện vùng thay đổi.</p> : regions.map((region, index) => (
                <button key={region.id} type="button" onClick={() => setActiveChange(index)} className={"mb-1 w-full rounded border px-2 py-2 text-left text-xs " + (index === activeChange ? "border-red-400 bg-red-950/50" : "border-slate-700 bg-slate-900")}>
                  <div className="font-semibold">Change {index + 1}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">x {(region.x * 100).toFixed(1)}% · y {(region.y * 100).toFixed(1)}% · score {region.score.toFixed(1)}</div>
                </button>
              ))}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
