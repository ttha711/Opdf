import type React from "react";
import { useOpdfBridge } from "../../../hooks/useOpdfBridge";
import { extractPageLines, downloadFile } from "./helpers";
import { buildPdfTextExport } from "../../../lib/pdfTextExport";

interface UsePdfToOfficeArgs {
  activeToolId: string;
  docBytes: Uint8Array | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
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
  const bridge = useOpdfBridge();
  const {
    activeToolId,
    docBytes,
    getDocumentBytes,
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
    setIsProcessing(true);
    try {
      const bytes = docBytes ?? await getDocumentBytes();
      if (!bytes) throw new Error("PDF bytes are unavailable.");
      const targetFormat = getTargetFormat(activeToolId);
      if (!targetFormat) {
        throw new Error("Unsupported layout format: " + activeToolId);
      }

      const serverFormat =
        targetFormat === "word" ? "docx" :
        targetFormat === "excel" ? "xlsx" :
        targetFormat === "powerpoint" ? "pptx" :
        null;

      if (serverFormat) {
        if (!bridge.convertPdfOffice) {
          throw new Error("This runtime does not provide a real PDF to Office converter.");
        }
        setViewerError(`Converting ${fileName}...`);
        const output = await bridge.convertPdfOffice(bytes, serverFormat);
        await downloadFile(output, `${fileBase}.${serverFormat}`, [serverFormat]);
        setViewerError(null);
        return;
      }

      if (targetFormat === "txt" || targetFormat === "xml" || targetFormat === "html" || targetFormat === "rtf") {
        const result = await buildPdfTextExport(bytes, fileName, targetFormat);
        await downloadFile(result.bytes, result.fileName, [targetFormat]);
        setViewerError(null);
        return;
      }

      throw new Error("Unsupported PDF export format.");
    } catch (err: any) {
      setViewerError("Failed to convert layout: " + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  return { handlePdfToOffice };
}
