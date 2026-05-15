import type { OcrJob } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import type { DocumentTool } from "../lib/document-tools";
import { parsePageList, pickBrowserPdfBytes } from "../lib/document-tools";
import { useOpdfBridge } from "./useOpdfBridge";

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
}) {
  async function runOcr() {
    if (!fileName) return;
    const job = await bridge.enqueueOcr(fileName, "eng+vie");
    await bridge.runOcr(job.id);
    setOcrJobs(await bridge.listOcrJobs());
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
    if (!hasDesktopBridge || !docBytes) {
      alert("Merge currently requires the Desktop App for native file selection.");
      return;
    }
    alert("Select a second PDF to append to the current one.");
    const file2 = await bridge.pickAndOpenDocument();
    if (!file2) return;
    try {
      const merged = await bridge.mergePdfs([docBytes, file2.bytes]);
      setDocBytes(merged);
      setPage(1);
    } catch (err) {
      setViewerError("Merge failed: " + err);
    }
  }

  async function splitDocument() {
    if (!docBytes || !fileName) return;
    const pageStr = prompt("Enter the exact page number you want to extract as a standalone PDF:", "1");
    if (!pageStr) return;
    const p = parseInt(pageStr, 10);
    if (isNaN(p) || p < 1 || p > totalPages) return;
    try {
      const splitDocs = await bridge.splitPdf(docBytes, [p - 1]);
      if (splitDocs.length) {
        if (hasDesktopBridge) {
          await bridge.saveDocumentAs(splitDocs[0]);
        } else {
          const blob = new Blob([splitDocs[0] as unknown as BlobPart], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
          const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
          a.download = `page-${p}-${finalName}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch {
      setViewerError("Split failed");
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
        const res = await fetch(thumb.url);
        const buf = await res.arrayBuffer();
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

  async function runDocumentTool() {
    if (!docBytes || !fileName) return;
    try {
      if (documentTool === "delete-pages") {
        const input = prompt("Pages to delete (example: 2,4-6):", String(page));
        if (!input) return;
        const pages = parsePageList(input, totalPages);
        if (pages.length === 0) throw new Error("No valid pages selected");
        const next = await bridge.deletePages(docBytes, pages);
        replaceDocumentBytes(next, Math.min(page, totalPages - pages.length));
        return;
      }
      if (documentTool === "insert-pdf") {
        const targetInput = prompt("Insert at page number:", String(page));
        if (!targetInput) return;
        const targetPage = Number(targetInput);
        if (!Number.isInteger(targetPage) || targetPage < 1 || targetPage > Math.max(totalPages, 1)) throw new Error("Invalid target page");
        const position = confirm("Insert after this page? Choose Cancel to insert before.") ? "after" : "before";
        let bytes: Uint8Array | null = null;
        if (hasDesktopBridge) {
          const picked = await bridge.pickAndOpenDocument();
          bytes = picked?.bytes ?? null;
        } else {
          bytes = await pickBrowserPdfBytes();
        }
        if (!bytes) return;
        const next = await bridge.insertPages(docBytes, { targetPage, position, bytes });
        replaceDocumentBytes(next, targetPage);
        return;
      }
      if (documentTool === "crop-current") {
        const marginInput = prompt("Crop margin percent from each edge (0-45):", "5");
        if (!marginInput) return;
        const margin = Math.min(45, Math.max(0, Number(marginInput))) / 100;
        const next = await bridge.cropPage(docBytes, { page, x: margin, y: margin, width: 1 - margin * 2, height: 1 - margin * 2 });
        replaceDocumentBytes(next, page);
        return;
      }
      if (documentTool === "page-numbers") {
        const prefix = prompt("Page number prefix:", "Page ");
        if (prefix === null) return;
        const next = await bridge.addPageNumbers(docBytes, { position: "bottom-center", startNumber: 1, fontSize: 11, fontColor: "#111827", prefix });
        replaceDocumentBytes(next, page);
        return;
      }
      if (documentTool === "header" || documentTool === "footer") {
        const text = prompt(documentTool === "header" ? "Header text:" : "Footer text:", fileName);
        if (!text) return;
        const next = await bridge.addHeaderFooter(docBytes, [{ align: "center", text, fontSize: 10, fontColor: "#374151" }], documentTool === "header");
        replaceDocumentBytes(next, page);
        return;
      }
      if (documentTool === "bates") {
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
      if (documentTool === "encrypt") {
        const password = prompt("New PDF password:");
        if (!password) return;
        const next = await bridge.encryptPdf(docBytes, { userPassword: password, ownerPassword: password });
        replaceDocumentBytes(next, page);
        return;
      }
      if (documentTool === "decrypt") {
        const password = prompt("Current PDF password:");
        if (!password) return;
        const next = await bridge.decryptPdf(docBytes, password);
        replaceDocumentBytes(next, page);
        return;
      }
      if (documentTool === "normalize") {
        const next = await bridge.convertToPdfA(docBytes);
        replaceDocumentBytes(next, page);
        return;
      }
      const degrees = documentTool === "rotate-all-left" ? -90 : 90;
      const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
      const next = await bridge.rotatePages(docBytes, pages, degrees);
      replaceDocumentBytes(next, page);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "Document tool failed");
    }
  }

  return { runOcr, exportPdf, compressDocument, addWatermark, mergeDocuments, splitDocument, convertToImages, runDocumentTool };
}
