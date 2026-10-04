import { isOpdfServerRuntime, useOpdfBridge } from "../../../hooks/useOpdfBridge";
import type React from "react";

interface UseOfficeToPdfArgs {
  activeToolId: string;
  officePageSize: "A4" | "Letter";
  officeOrientation: "auto" | "portrait" | "landscape";
  officeMargins: "none" | "normal" | "custom";
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  setViewerError: (msg: string | null) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useOfficeToPdf(args: UseOfficeToPdfArgs) {
  const bridge = useOpdfBridge();
  const {
    activeToolId,
    officePageSize,
    officeOrientation,
    officeMargins,
    fileInputRef,
    onLoadConvertedPdf,
    setViewerError,
    setIsProcessing,
  } = args;

  const handleOfficeToPdf = () => {
    if (fileInputRef.current) {
      if (activeToolId === "image-to-pdf") fileInputRef.current.accept = "image/png, image/jpeg, image/jpg";
      else if (activeToolId === "txt-to-pdf") fileInputRef.current.accept = ".txt";
      else if (activeToolId === "word-to-pdf") fileInputRef.current.accept = ".docx, .doc";
      else if (activeToolId === "excel-to-pdf") fileInputRef.current.accept = ".xlsx, .xls";
      else if (activeToolId === "ppt-to-pdf") fileInputRef.current.accept = ".pptx, .ppt";
      else if (activeToolId === "rtf-to-pdf") fileInputRef.current.accept = ".rtf";
      fileInputRef.current.click();
    }
  };

  const handleOfficeFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setViewerError("Reconstructing layout grids...");
    try {
      const lowerName = file.name.toLowerCase();
      const isTxt = lowerName.endsWith(".txt");
      const isImage = ["image/png", "image/jpeg"].includes(file.type) || /\.(png|jpe?g)$/i.test(file.name);

      if (!isTxt && !isImage) {
        if (!isOpdfServerRuntime() || !bridge.convertOfficeToPdf) {
          throw new Error("Office → PDF requires OPDF Server with LibreOffice installed.");
        }
        setViewerError("Converting Office document with LibreOffice...");
        const output = await bridge.convertOfficeToPdf(new Uint8Array(await file.arrayBuffer()), file.name);
        onLoadConvertedPdf(output, file.name.replace(/\.[^/.]+$/, "") + ".pdf");
        setViewerError("Office document converted to PDF.");
        window.setTimeout(() => setViewerError(null), 3000);
        return;
      }

      const pdfLib = await import("pdf-lib");
      const doc = await pdfLib.PDFDocument.create();

      let pageWidth = 595.276;
      let pageHeight = 841.89;
      if (officePageSize === "Letter") {
        pageWidth = 612.0;
        pageHeight = 792.0;
      }
      if (officeOrientation === "landscape") {
        const temp = pageWidth;
        pageWidth = pageHeight;
        pageHeight = temp;
      }

      let margin = 50;
      if (officeMargins === "none") margin = 10;
      else if (officeMargins === "custom") margin = 30;

      const fontNormal = await doc.embedFont(pdfLib.StandardFonts.Helvetica);

      if (isTxt) {
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
            if (textWidth > contentWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const linesPerPage = Math.max(1, Math.floor((pageHeight - margin * 2) / (fontSize * 1.5)));
        for (let i = 0; i < lines.length; i += linesPerPage) {
          const pageLines = lines.slice(i, i + linesPerPage);
          const page = doc.addPage([pageWidth, pageHeight]);
          let y = pageHeight - margin;
          for (const line of pageLines) {
            page.drawText(line, { x: margin, y, size: fontSize, font: fontNormal });
            y -= fontSize * 1.5;
          }
        }
        if (lines.length === 0) doc.addPage([pageWidth, pageHeight]);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const isPng = file.type === "image/png" || lowerName.endsWith(".png");
        const image = isPng
          ? await doc.embedPng(new Uint8Array(arrayBuffer))
          : await doc.embedJpg(new Uint8Array(arrayBuffer));
        const { width: imgW, height: imgH } = image.scale(1.0);
        const availableW = pageWidth - margin * 2;
        const availableH = pageHeight - margin * 2;
        const scaleFactor = Math.min(availableW / imgW, availableH / imgH);
        const drawW = imgW * scaleFactor;
        const drawH = imgH * scaleFactor;
        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin + (availableW - drawW) / 2,
          y: margin + (availableH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }

      const pdfBytes = await doc.save();
      onLoadConvertedPdf(pdfBytes, file.name.replace(/\.[^/.]+$/, "") + ".pdf");
      setViewerError("Document converted to PDF.");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Office conversion failed: " + err);
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = "";
    }
  };

  return {
    handleOfficeToPdf,
    handleOfficeFileSelected,
  };
}
