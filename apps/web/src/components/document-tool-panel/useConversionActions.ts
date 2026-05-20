import type React from "react";
import { usePdfToImages } from "./conversion-actions/usePdfToImages";
import { usePdfToOffice } from "./conversion-actions/usePdfToOffice";
import { useOfficeToPdf } from "./conversion-actions/useOfficeToPdf";
import { useCompressPdf } from "./conversion-actions/useCompressPdf";
import { useWatermarkPdf } from "./conversion-actions/useWatermarkPdf";

interface UseConversionActionsArgs {
  activeToolId: string;
  fileName: string;
  fileBase: string;
  docBytes: Uint8Array | null;
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  bridge: any;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  onOpenHtmlEditor?: (html: string) => void;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: (msg: string | null) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imgFormat: "png" | "jpg";
  imgOutputOption: "one-per-page" | "all-in-one";
  imgZoom: number;
  imgColorMode: "color" | "grayscale";
  officeLayout: "flow" | "exact";
  officeOcrLang: string;
  officePageSize: "A4" | "Letter";
  officeOrientation: "auto" | "portrait" | "landscape";
  officeMargins: "none" | "normal" | "custom";
  compressLevel: "high" | "medium" | "low";
  watermarkText: string;
  watermarkFontSize: number;
  watermarkColor: string;
  watermarkOpacity: number;
  watermarkRotation: number;
}

export function useConversionActions(args: UseConversionActionsArgs) {
  const { handlePdfToImages } = usePdfToImages(args);
  const { handlePdfToOffice } = usePdfToOffice(args);
  const { handleOfficeToPdf, handleOfficeFileSelected } = useOfficeToPdf(args);
  const { handleCompressPdf } = useCompressPdf(args);
  const { handleAddWatermark } = useWatermarkPdf(args);

  return {
    handlePdfToImages,
    handlePdfToOffice,
    handleOfficeToPdf,
    handleOfficeFileSelected,
    handleCompressPdf,
    handleAddWatermark,
  };
}
