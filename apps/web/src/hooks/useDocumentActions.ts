import type { OcrJob } from "@opdf/core";
import type { Dispatch, SetStateAction } from "react";
import type { DocumentTool } from "../lib/document-tools";
import { useOpdfBridge } from "./useOpdfBridge";
import { useOcrAction } from "./document-actions/useOcrAction";
import { useExportAction } from "./document-actions/useExportAction";
import { useCommonActions } from "./document-actions/useCommonActions";
import { useMarkupActions } from "./document-actions/useMarkupActions";
import { useDocumentToolsAction } from "./document-actions/useDocumentToolsAction";

export type { MarkupTool, MarkupOptions, DocumentToolOptions, WatermarkOptions } from "./document-actions/types";

export function useDocumentActions({
  bridge,
  hasDocument,
  hasDesktopBridge,
  fileName,
  docBytes,
  page,
  totalPages,
  thumbnails,
  annotations,
  setFileName,
  setAnnotations,
  documentTool,
  replaceDocumentBytes,
  setDocBytes,
  setPage,
  setOcrJobs,
  setViewerError,
  setSaveState,
  markDocumentSaved,
  setShowSplitModal,
  setShowMergeModal,
  setShowInsertModal,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  hasDocument: boolean;
  hasDesktopBridge: boolean;
  fileName: string;
  docBytes: Uint8Array | null;
  page: number;
  totalPages: number;
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  annotations: any[];
  setFileName: Dispatch<SetStateAction<string>>;
  setAnnotations: Dispatch<SetStateAction<any[]>>;
  documentTool: DocumentTool;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setOcrJobs: Dispatch<SetStateAction<OcrJob[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
  markDocumentSaved: (snapshot?: {
    fileName?: string;
    docBytes?: Uint8Array | null;
    annotations?: any[];
    bookmarks?: Array<{ id: string; page: number; title: string; createdAt: number }>;
    pageRotations?: Record<number, number>;
  }) => void;
  setShowSplitModal?: (v: boolean) => void;
  setShowMergeModal?: (v: boolean) => void;
  setShowInsertModal?: (v: boolean) => void;
}) {
  const { runOcr } = useOcrAction({
    bridge,
    fileName,
    docBytes,
    page,
    hasDesktopBridge,
    replaceDocumentBytes,
    setDocBytes,
    setOcrJobs,
    setViewerError,
  });

  const { savePdf, savePdfAs, exportPdf } = useExportAction({
    bridge,
    hasDocument,
    hasDesktopBridge,
    fileName,
    docBytes,
    annotations,
    replaceDocumentBytes,
    setDocBytes,
    setFileName,
    setAnnotations,
    setViewerError,
    setSaveState,
    markDocumentSaved,
  });

  const {
    compressDocument,
    addWatermark,
    mergeDocuments,
    splitDocument,
    convertToImages,
  } = useCommonActions({
    bridge,
    fileName,
    docBytes,
    thumbnails,
    setDocBytes,
    setViewerError,
    setShowSplitModal,
    setShowMergeModal,
    setSaveState,
  });

  const {
    runConfiguredWatermark,
    runConfiguredMarkupTool,
  } = useMarkupActions({
    bridge,
    fileName,
    docBytes,
    page,
    totalPages,
    replaceDocumentBytes,
    setViewerError,
  });

  const {
    runDocumentTool,
    runConfiguredDocumentTool,
  } = useDocumentToolsAction({
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
  });

  return {
    runOcr,
    savePdf,
    savePdfAs,
    exportPdf,
    compressDocument,
    addWatermark,
    mergeDocuments,
    splitDocument,
    convertToImages,
    runDocumentTool,
    runConfiguredDocumentTool,
    runConfiguredMarkupTool,
    runConfiguredWatermark,
  };
}
