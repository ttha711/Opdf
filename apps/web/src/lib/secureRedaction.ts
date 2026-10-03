import { PDFDocument } from "pdf-lib";
import { getDocument, GlobalWorkerOptions, Util, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export type PdfSource = Blob | Uint8Array | null;

export type TextRedactionMatch = {
  id: string;
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function toBlob(source: PdfSource): Blob | null {
  if (!source) return null;
  if (source instanceof Blob) return source;
  return new Blob([source as unknown as BlobPart], { type: "application/pdf" });
}

async function withPdf<T>(source: PdfSource, action: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const blob = toBlob(source);
  if (!blob) throw new Error("No PDF source loaded");
  const url = URL.createObjectURL(blob);
  const task = getDocument({ url });
  try {
    const pdf = await task.promise;
    try {
      return await action(pdf);
    } finally {
      await pdf.destroy();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function findTextRedactionMatches(
  source: PdfSource,
  query: string,
  onProgress?: (page: number, total: number) => void,
): Promise<TextRedactionMatch[]> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  return withPdf(source, async (pdf) => {
    const matches: TextRedactionMatch[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress?.(pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        for (let index = 0; index < textContent.items.length; index += 1) {
          const item = textContent.items[index] as any;
          const text = String(item.str || "");
          if (!text.toLocaleLowerCase().includes(needle)) continue;
          const tx = Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.max(1, Math.hypot(tx[2], tx[3]));
          const left = tx[4];
          const top = tx[5] - fontHeight;
          const width = Math.max(2, Number(item.width || 0) * viewport.scale);
          const height = Math.max(2, fontHeight);
          matches.push({
            id: "p" + pageNumber + "-t" + index,
            page: pageNumber,
            text,
            x: Math.max(0, Math.min(1, left / viewport.width)),
            y: Math.max(0, Math.min(1, top / viewport.height)),
            width: Math.max(0.002, Math.min(1, width / viewport.width)),
            height: Math.max(0.002, Math.min(1, height / viewport.height)),
          });
        }
      } finally {
        page.cleanup();
      }
    }
    return matches;
  });
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Failed to encode redacted page"));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

export async function applySecureRasterRedactions(
  source: PdfSource,
  matches: TextRedactionMatch[],
  onProgress?: (page: number, total: number) => void,
): Promise<Uint8Array> {
  const blob = toBlob(source);
  if (!blob) throw new Error("No PDF source loaded");
  if (matches.length === 0) throw new Error("No redactions selected");

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const original = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const byPage = new Map<number, TextRedactionMatch[]>();
  matches.forEach((match) => {
    const current = byPage.get(match.page) ?? [];
    current.push(match);
    byPage.set(match.page, current);
  });

  const url = URL.createObjectURL(blob);
  const task = getDocument({ url });
  const renderPdf = await task.promise;
  try {
    for (let pageIndex = 0; pageIndex < original.getPageCount(); pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      onProgress?.(pageNumber, original.getPageCount());
      const pageMatches = byPage.get(pageNumber);
      if (!pageMatches?.length) {
        const [copied] = await output.copyPages(original, [pageIndex]);
        output.addPage(copied);
        continue;
      }

      const pdfPage = await renderPdf.getPage(pageNumber);
      try {
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const maxPixels = 12_000_000;
        const renderScale = Math.min(
          2,
          Math.max(0.75, Math.sqrt(maxPixels / Math.max(1, baseViewport.width * baseViewport.height))),
        );
        const viewport = pdfPage.getViewport({ scale: renderScale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: context, viewport }).promise;

        for (const match of pageMatches) {
          const pad = Math.max(2, Math.round(canvas.width * 0.0015));
          context.fillStyle = "#000000";
          context.fillRect(
            Math.max(0, match.x * canvas.width - pad),
            Math.max(0, match.y * canvas.height - pad),
            Math.min(canvas.width, match.width * canvas.width + pad * 2),
            Math.min(canvas.height, match.height * canvas.height + pad * 2),
          );
        }

        const png = await output.embedPng(await canvasToPngBytes(canvas));
        const reportPage = output.addPage([baseViewport.width, baseViewport.height]);
        reportPage.drawImage(png, {
          x: 0,
          y: 0,
          width: baseViewport.width,
          height: baseViewport.height,
        });
      } finally {
        pdfPage.cleanup();
      }
    }
  } finally {
    await renderPdf.destroy();
    URL.revokeObjectURL(url);
  }

  return output.save();
}
