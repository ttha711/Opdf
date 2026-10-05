import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OcrJob } from "../types/index.js";

export type OcrRenderedPage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type SearchablePdfOcrOptions = {
  getNativeText?: (pageIndex: number) => Promise<string>;
  renderPage: (pageIndex: number) => Promise<OcrRenderedPage>;
  onProgress?: (progress: number) => void;
  isCancelled?: () => boolean;
};

type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

function collectWords(data: any): OcrWord[] {
  if (Array.isArray(data?.words)) return data.words;
  const words: OcrWord[] = [];
  for (const block of data?.blocks ?? []) {
    for (const paragraph of block?.paragraphs ?? []) {
      for (const line of paragraph?.lines ?? []) {
        for (const word of line?.words ?? []) words.push(word);
      }
    }
  }
  return words;
}

export class OcrService {
  private readonly jobs = new Map<string, OcrJob>();
  private unicodeFontCache: Uint8Array | null = null;

  enqueue(filePath: string, language = "eng+vie"): OcrJob {
    const job: OcrJob = {
      id: randomUUID(),
      filePath,
      language,
      status: "queued",
      progress: 0,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  list(): OcrJob[] {
    return [...this.jobs.values()];
  }

  get(id: string): OcrJob | null {
    return this.jobs.get(id) ?? null;
  }

  cancel(id: string): OcrJob | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.status !== "done" && job.status !== "failed") {
      job.status = "cancelled";
    }
    return job;
  }

  async run(
    id: string,
    pdfBytes?: Uint8Array,
    options?: SearchablePdfOcrOptions,
  ): Promise<OcrJob | null> {
    const job = this.jobs.get(id);
    if (!job || job.status === "cancelled") return job ?? null;
    if (!pdfBytes?.length || !options) {
      job.status = "failed";
      job.error = "OCR requires PDF bytes and a page renderer.";
      return job;
    }

    job.status = "running";
    job.progress = 1;
    job.error = undefined;
    job.outputBytes = undefined;

    try {
      job.outputBytes = await this.createSearchablePdf(pdfBytes, job.language, {
        ...options,
        onProgress: (progress) => {
          job.progress = progress;
          options.onProgress?.(progress);
        },
        isCancelled: () => job.status === "cancelled" || Boolean(options.isCancelled?.()),
      });
      if (job.status !== "cancelled") {
        job.progress = 100;
        job.status = "done";
      }
    } catch (error) {
      if (job.status !== "cancelled") {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "OCR failed";
      }
    }
    return job;
  }

  private async loadUnicodeFontBytes(): Promise<Uint8Array | null> {
    if (this.unicodeFontCache) return this.unicodeFontCache;
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      const fontPath = resolve(here, "../assets/VietnameseFont.ttf");
      this.unicodeFontCache = new Uint8Array(await readFile(fontPath));
      return this.unicodeFontCache;
    } catch {
      return null;
    }
  }

  private toWinAnsiSafeText(value: unknown): string {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7E]/g, "");
  }

  private async createSearchablePdf(
    pdfBytes: Uint8Array,
    language: string,
    options: SearchablePdfOcrOptions,
  ): Promise<Uint8Array> {
    const pdfLib = await import("pdf-lib");
    const fontkitModule = await import("@pdf-lib/fontkit");
    const fontkit = (fontkitModule as any).default ?? fontkitModule;
    const doc = await pdfLib.PDFDocument.load(pdfBytes, { updateMetadata: false });
    doc.registerFontkit(fontkit);

    const unicodeFontBytes = await this.loadUnicodeFontBytes();
    const font = unicodeFontBytes
      ? await doc.embedFont(unicodeFontBytes, { subset: true })
      : await doc.embedFont(pdfLib.StandardFonts.Helvetica);
    const supportsUnicode = Boolean(unicodeFontBytes);

    let worker: any = null;
    const languageCandidates = Array.from(new Set([language, "eng"].filter(Boolean)));
    const ensureWorker = async () => {
      if (worker) return worker;
      const Tesseract = await import("tesseract.js");
      let workerInitError: unknown = null;
      for (const candidate of languageCandidates) {
        try {
          worker = await Tesseract.createWorker(candidate);
          await worker.setParameters({
            tessedit_pageseg_mode: "6",
            preserve_interword_spaces: "1",
          } as any);
          return worker;
        } catch (error) {
          workerInitError = error;
          if (worker) {
            try { await worker.terminate(); } catch {}
          }
          worker = null;
        }
      }
      throw new Error(
        `Unable to initialize OCR worker for languages: ${languageCandidates.join(", ")}. ${workerInitError instanceof Error ? workerInitError.message : ""}`.trim(),
      );
    };

    const pages = doc.getPages();
    try {
      for (let index = 0; index < pages.length; index += 1) {
        if (options.isCancelled?.()) throw new Error("OCR cancelled.");

        const nativeText = options.getNativeText
          ? await options.getNativeText(index)
          : "";
        if (nativeText.trim()) {
          options.onProgress?.(Math.max(2, Math.round(((index + 1) / pages.length) * 96)));
          continue;
        }

        const rendered = await options.renderPage(index);
        const ocrWorker = await ensureWorker();
        const result = await ocrWorker.recognize(rendered.bytes);
        const data = result?.data ?? {};
        const words = collectWords(data);
        const targetPage = pages[index];
        const { width: pdfWidth, height: pdfHeight } = targetPage.getSize();
        const sx = pdfWidth / Math.max(1, rendered.width);
        const sy = pdfHeight / Math.max(1, rendered.height);

        for (const word of words) {
          const rawText = String(word?.text ?? "").trim();
          if (!rawText) continue;
          const confidence = Number(word?.confidence ?? (word as any)?.conf ?? 0);
          if (confidence > 0 && confidence < 45) continue;
          const text = supportsUnicode ? rawText : this.toWinAnsiSafeText(rawText);
          if (!text) continue;

          const bbox = word.bbox;
          const x = Math.max(0, Number(bbox?.x0 ?? 0) * sx);
          const y = Math.max(0, pdfHeight - Number(bbox?.y1 ?? 0) * sy);
          const boxWidth = Math.max(1, (Number(bbox?.x1 ?? 0) - Number(bbox?.x0 ?? 0)) * sx);
          const boxHeight = Math.max(1, (Number(bbox?.y1 ?? 0) - Number(bbox?.y0 ?? 0)) * sy);
          const fontSize = Math.max(5, Math.min(72, boxHeight * 0.9));

          targetPage.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: pdfLib.rgb(1, 1, 1),
            opacity: 0.01,
            maxWidth: Math.max(boxWidth, font.widthOfTextAtSize(text, fontSize)),
          });
        }

        if (words.length === 0 && typeof data.text === "string" && data.text.trim()) {
          const lines = data.text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
          lines.slice(0, 160).forEach((line: string, lineIndex: number) => {
            const text = supportsUnicode ? line : this.toWinAnsiSafeText(line);
            if (!text) return;
            targetPage.drawText(text, {
              x: 18,
              y: Math.max(18, pdfHeight - 28 - lineIndex * 8),
              size: 6,
              font,
              color: pdfLib.rgb(1, 1, 1),
              opacity: 0.01,
              maxWidth: Math.max(1, pdfWidth - 36),
            });
          });
        }

        options.onProgress?.(Math.max(2, Math.round(((index + 1) / pages.length) * 96)));
      }
    } finally {
      await worker?.terminate?.().catch(() => {});
    }

    if (options.isCancelled?.()) throw new Error("OCR cancelled.");
    options.onProgress?.(98);
    return doc.save({ useObjectStreams: true, addDefaultPage: false });
  }
}
