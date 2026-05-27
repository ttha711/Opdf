import type React from "react";
import { extractPageLines, downloadFile } from "./helpers";

interface UsePdfToOfficeArgs {
  activeToolId: string;
  docBytes: Uint8Array | null;
  fileName: string;
  fileBase: string;
  officeLayout: "flow" | "exact";
  officeOcrLang: string;
  officeOrientation: "auto" | "portrait" | "landscape";
  onOpenHtmlEditor?: (html: string) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setViewerError: (msg: string | null) => void;
}

export function usePdfToOffice(args: UsePdfToOfficeArgs) {
  const {
    activeToolId,
    docBytes,
    fileName,
    fileBase,
    officeLayout,
    officeOcrLang,
    officeOrientation,
    onOpenHtmlEditor,
    setIsProcessing,
    setViewerError,
  } = args;

  const getTargetFormat = (actionId: string): string => {
    switch (actionId) {
      case "pdf-to-word": return "word";
      case "pdf-to-excel": return "excel";
      case "pdf-to-ppt": return "powerpoint";
      case "pdf-to-rtf": return "rtf";
      case "pdf-to-txt": return "txt";
      case "pdf-to-html": return "html";
      case "pdf-to-xml": return "xml";
      default: return "";
    }
  };

  const handlePdfToOffice = async () => {
    if (!docBytes) return;
    setIsProcessing(true);
    try {
      const targetFormat = getTargetFormat(activeToolId);
      if (!targetFormat) {
        throw new Error("Unsupported layout format: " + activeToolId);
      }

      const { runBackgroundOcrAndExport } = await import("../../../lib/backgroundConverter");
      await runBackgroundOcrAndExport(docBytes, fileName, targetFormat, setViewerError);
    } catch (err: any) {
      setViewerError("Failed to convert layout: " + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  return { handlePdfToOffice };
}
