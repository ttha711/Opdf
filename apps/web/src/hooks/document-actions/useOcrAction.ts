import type { OcrJob } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import { isLikelyPdf, isParseablePdf, clonePdfBytes } from "./pdfUtils";
import { pickBrowserPdfBytes } from "../../lib/document-tools";

export function useOcrAction({
  bridge,
  fileName,
  docBytes,
  page,
  hasDesktopBridge,
  replaceDocumentBytes,
  setDocBytes,
  setOcrJobs,
  setViewerError,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  docBytes: Uint8Array | null;
  page: number;
  hasDesktopBridge: boolean;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setOcrJobs: Dispatch<SetStateAction<OcrJob[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
}) {
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

  return { runOcr };
}
