import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  Bookmark,
  CropOptions,
  HeaderFooterLine,
  InsertOptions,
  OpenDocumentResult,
  PageNumbers,
  PasswordOptions,
} from "../types/index.js";
import { PdfFlattenService } from "./pdf-flatten-service.js";
import { PdfFontSupport } from "./pdf-font-support.js";
import { PdfStructureService } from "./pdf-structure-service.js";
import { PdfTextMarkupService } from "./pdf-text-markup-service.js";

export class DocumentService {
  private readonly fontSupport = new PdfFontSupport();
  private readonly flattenService = new PdfFlattenService(this.fontSupport);
  private readonly structureService = new PdfStructureService();
  private readonly textMarkupService = new PdfTextMarkupService(this.fontSupport);

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
    return this.structureService.merge(pdfBytesList);
  }

  async split(pdfBytes: Uint8Array, pageIndexes: number[]): Promise<Uint8Array[]> {
    return this.structureService.split(pdfBytes, pageIndexes);
  }

  async reorder(pdfBytes: Uint8Array, order: number[]): Promise<Uint8Array> {
    return this.structureService.reorder(pdfBytes, order);
  }

  async exportFlattened(pdfBytes: Uint8Array, annotations: any[] = []): Promise<Uint8Array> {
    return this.flattenService.exportFlattened(pdfBytes, annotations);
  }

  async compressPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const qpdfWasm = await import("@neslinesli93/qpdf-wasm");
    const loadWasm = (qpdfWasm as any).default || qpdfWasm;
    const qpdf = await loadWasm();

    qpdf.FS.writeFile("/input.pdf", pdfBytes);
    qpdf.callMain(["--linearize", "--optimize-images", "/input.pdf", "/output.pdf"]);
    const outputBytes = qpdf.FS.readFile("/output.pdf");
    qpdf.FS.unlink("/input.pdf");
    qpdf.FS.unlink("/output.pdf");
    return outputBytes;
  }

  async watermarkPdf(pdfBytes: Uint8Array, text: string): Promise<Uint8Array> {
    return this.textMarkupService.watermarkPdf(pdfBytes, text);
  }

  async encryptPdf(pdfBytes: Uint8Array, opts: PasswordOptions): Promise<Uint8Array> {
    const userPassword = opts.userPassword?.trim();
    const ownerPassword = (opts.ownerPassword || opts.userPassword)?.trim();
    if (!userPassword || !ownerPassword) {
      throw new Error("Both user and owner passwords are required to encrypt a PDF");
    }

    const qpdfWasm = await import("@neslinesli93/qpdf-wasm");
    const loadWasm = (qpdfWasm as any).default || qpdfWasm;
    const qpdf = await loadWasm();

    qpdf.FS.writeFile("/input.pdf", pdfBytes);
    qpdf.callMain(["--encrypt", userPassword, ownerPassword, "256", "--", "/input.pdf", "/output.pdf"]);
    const outputBytes = qpdf.FS.readFile("/output.pdf");
    qpdf.FS.unlink("/input.pdf");
    qpdf.FS.unlink("/output.pdf");
    return outputBytes;
  }

  async decryptPdf(pdfBytes: Uint8Array, password: string): Promise<Uint8Array> {
    const qpdfWasm = await import("@neslinesli93/qpdf-wasm");
    const loadWasm = (qpdfWasm as any).default || qpdfWasm;
    const qpdf = await loadWasm();

    qpdf.FS.writeFile("/input.pdf", pdfBytes);
    qpdf.callMain([`--password=${password}`, "--decrypt", "/input.pdf", "/output.pdf"]);
    const outputBytes = qpdf.FS.readFile("/output.pdf");
    qpdf.FS.unlink("/input.pdf");
    qpdf.FS.unlink("/output.pdf");
    return outputBytes;
  }

  async insertPages(pdfBytes: Uint8Array, opts: InsertOptions): Promise<Uint8Array> {
    return this.structureService.insertPages(pdfBytes, opts);
  }

  async deletePages(pdfBytes: Uint8Array, pageNumbers: number[]): Promise<Uint8Array> {
    return this.structureService.deletePages(pdfBytes, pageNumbers);
  }

  async cropPage(pdfBytes: Uint8Array, opts: CropOptions): Promise<Uint8Array> {
    return this.structureService.cropPage(pdfBytes, opts);
  }

  async addPageNumbers(pdfBytes: Uint8Array, opts: PageNumbers): Promise<Uint8Array> {
    return this.textMarkupService.addPageNumbers(pdfBytes, opts);
  }

  async addHeaderFooter(
    pdfBytes: Uint8Array,
    lines: HeaderFooterLine[],
    isHeader: boolean,
  ): Promise<Uint8Array> {
    return this.textMarkupService.addHeaderFooter(pdfBytes, lines, isHeader);
  }

  async addBookmarks(pdfBytes: Uint8Array, bookmarks: Bookmark[]): Promise<Uint8Array> {
    return this.structureService.addBookmarks(pdfBytes, bookmarks);
  }

  async addBatesNumbering(
    pdfBytes: Uint8Array,
    prefix: string,
    startNumber: number,
    suffix = "",
  ): Promise<Uint8Array> {
    return this.textMarkupService.addBatesNumbering(pdfBytes, prefix, startNumber, suffix);
  }

  async searchText(pdfBytes: Uint8Array, query: string): Promise<Array<{ page: number; text: string }>> {
    void pdfBytes;
    void query;
    throw new Error("Text extraction is available in the browser viewer, not in the core Node service");
  }

  async convertToPdfA(pdfBytes: Uint8Array): Promise<Uint8Array> {
    void pdfBytes;
    throw new Error("PDF/A conversion requires a dedicated validator/converter and is not available in this offline bundle yet");
  }

  async rotatePages(pdfBytes: Uint8Array, pageNumbers: number[], degrees: number): Promise<Uint8Array> {
    return this.structureService.rotatePages(pdfBytes, pageNumbers, degrees);
  }

  createTempName(prefix = "opdf"): string {
    return `${prefix}-${randomUUID()}.pdf`;
  }
}
