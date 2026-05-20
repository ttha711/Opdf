import { loadPdfLib } from "./pdfHelpers";

export function preprocessCanvasForOcr(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const bin = gray > 190 ? 255 : 0;
    d[i] = bin;
    d[i + 1] = bin;
    d[i + 2] = bin;
  }
  ctx.putImageData(img, 0, 0);
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export async function runBrowserOcrWithTextLayer(
  pdfBytes: Uint8Array,
  language: string,
  onProgress?: (value: number) => void
): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  const Tesseract = await import("tesseract.js");
  const pdfLib = await loadPdfLib();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const sourceBytes = new Uint8Array(pdfBytes);
  const outputBytes = new Uint8Array(pdfBytes);
  const source = await pdfjs.getDocument({ data: sourceBytes }).promise;
  const output = await pdfLib.PDFDocument.load(outputBytes);
  const outPages = output.getPages();
  let worker: any = null;
  const languageCandidates = Array.from(new Set([language, "eng"].filter(Boolean)));
  let workerInitError: unknown = null;
  for (const candidate of languageCandidates) {
    try {
      worker = await Tesseract.createWorker(candidate);
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      } as any);
      break;
    } catch (error) {
      workerInitError = error;
      if (worker) {
        try { await worker.terminate(); } catch {}
      }
      worker = null;
    }
  }
  if (!worker) {
    throw new Error(`Unable to initialize OCR worker for languages: ${languageCandidates.join(", ")}. ${workerInitError instanceof Error ? workerInitError.message : ""}`.trim());
  }
  const totalPages = source.numPages;

  try {
    for (let i = 1; i <= totalPages; i += 1) {
      const page = await source.getPage(i);
      const nativeText = await page.getTextContent();
      const hasNativeText = nativeText.items.some((item) => "str" in item && String((item as any).str || "").trim().length > 0);
      if (hasNativeText) {
        onProgress?.(Math.min(95, Math.round((i / totalPages) * 95)));
        page.cleanup();
        continue;
      }
      const viewport = page.getViewport({ scale: 0.85 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      await page.render({ canvasContext: ctx, viewport }).promise;
      preprocessCanvasForOcr(canvas);
      let data: any;
      try {
        ({ data } = await withTimeout<any>(worker.recognize(canvas), 12000, `OCR timed out on page ${i}`));
      } catch {
        void worker.terminate().catch(() => {});
        worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        } as any);
        onProgress?.(Math.min(95, Math.round((i / totalPages) * 95)));
        page.cleanup();
        continue;
      }
      const words = ((data as any).words as Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>) || [];
      const targetPage = outPages[i - 1];
      const { width: pdfW, height: pdfH } = targetPage.getSize();
      const sx = pdfW / canvas.width;
      const sy = pdfH / canvas.height;

      if (words.length === 0 && typeof (data as any).text === "string" && (data as any).text.trim()) {
        const textLines = (data as any).text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
        textLines.slice(0, 120).forEach((line: string, lineIndex: number) => {
          targetPage.drawText(line, {
            x: 24,
            y: Math.max(24, pdfH - 32 - lineIndex * 9),
            size: 7,
            color: pdfLib.rgb(1, 1, 1),
            opacity: 0.01,
            maxWidth: Math.max(1, pdfW - 48),
          });
        });
      }

      for (const word of words) {
        const text = String(word.text || "").trim();
        if (!text) continue;
        const conf = Number((word as any).confidence ?? 0);
        if (conf > 0 && conf < 45) continue;
        const x0 = word.bbox.x0 * sx;
        const y0 = pdfH - (word.bbox.y1 * sy);
        const boxW = Math.max(1, (word.bbox.x1 - word.bbox.x0) * sx);
        const boxH = Math.max(1, (word.bbox.y1 - word.bbox.y0) * sy);
        const fontSize = Math.max(6, boxH * 0.9);
        const estWidth = Math.max(1, text.length * fontSize * 0.5);
        targetPage.drawText(text, {
          x: x0,
          y: y0,
          size: fontSize,
          color: pdfLib.rgb(1, 1, 1),
          opacity: 0.01,
          maxWidth: Math.max(boxW, estWidth),
        });
      }

      onProgress?.(Math.min(95, Math.round((i / totalPages) * 95)));
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    source.destroy();
  }

  onProgress?.(100);
  return output.save();
}
