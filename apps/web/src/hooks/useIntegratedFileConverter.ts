import { useCallback } from "react";
import { isOpdfServerRuntime, useOpdfBridge } from "./useOpdfBridge";

type UseIntegratedFileConverterArgs = {
  activeDashboardTool: string | null;
  setActiveDashboardTool: (tool: string | null) => void;
  setDocBytes: (bytes: Uint8Array | null) => void;
  setFileName: (name: string) => void;
  setPage: (page: number | ((p: number) => number)) => void;
  setViewerError: (error: string | null) => void;
};

export function useIntegratedFileConverter({
  activeDashboardTool,
  setActiveDashboardTool,
  setDocBytes,
  setFileName,
  setPage,
  setViewerError,
}: UseIntegratedFileConverterArgs) {
  const bridge = useOpdfBridge();
  const handleIntegratedFileSelected = useCallback(async (file: File) => {
    setViewerError("Analyzing document nodes...");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (ext === "pdf") {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const getTargetFormat = (actionId: string | null): string => {
          if (!actionId) return "";
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

        const targetFormat = getTargetFormat(activeDashboardTool);
        if (targetFormat) {
          setActiveDashboardTool(null);
          const { runBackgroundOcrAndExport } = await import("../lib/backgroundConverter");
          void runBackgroundOcrAndExport(bytes, file.name, targetFormat, setViewerError);
          return;
        }

        setDocBytes(bytes);
        setFileName(file.name);
        setPage(1);
        setViewerError(null);
        return;
      }

      // Non-PDF conversion client-side using pdf-lib
      const pdfLib = await import("pdf-lib");
      const doc = await pdfLib.PDFDocument.create();
      const fontNormal = await doc.embedFont(pdfLib.StandardFonts.Helvetica);

      let pageWidth = 595.276;
      let pageHeight = 841.890;
      let margin = 50;

      if (ext === "txt") {
        const text = await file.text();
        const fontSize = 11;
        const contentWidth = pageWidth - margin * 2;
        const lines: string[] = [];

        const rawLines = text.split(/\r?\n/);
        for (const rawLine of rawLines) {
          if (!rawLine.trim()) {
            lines.push("");
            continue;
          }
          let currentLine = "";
          const words = rawLine.split(/\s+/);
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = fontNormal.widthOfTextAtSize(testLine, fontSize);
            if (textWidth > contentWidth) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const linesPerPage = Math.floor((pageHeight - margin * 2) / (fontSize * 1.5));
        for (let i = 0; i < lines.length; i += linesPerPage) {
          const pageLines = lines.slice(i, i + linesPerPage);
          const page = doc.addPage([pageWidth, pageHeight]);
          let y = pageHeight - margin;
          for (const line of pageLines) {
            page.drawText(line, { x: margin, y, size: fontSize, font: fontNormal });
            y -= fontSize * 1.5;
          }
        }
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const arrayBuffer = await file.arrayBuffer();
        const isPng = ext === "png";
        let image;
        if (isPng) {
          image = await doc.embedPng(new Uint8Array(arrayBuffer));
        } else {
          image = await doc.embedJpg(new Uint8Array(arrayBuffer));
        }

        const { width: imgW, height: imgH } = image.scale(1.0);
        const availableW = pageWidth - margin * 2;
        const scaleFactor = Math.min(availableW / imgW, (pageHeight - margin * 2) / imgH);
        const drawW = imgW * scaleFactor;
        const drawH = imgH * scaleFactor;

        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin + (availableW - drawW) / 2,
          y: margin + (pageHeight - margin * 2 - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } else {
        if (!isOpdfServerRuntime() || !bridge.convertOfficeToPdf) {
          throw new Error("Office → PDF requires OPDF Server with LibreOffice installed.");
        }
        setViewerError("Converting Office document with LibreOffice...");
        const output = await bridge.convertOfficeToPdf(new Uint8Array(await file.arrayBuffer()), file.name);
        setDocBytes(output);
        setFileName(file.name.replace(/\.[^/.]+$/, "") + ".pdf");
        setPage(1);
        setViewerError(null);
        return;
      }

      const pdfBytes = await doc.save();
      setDocBytes(pdfBytes);
      setFileName(file.name.replace(/\.[^/.]+$/, "") + ".pdf");
      setPage(1);
      setViewerError(null);
    } catch (err: any) {
      setViewerError("Failed to convert file: " + err.message);
    }
  }, [activeDashboardTool, bridge, setActiveDashboardTool, setDocBytes, setFileName, setPage, setViewerError]);

  return { handleIntegratedFileSelected };
}
