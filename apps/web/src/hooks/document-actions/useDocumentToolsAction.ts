import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import type { DocumentTool } from "../../lib/document-tools";
import { parsePageList } from "../../lib/document-tools";
import type { DocumentToolOptions, MarkupTool, MarkupOptions } from "./types";

export function useDocumentToolsAction({
  bridge,
  fileName,
  docBytes,
  getDocumentBytes,
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
  getDocumentBytes: () => Promise<Uint8Array | null>;
  page: number;
  totalPages: number;
  documentTool: DocumentTool;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setShowInsertModal?: (v: boolean) => void;
  runConfiguredMarkupTool: (tool: MarkupTool, options: MarkupOptions) => Promise<void>;
}) {
  async function runDocumentTool(tool?: DocumentTool) {
    if (!fileName) return;
    const activeTool = tool || documentTool;

    // Interactive tools must use configured panels/modals; native prompt()
    // dialogs are intentionally prohibited. Keep only operations that require
    // no additional user input on this direct path.
    if (activeTool === "insert-pdf") {
      setShowInsertModal?.(true);
      return;
    }

    if (activeTool === "rotate-all-left" || activeTool === "rotate-all-right") {
      try {
        const bytes = docBytes ?? await getDocumentBytes();
        if (!bytes) return;
        const degrees = activeTool === "rotate-all-left" ? -90 : 90;
        const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
        const next = await bridge.rotatePages(bytes, pages, degrees);
        replaceDocumentBytes(next, page);
      } catch (error) {
        setViewerError(error instanceof Error ? error.message : "Document tool failed");
      }
      return;
    }

    setViewerError("Use the configured document tool panel for this operation.");
  }

  async function runConfiguredDocumentTool(tool: DocumentTool, options: DocumentToolOptions = {}) {
    if (!fileName) return;
    try {
      const bytes = docBytes ?? await getDocumentBytes();
      if (!bytes) return;
      if (tool === "delete-pages") {
        const pages = Array.isArray(options.pages)
          ? options.pages.filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages)
          : parsePageList(String(options.pages || ""), totalPages);
        if (pages.length === 0) throw new Error("No valid pages selected");
        const next = await bridge.deletePages(bytes, pages);
        replaceDocumentBytes(next, Math.min(page, totalPages - pages.length));
        return;
      }
      if (tool === "insert-pdf") {
        const targetPage = Number(options.targetPage);
        if (!Number.isInteger(targetPage) || targetPage < 1 || targetPage > Math.max(totalPages, 1)) throw new Error("Invalid target page");
        if (!options.bytes) throw new Error("Insert PDF requires source bytes");
        const next = await bridge.insertPages(bytes, { targetPage, position: options.position || "after", bytes: options.bytes });
        replaceDocumentBytes(next, targetPage);
        return;
      }
      if (tool === "crop-current") {
        const margin = Math.min(45, Math.max(0, Number(options.marginPercent ?? 5))) / 100;
        const next = await bridge.cropPage(bytes, { page, x: margin, y: margin, width: 1 - margin * 2, height: 1 - margin * 2 });
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "encrypt") {
        if (!options.password) throw new Error("Encrypt PDF requires a password");
        const next = await bridge.encryptPdf(bytes, { userPassword: options.password, ownerPassword: options.password });
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "decrypt") {
        if (!options.password) throw new Error("Decrypt PDF requires a password");
        const next = await bridge.decryptPdf(bytes, options.password);
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "normalize") {
        const next = await bridge.convertToPdfA(bytes);
        replaceDocumentBytes(next, page);
        return;
      }
      if (tool === "page-numbers" || tool === "header" || tool === "footer" || tool === "bates") {
        await runConfiguredMarkupTool(tool, {});
        return;
      }
      const degrees = tool === "rotate-all-left" ? -90 : 90;
      const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
      const next = await bridge.rotatePages(bytes, pages, degrees);
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
