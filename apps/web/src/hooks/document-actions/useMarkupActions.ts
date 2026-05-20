import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import type { WatermarkOptions, MarkupTool, MarkupOptions } from "./types";

export function useMarkupActions({
  bridge,
  fileName,
  docBytes,
  page,
  totalPages,
  replaceDocumentBytes,
  setViewerError,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  docBytes: Uint8Array | null;
  page: number;
  totalPages: number;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: Dispatch<SetStateAction<string | null>>;
}) {
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

  return {
    runConfiguredWatermark,
    runConfiguredMarkupTool,
  };
}
