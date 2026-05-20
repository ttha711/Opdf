import type React from "react";

interface UseWatermarkPdfArgs {
  docBytes: Uint8Array | null;
  watermarkText: string;
  watermarkFontSize: number;
  watermarkColor: string;
  watermarkOpacity: number;
  watermarkRotation: number;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: (msg: string | null) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useWatermarkPdf(args: UseWatermarkPdfArgs) {
  const {
    docBytes,
    watermarkText,
    watermarkFontSize,
    watermarkColor,
    watermarkOpacity,
    watermarkRotation,
    replaceDocumentBytes,
    setViewerError,
    setIsProcessing,
  } = args;

  const handleAddWatermark = async () => {
    if (!docBytes) return;
    setIsProcessing(true);
    setViewerError("Stamping watermarks...");
    try {
      const pdfLib = await import("pdf-lib");
      const doc = await pdfLib.PDFDocument.load(docBytes);
      const font = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const pages = doc.getPages();
      const hex = watermarkColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;

      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(watermarkText, watermarkFontSize);
        page.drawText(watermarkText, {
          x: (width - textWidth * Math.cos((watermarkRotation * Math.PI) / 180)) / 2,
          y: height / 2,
          size: watermarkFontSize,
          font,
          color: pdfLib.rgb(r, g, b),
          opacity: watermarkOpacity / 100,
          rotate: pdfLib.degrees(watermarkRotation),
        });
      }

      const watermarked = await doc.save();
      replaceDocumentBytes(watermarked);
      setViewerError("Watermark stamped on all pages!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Failed to apply watermark: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  return { handleAddWatermark };
}
