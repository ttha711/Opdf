import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import type { DocumentTool } from "../../lib/document-tools";
import { parsePageList } from "../../lib/document-tools";
import type { DocumentToolOptions, MarkupTool, MarkupOptions } from "./types";

export function useDocumentToolsAction({
  bridge,
  fileName,
  docBytes,
  page,
  totalPages,
  documentTool,
  replaceDocumentBytes,
  setViewerError,
  setShowInsertModal,
  runConfiguredMarkupTool,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  docBytes: Uint8Array | null;
  page: number;
  totalPages: number;
  documentTool: DocumentTool;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setShowInsertModal?: (v: boolean) => void;
  runConfiguredMarkupTool: (tool: MarkupTool, options: MarkupOptions) => Promise<void>;
}) {
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

  return {
    runDocumentTool,
    runConfiguredDocumentTool,
  };
}
