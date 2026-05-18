import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  OpenDocumentResult,
  PasswordOptions,
  PageNumbers,
  HeaderFooterLine,
  CropOptions,
  InsertOptions,
  Bookmark as BookmarkType,
} from "../types/index.js";

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

  async exportFlattened(pdfBytes: Uint8Array, annotations: any[] = []): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();

    for (const ann of annotations) {
      const pageIndex = ann.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      
      const payload = ann.payload;
      const uiX = payload.x || 0;
      const uiY = payload.y || 0;
      const uiW = payload.width || 0.1;
      const uiH = payload.height || 0.05;

      const x = uiX * width;
      const objW = uiW * width;
      const objH = uiH * height;
      const y = height - (uiY * height) - objH;

      if (ann.kind === "highlight") {
        page.drawRectangle({
          x, y, width: objW, height: objH,
          color: module.rgb(1, 0.8, 0.1),
          opacity: 0.4
        });
      } else if (ann.kind === "note") {
        page.drawText(payload.text || "Note", {
          x, y: y + objH - 16, size: 16, color: module.rgb(0, 0, 0)
        });
      } else if (ann.kind === "shape") {
        page.drawRectangle({
          x, y, width: objW, height: objH,
          borderColor: module.rgb(1, 0, 0),
          borderWidth: 2
        });
      } else if (ann.kind === "signature") {
        page.drawText(payload.signer || "Signature", {
          x, y: y + objH - 24, size: 24, color: module.rgb(0, 0, 1)
        });
      } else if (ann.kind === "redact") {
        page.drawRectangle({
          x, y, width: objW, height: objH,
          color: module.rgb(0, 0, 0),
          opacity: 1
        });
      }
    }

    return doc.save();
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
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText(text, {
        x: width / 4,
        y: height / 2,
        size: 48,
        color: module.rgb(0.5, 0.5, 0.5),
        opacity: 0.3,
        rotate: module.degrees(45),
      });
    }

    return doc.save();
  }

  /* ========= NEW FEATURES ========= */

  /** Password protect PDF (encrypt) */
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

  /** Remove password protection */
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

  /** Insert pages from another PDF */
  async insertPages(pdfBytes: Uint8Array, opts: InsertOptions): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const source = await module.PDFDocument.load(opts.bytes);
    const copiedPages = await doc.copyPages(source, source.getPageIndices());
    
    let insertAt = opts.targetPage - 1;
    if (opts.position === "after") insertAt += 1;
    
    copiedPages.forEach((page) => doc.insertPage(insertAt++, page));
    return doc.save();
  }

  /** Delete pages by 1-indexed array */
  async deletePages(pdfBytes: Uint8Array, pageNumbers: number[]): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const allPages = doc.getPageIndices();
    const toRemove = new Set(pageNumbers.map((n) => n - 1));
    const keep = allPages.filter((i) => !toRemove.has(i));
    
    if (keep.length === 0) throw new Error("Cannot delete all pages");
    
    const output = await module.PDFDocument.create();
    const copiedPages = await output.copyPages(doc, keep);
    copiedPages.forEach((page) => output.addPage(page));
    return output.save();
  }

  /** Crop a specific page */
  async cropPage(pdfBytes: Uint8Array, opts: CropOptions): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const page = doc.getPage(opts.page - 1);
    const { width, height } = page.getSize();
    
    const x = opts.x * width;
    const y = height - (opts.y * height) - (opts.height * height);
    const cropW = opts.width * width;
    const cropH = opts.height * height;
    
    page.setMediaBox(x, y, cropW, cropH);
    page.setCropBox(x, y, cropW, cropH);
    return doc.save();
  }

  /** Add page numbers to PDF */
  async addPageNumbers(pdfBytes: Uint8Array, opts: PageNumbers): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    const fontSize = opts.fontSize || 12;
    const color = this._parseColor(opts.fontColor || "#000000", module);
    
    const pageStart = Math.max(1, opts.pages?.start ?? 1);
    const pageEnd = Math.min(pages.length, opts.pages?.end ?? pages.length);
    let counter = opts.startNumber ?? 1;

    for (let i = pageStart - 1; i < pageEnd; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const text = `${opts.prefix || ""}${counter}${opts.suffix || ""}`;
      
      const textWidth = fontSize * text.length * 0.45;
      let x = width / 2 - textWidth / 2;
      if (opts.position.includes("left")) x = 40;
      else if (opts.position.includes("right")) x = width - 40 - textWidth;
      
      const y = opts.position.startsWith("top") ? height - 28 : 20;

      page.drawText(text, {
        x, y,
        size: fontSize,
        color,
      });
      counter++;
    }
    return doc.save();
  }

  /** Add header or footer */
  async addHeaderFooter(pdfBytes: Uint8Array, lines: HeaderFooterLine[], isHeader: boolean): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const fontSize = line.fontSize || 10;
        const color = this._parseColor(line.fontColor || "#555555", module);
        
        const textWidth = fontSize * line.text.length * 0.45;
        let x = width / 2 - textWidth / 2;
        if (line.align === "left") x = 40;
        else if (line.align === "right") x = width - 40 - textWidth;

        const y = isHeader 
          ? height - 24 - index * (fontSize + 3) 
          : 18 + index * (fontSize + 3);

        page.drawText(line.text, { x, y, size: fontSize, color });
      }
    }
    return doc.save();
  }

  /** Add bookmarks (outlines) to PDF */
  async addBookmarks(pdfBytes: Uint8Array, bookmarks: BookmarkType[]): Promise<Uint8Array> {
    if (bookmarks.length === 0) {
      return pdfBytes;
    }

    throw new Error("Bookmark outline creation is not supported by the current PDF engine");
  }

  /** Bates numbering: add sequential numbers to each page */
  async addBatesNumbering(
    pdfBytes: Uint8Array,
    prefix: string,
    startNumber: number,
    suffix: string = ""
  ): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    const color = module.rgb(0, 0, 0);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const num = startNumber + i;
      const text = `${prefix}${num.toString().padStart(6, "0")}${suffix}`;
      
      // Bates numbers go at bottom-right corner
      page.drawText(text, {
        x: width - 120,
        y: 20,
        size: 8,
        color,
      });
    }
    return doc.save();
  }

  /** Search and replace text in PDF (for redact search) */
  async searchText(pdfBytes: Uint8Array, query: string): Promise<Array<{ page: number; text: string }>> {
    void pdfBytes;
    void query;
    throw new Error("Text extraction is available in the browser viewer, not in the core Node service");
  }

  /** Convert PDF to PDF/A (basic: embed fonts, no transparency) 
   *  Note: proper PDF/A conversion requires verapdf or similar tool */
  async convertToPdfA(pdfBytes: Uint8Array): Promise<Uint8Array> {
    void pdfBytes;
    throw new Error("PDF/A conversion requires a dedicated validator/converter and is not available in this offline bundle yet");
  }

  /** Rotate page(s) */
  async rotatePages(pdfBytes: Uint8Array, pageNumbers: number[], degrees: number): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    
    for (const pn of pageNumbers) {
      const page = doc.getPage(pn - 1);
      const current = page.getRotation().angle;
      page.setRotation(module.degrees(current + degrees));
    }
    return doc.save();
  }

  private _parseColor(hex: string, module: any) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return module.rgb(r, g, b);
  }

  createTempName(prefix = "opdf"): string {
    return `${prefix}-${randomUUID()}.pdf`;
  }
}
