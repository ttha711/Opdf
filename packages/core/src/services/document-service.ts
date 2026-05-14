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
    
    // Write the buffer to the virtual filesystem
    qpdf.FS.writeFile("/input.pdf", pdfBytes);
    
    // Run QPDF to linearize and compress
    qpdf.callMain(["--linearize", "--optimize-images", "/input.pdf", "/output.pdf"]);
    
    // Read the optimized file
    const outputBytes = qpdf.FS.readFile("/output.pdf");
    
    // Clean up
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

  createTempName(prefix = "opdf"): string {
    return `${prefix}-${randomUUID()}.pdf`;
  }
}