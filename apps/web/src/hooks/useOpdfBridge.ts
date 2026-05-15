import { useMemo } from "react";
import type {
  Annotation, AnnotationCreateInput, OcrJob, OpenDocumentResult,
  RecentDocument, SessionSnapshot, PasswordOptions, PageNumbers,
  HeaderFooterLine, CropOptions, InsertOptions,
} from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";

async function loadPdfLib() {
  return import("pdf-lib");
}

function parseColor(hex: string, pdfLib: any) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return pdfLib.rgb(0, 0, 0);
  const value = match[1];
  return pdfLib.rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

function createMockBridge(): OpdfBridge {
  let recents: RecentDocument[] = [];
  let session: SessionSnapshot = {
    activeFilePath: null,
    openTabs: [],
    activeTabIndex: 0,
    updatedAt: Date.now(),
  };
  const annotations = new Map<string, Annotation[]>();
  const ocrJobs = new Map<string, OcrJob>();

  return {
    async openProjectFolder() { return false; },
    async pickAndOpenDocument() { return null; },
    async openDocument(_filePath: string): Promise<OpenDocumentResult> {
      throw new Error("openDocument requires desktop runtime. Use local file input in web dev.");
    },
    async saveDocument() {},
    async exportFlattened(bytes: Uint8Array, _annotations: any[]) {
      console.log("[MockBridge] exportFlattened", bytes.length);
      return bytes;
    },
    async compressPdf(bytes) {
      console.log("[MockBridge] compressPdf", bytes.length);
      return bytes;
    },
    async watermarkPdf(bytes, text) {
      console.log("[MockBridge] watermarkPdf", bytes.length, text);
      return bytes;
    },
    async mergePdfs(bytesList) {
      console.log("[MockBridge] mergePdfs", bytesList.length);
      return bytesList[0];
    },
    async splitPdf(bytes, pages) {
      console.log("[MockBridge] splitPdf", bytes.length, pages);
      return [bytes];
    },
    async saveDocumentAs() { return null; },
    async getRecent() { return recents; },
    async pushRecent(filePath) {
      recents = [{ filePath, openedAt: Date.now() }, ...recents.filter((r) => r.filePath !== filePath)];
    },
    async restoreSession() { return session; },
    async writeSession(nextSession) { session = nextSession; },
    async listAnnotations(documentId) { return annotations.get(documentId) ?? []; },
    async createAnnotation(documentId, input: AnnotationCreateInput) {
      const next: Annotation = {
        id: crypto.randomUUID(),
        kind: input.kind,
        page: input.page,
        payload: input.payload,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const current = annotations.get(documentId) ?? [];
      annotations.set(documentId, [...current, next]);
      return next;
    },
    async deleteAnnotation(documentId, id) {
      const current = annotations.get(documentId) ?? [];
      annotations.set(documentId, current.filter((a) => a.id !== id));
      return current.some((a) => a.id === id);
    },
    async undoAnnotation(documentId) { return annotations.get(documentId) ?? []; },
    async redoAnnotation(documentId) { return annotations.get(documentId) ?? []; },
    async enqueueOcr(filePath, language = "eng+vie") {
      const job: OcrJob = { id: crypto.randomUUID(), filePath, language, status: "queued", progress: 0 };
      ocrJobs.set(job.id, job);
      return job;
    },
    async runOcr(jobId) {
      const job = ocrJobs.get(jobId);
      if (!job) return null;
      job.status = "done"; job.progress = 100; job.outputPath = job.filePath;
      return job;
    },
    async listOcrJobs() { return [...ocrJobs.values()]; },

    /* ----- NEW MOCK BRIDGE ----- */
    async encryptPdf(_bytes, _opts: PasswordOptions) {
      throw new Error("Password encryption requires the desktop runtime.");
    },
    async decryptPdf(_bytes, _password: string) {
      throw new Error("Password decryption requires the desktop runtime.");
    },
    async insertPages(bytes, opts: InsertOptions) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const source = await pdfLib.PDFDocument.load(opts.bytes);
      const copiedPages = await doc.copyPages(source, source.getPageIndices());
      let insertAt = Math.max(0, Math.min(doc.getPageCount(), opts.targetPage - 1 + (opts.position === "after" ? 1 : 0)));
      copiedPages.forEach((page) => doc.insertPage(insertAt++, page));
      return doc.save();
    },
    async deletePages(bytes, pageNumbers: number[]) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const toRemove = new Set(pageNumbers.map((n) => n - 1));
      const keep = doc.getPageIndices().filter((index) => !toRemove.has(index));
      if (keep.length === 0) throw new Error("Cannot delete all pages");
      const output = await pdfLib.PDFDocument.create();
      const copiedPages = await output.copyPages(doc, keep);
      copiedPages.forEach((page) => output.addPage(page));
      return output.save();
    },
    async cropPage(bytes, opts: CropOptions) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const page = doc.getPage(opts.page - 1);
      const { width, height } = page.getSize();
      const x = opts.x * width;
      const y = height - opts.y * height - opts.height * height;
      page.setMediaBox(x, y, opts.width * width, opts.height * height);
      page.setCropBox(x, y, opts.width * width, opts.height * height);
      return doc.save();
    },
    async addPageNumbers(bytes, opts: PageNumbers) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const pages = doc.getPages();
      const color = parseColor(opts.fontColor || "#000000", pdfLib);
      const start = Math.max(1, opts.pages?.start ?? 1);
      const end = Math.min(pages.length, opts.pages?.end ?? pages.length);
      let counter = opts.startNumber ?? 1;
      for (let i = start - 1; i < end; i += 1) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const text = `${opts.prefix || ""}${counter}${opts.suffix || ""}`;
        const textWidth = (opts.fontSize || 12) * text.length * 0.45;
        let x = width / 2 - textWidth / 2;
        if (opts.position.includes("left")) x = 40;
        if (opts.position.includes("right")) x = width - 40 - textWidth;
        const y = opts.position.startsWith("top") ? height - 28 : 20;
        page.drawText(text, { x, y, size: opts.fontSize || 12, color });
        counter += 1;
      }
      return doc.save();
    },
    async addHeaderFooter(bytes, lines: HeaderFooterLine[], isHeader: boolean) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const fontSize = line.fontSize || 10;
          const textWidth = fontSize * line.text.length * 0.45;
          let x = width / 2 - textWidth / 2;
          if (line.align === "left") x = 40;
          if (line.align === "right") x = width - 40 - textWidth;
          const y = isHeader ? height - 24 - index * (fontSize + 3) : 18 + index * (fontSize + 3);
          page.drawText(line.text, { x, y, size: fontSize, color: parseColor(line.fontColor || "#555555", pdfLib) });
        }
      }
      return doc.save();
    },
    async addBookmarks(_bytes, _bookmarks) {
      throw new Error("Bookmark outline creation requires a desktop PDF engine that is not bundled yet.");
    },
    async addBatesNumbering(bytes, prefix: string, startNumber: number, suffix = "") {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const pages = doc.getPages();
      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        const { width } = page.getSize();
        const text = `${prefix}${String(startNumber + i).padStart(6, "0")}${suffix}`;
        page.drawText(text, { x: width - 130, y: 20, size: 8, color: pdfLib.rgb(0, 0, 0) });
      }
      return doc.save();
    },
    async convertToPdfA(_bytes) {
      throw new Error("PDF/A conversion is not available in the browser runtime.");
    },
    async rotatePages(bytes, pageNumbers: number[], degrees: number) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      for (const pageNumber of pageNumbers) {
        const page = doc.getPage(pageNumber - 1);
        page.setRotation(pdfLib.degrees(page.getRotation().angle + degrees));
      }
      return doc.save();
    },
  };
}

export function useOpdfBridge(): OpdfBridge {
  return useMemo(() => window.opdf ?? createMockBridge(), []);
}
