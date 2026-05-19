import type { OcrJob } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import type { DocumentTool } from "../lib/document-tools";
import { parsePageList, pickBrowserPdfBytes } from "../lib/document-tools";
import { useOpdfBridge } from "./useOpdfBridge";

export type MarkupTool = "page-numbers" | "header" | "footer" | "bates";

export type MarkupOptions = {
  position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  align?: "left" | "center" | "right";
  text?: string;
  prefix?: string;
  suffix?: string;
  startNumber?: number;
  digits?: number;
  fontSize?: number;
  fontColor?: string;
  pageStart?: number;
  pageEnd?: number;
};

export type DocumentToolOptions = {
  pages?: string | number[];
  marginPercent?: number;
  password?: string;
  targetPage?: number;
  position?: "before" | "after";
  bytes?: Uint8Array;
};

export type WatermarkOptions = {
  text: string;
  fontSize?: number;
  color?: string;
  opacity?: number;
  rotation?: number;
};

export function useDocumentActions({
  bridge,
  hasDocument,
  hasDesktopBridge,
  fileName,
  docBytes,
  page,
  totalPages,
  thumbnails,
  annotations,
  documentTool,
  replaceDocumentBytes,
  setDocBytes,
  setPage,
  setOcrJobs,
  setViewerError,
  setShowSplitModal,
  setShowMergeModal,
  setShowInsertModal,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  hasDocument: boolean;
  hasDesktopBridge: boolean;
  fileName: string;
  docBytes: Uint8Array | null;
  page: number;
  totalPages: number;
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  annotations: any[];
  documentTool: DocumentTool;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setOcrJobs: Dispatch<SetStateAction<OcrJob[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setShowSplitModal?: (v: boolean) => void;
  setShowMergeModal?: (v: boolean) => void;
  setShowInsertModal?: (v: boolean) => void;
}) {
  function isLikelyPdf(bytes: Uint8Array): boolean {
    if (!bytes || bytes.length < 5) return false;
    return (
      bytes[0] === 0x25 && // %
      bytes[1] === 0x50 && // P
      bytes[2] === 0x44 && // D
      bytes[3] === 0x46 && // F
      bytes[4] === 0x2d // -
    );
  }

  function clonePdfBytes(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
  }

  async function isParseablePdf(bytes: Uint8Array): Promise<boolean> {
    try {
      const pdfjs = await import("pdfjs-dist");
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      const doc = await pdfjs.getDocument({ data: clonePdfBytes(bytes) }).promise;
      const ok = doc.numPages > 0;
      doc.destroy();
      return ok;
    } catch {
      return false;
    }
  }

  async function runOcr() {
    if (!fileName) return;
    try {
      let sourceBytes = docBytes;
      if (!sourceBytes || sourceBytes.length === 0) {
        const picked = await pickBrowserPdfBytes();
        if (!picked || picked.length === 0) {
          throw new Error("No document bytes loaded for OCR.");
        }
        sourceBytes = picked;
        setDocBytes(picked);
      }
      if (!isLikelyPdf(sourceBytes) || !(await isParseablePdf(sourceBytes))) {
        throw new Error("Current document bytes are not a valid PDF input for OCR.");
      }
      setViewerError("Running OCR...");
      const job = await bridge.enqueueOcr(fileName, "eng");
      const ocrInput = clonePdfBytes(sourceBytes);
      const result = await bridge.runOcr(job.id, ocrInput);
      setOcrJobs(await bridge.listOcrJobs());
      if (!result) {
        throw new Error("OCR job not found");
      }
      if (result.status === "failed") {
        throw new Error(result.error || "OCR failed");
      }
      if (result.outputBytes && result.outputBytes.length > 0) {
        if (!isLikelyPdf(result.outputBytes)) {
          throw new Error("OCR output is invalid (not a PDF).");
        }
        if (!(await isParseablePdf(result.outputBytes))) {
          throw new Error("OCR output PDF is corrupted and cannot be opened.");
        }
        const outputBytes = clonePdfBytes(result.outputBytes);
        replaceDocumentBytes(outputBytes, page);
        if (hasDesktopBridge) {
          await bridge.saveDocumentAs(outputBytes);
        } else {
          const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
          const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
          const blob = new Blob([clonePdfBytes(outputBytes) as unknown as BlobPart], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `ocr-${finalName}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
      setViewerError("OCR complete. Searchable PDF has been created.");
      setTimeout(() => setViewerError(null), 3000);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "OCR failed");
    }
  }

  async function exportPdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      const flattenedBytes = await bridge.exportFlattened(docBytes, annotations);
      if (hasDesktopBridge) {
        await bridge.saveDocumentAs(flattenedBytes);
      } else {
        // Try to use File System Access API for a real "Save As" experience
        if ("showSaveFilePicker" in window) {
          try {
            const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
            const suggestedName = baseName.toLowerCase().endsWith(".pdf") ? `edited-${baseName}` : `edited-${baseName}.pdf`;
            
            const handle = await (window as any).showSaveFilePicker({
              suggestedName,
              types: [{
                description: "PDF Document",
                accept: { "application/pdf": [".pdf"] },
              }],
            });
            const writable = await handle.createWritable();
            await writable.write(flattenedBytes);
            await writable.close();
            setViewerError("File saved successfully!");
            setTimeout(() => setViewerError(null), 3000);
            return;
          } catch (err: any) {
            // If user cancels, just return
            if (err.name === "AbortError") return;
            console.error("Save Picker failed, falling back to download", err);
          }
        }

        // Fallback for browsers that don't support showSaveFilePicker
        const blob = new Blob([flattenedBytes as unknown as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
        const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
        a.download = `edited-${finalName}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      setViewerError("Failed to export PDF.");
    }
  }

  async function compressDocument() {
    if (!docBytes || !fileName) return;
    try {
      setViewerError("Compressing... (this may take a few seconds)");
      const compressed = await bridge.compressPdf(docBytes);
      setDocBytes(compressed);
      setViewerError("Compression complete!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Compression failed: " + err);
    }
  }

  async function addWatermark() {
    if (!docBytes) return;
    const text = prompt("Enter watermark text:", "CONFIDENTIAL");
    if (!text) return;
    try {
      const watermarked = await bridge.watermarkPdf(docBytes, text);
      setDocBytes(watermarked);
    } catch (err) {
      setViewerError("Watermark failed: " + err);
    }
  }

  async function mergeDocuments() {
    if (!docBytes) return;
    if (setShowMergeModal) {
      setShowMergeModal(true);
    }
  }

  async function splitDocument() {
    if (!docBytes || !fileName) return;
    if (setShowSplitModal) {
      setShowSplitModal(true);
    }
  }

  async function convertToImages() {
    if (!fileName || thumbnails.length === 0) {
      alert("Please wait for all pages to finish rendering before converting.");
      return;
    }
    try {
      setViewerError("Zipping images...");
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};
      for (const thumb of thumbnails) {
        const buf = await thumb.blob.arrayBuffer();
        zipData[`page-${thumb.page}.jpg`] = new Uint8Array(buf);
      }
      const zipped = zipSync(zipData);
      const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-images.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setViewerError(null);
    } catch (err) {
      setViewerError("Failed to convert: " + err);
    }
  }

  async function runDocumentTool(tool?: DocumentTool) {
    if (!docBytes || !fileName) return;
    const activeTool = tool || documentTool;
    try {
      if (activeTool === "delete-pages") {
        const input = prompt("Pages to delete (example: 2,4-6):", String(page));
        if (!input) return;
        const pages = parsePageList(input, totalPages);
        if (pages.length === 0) throw new Error("No valid pages selected");
        const next = await bridge.deletePages(docBytes, pages);
        replaceDocumentBytes(next, Math.min(page, totalPages - pages.length));
        return;
      }
      if (activeTool === "insert-pdf") {
        if (setShowInsertModal) {
          setShowInsertModal(true);
        }
        return;
      }
      if (activeTool === "crop-current") {
        const marginInput = prompt("Crop margin percent from each edge (0-45):", "5");
        if (!marginInput) return;
        const margin = Math.min(45, Math.max(0, Number(marginInput))) / 100;
        const next = await bridge.cropPage(docBytes, { page, x: margin, y: margin, width: 1 - margin * 2, height: 1 - margin * 2 });
        replaceDocumentBytes(next, page);
        return;
      }
      if (activeTool === "page-numbers") {
        const prefix = prompt("Page number prefix:", "Page ");
        if (prefix === null) return;
        const next = await bridge.addPageNumbers(docBytes, { position: "bottom-center", startNumber: 1, fontSize: 11, fontColor: "#111827", prefix });
        replaceDocumentBytes(next, page);
        return;
      }
      if (activeTool === "header" || activeTool === "footer") {
        const text = prompt(activeTool === "header" ? "Header text:" : "Footer text:", fileName);
        if (!text) return;
        const next = await bridge.addHeaderFooter(docBytes, [{ align: "center", text, fontSize: 10, fontColor: "#374151" }], activeTool === "header");
        replaceDocumentBytes(next, page);
        return;
      }
      if (activeTool === "bates") {
        const prefix = prompt("Bates prefix:", "OPDF-");
        if (prefix === null) return;
        const startInput = prompt("Start number:", "1");
        if (!startInput) return;
        const startNumber = Number(startInput);
        if (!Number.isInteger(startNumber) || startNumber < 0) throw new Error("Invalid start number");
        const next = await bridge.addBatesNumbering(docBytes, prefix, startNumber);
        replaceDocumentBytes(next, page);
        return;
      }
      if (activeTool === "encrypt") {
        const password = prompt("New PDF password:");
        if (!password) return;
        const next = await bridge.encryptPdf(docBytes, { userPassword: password, ownerPassword: password });
        replaceDocumentBytes(next, page);
        return;
      }
      if (activeTool === "decrypt") {
        const password = prompt("Current PDF password:");
        if (!password) return;
        const next = await bridge.decryptPdf(docBytes, password);
        replaceDocumentBytes(next, page);
        return;
      }
      if (activeTool === "normalize") {
        const next = await bridge.convertToPdfA(docBytes);
        replaceDocumentBytes(next, page);
        return;
      }
      const degrees = activeTool === "rotate-all-left" ? -90 : 90;
      const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
      const next = await bridge.rotatePages(docBytes, pages, degrees);
      replaceDocumentBytes(next, page);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "Document tool failed");
    }
  }

  async function runConfiguredDocumentTool(tool: DocumentTool, options: DocumentToolOptions = {}) {
    if (!docBytes || !fileName) return;
    try {
      if (tool === "delete-pages") {
        const pages = Array.isArray(options.pages)
          ? options.pages.filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages)
          : parsePageList(String(options.pages || ""), totalPages);
        if (pages.length === 0) throw new Error("No valid pages selected");
        const next = await bridge.deletePages(docBytes, pages);
        replaceDocumentBytes(next, Math.min(page, totalPages - pages.length));
        return;
      }
      if (tool === "insert-pdf") {
        const targetPage = Number(options.targetPage);
        if (!Number.isInteger(targetPage) || targetPage < 1 || targetPage > Math.max(totalPages, 1)) throw new Error("Invalid target page");
        if (!options.bytes) throw new Error("Insert PDF requires source bytes");
        const next = await bridge.insertPages(docBytes, { targetPage, position: options.position || "after", bytes: options.bytes });
        replaceDocumentBytes(next, targetPage);
        return;
      }
      if (tool === "crop-current") {
        const margin = Math.min(45, Math.max(0, Number(options.marginPercent ?? 5))) / 100;
        const next = await bridge.cropPage(docBytes, { page, x: margin, y: margin, width: 1 - margin * 2, height: 1 - margin * 2 });
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "encrypt") {
        if (!options.password) throw new Error("Encrypt PDF requires a password");
        const next = await bridge.encryptPdf(docBytes, { userPassword: options.password, ownerPassword: options.password });
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "decrypt") {
        if (!options.password) throw new Error("Decrypt PDF requires a password");
        const next = await bridge.decryptPdf(docBytes, options.password);
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "normalize") {
        const next = await bridge.convertToPdfA(docBytes);
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "page-numbers" || tool === "header" || tool === "footer" || tool === "bates") {
        await runConfiguredMarkupTool(tool, {});
        return;
      }
      const degrees = tool === "rotate-all-left" ? -90 : 90;
      const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
      const next = await bridge.rotatePages(docBytes, pages, degrees);
      replaceDocumentBytes(next, page);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "Document tool failed");
      throw error;
    }
  }

  async function runConfiguredWatermark(options: WatermarkOptions) {
    if (!docBytes) return;
    if (!options.text?.trim()) throw new Error("Watermark text is required");
    try {
      const watermarked = await bridge.watermarkPdf(docBytes, options.text.trim());
      replaceDocumentBytes(watermarked, page);
      setViewerError("Watermark applied.");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Watermark failed: " + err);
      throw err;
    }
  }

  async function runConfiguredMarkupTool(tool: MarkupTool, options: MarkupOptions) {
    if (!docBytes || !fileName) return;
    const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
    try {
      setViewerError("Applying document markup...");
      let next: Uint8Array;
      if (tool === "page-numbers") {
        next = await bridge.addPageNumbers(docBytes, {
          position: options.position || "bottom-center",
          startNumber: options.startNumber ?? 1,
          fontSize: options.fontSize || 11,
          fontColor: options.fontColor || "#111827",
          prefix: options.prefix ?? "Page ",
          suffix: options.suffix ?? "",
          pages: { start: options.pageStart || 1, end: options.pageEnd || totalPages },
        });
      } else if (tool === "header") {
        next = await bridge.addHeaderFooter(docBytes, [{
          align: options.align || "center",
          text: options.text?.trim() || baseName,
          fontSize: options.fontSize || 10,
          fontColor: options.fontColor || "#374151",
        }], true);
      } else if (tool === "footer") {
        next = await bridge.addHeaderFooter(docBytes, [{
          align: options.align || "center",
          text: options.text?.trim() || baseName,
          fontSize: options.fontSize || 10,
          fontColor: options.fontColor || "#374151",
        }], false);
      } else {
        next = await bridge.addBatesNumbering(
          docBytes,
          options.prefix ?? "OPDF-",
          options.startNumber ?? 1,
          options.suffix ?? ""
        );
      }
      replaceDocumentBytes(next, page);
      const labels = {
        "page-numbers": "Page numbers added.",
        header: "Header added.",
        footer: "Footer added.",
        bates: "Bates numbering added.",
      };
      window.setTimeout(() => setViewerError(labels[tool]), 250);
      setTimeout(() => setViewerError(null), 3000);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "Document markup failed");
    }
  }

  return { runOcr, exportPdf, compressDocument, addWatermark, mergeDocuments, splitDocument, convertToImages, runDocumentTool, runConfiguredDocumentTool, runConfiguredMarkupTool, runConfiguredWatermark };
}
