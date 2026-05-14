import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { OpenDocumentResult } from "../types/index.js";

export class DocumentService {
  async open(filePath: string): Promise<OpenDocumentResult> {
    const bytes = new Uint8Array(await readFile(filePath));
    return { filePath, bytes, openedAt: Date.now() };
  }

  async save(filePath: string, bytes: Uint8Array): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }

  async saveAs(targetPath: string, bytes: Uint8Array): Promise<void> {
    await this.save(targetPath, bytes);
  }

  async merge(pdfBytesList: Uint8Array[]): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const outDoc = await module.PDFDocument.create();

    for (const bytes of pdfBytesList) {
      const source = await module.PDFDocument.load(bytes);
      const copiedPages = await outDoc.copyPages(source, source.getPageIndices());
      copiedPages.forEach((page) => outDoc.addPage(page));
    }

    return outDoc.save();
  }

  async split(pdfBytes: Uint8Array, pageIndexes: number[]): Promise<Uint8Array[]> {
    const module = await import("pdf-lib");
    const source = await module.PDFDocument.load(pdfBytes);
    const out: Uint8Array[] = [];

    for (const index of pageIndexes) {
      const child = await module.PDFDocument.create();
      const [copiedPage] = await child.copyPages(source, [index]);
      child.addPage(copiedPage);
      out.push(await child.save());
    }

    return out;
  }

  async reorder(pdfBytes: Uint8Array, order: number[]): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const source = await module.PDFDocument.load(pdfBytes);
    const output = await module.PDFDocument.create();
    const copiedPages = await output.copyPages(source, order);
    copiedPages.forEach((page) => output.addPage(page));
    return output.save();
  }

  async exportFlattened(pdfBytes: Uint8Array): Promise<Uint8Array> {
    // Placeholder for flattened export pipeline.
    return pdfBytes;
  }

  createTempName(prefix = "opdf"): string {
    return `${prefix}-${randomUUID()}.pdf`;
  }
}