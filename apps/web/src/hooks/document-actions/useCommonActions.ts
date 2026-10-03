import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import { toast } from "../../components/ToastProvider";
import { getLargePdfCapabilities, runLargePdfJob } from "../../lib/largePdfJobs";
import { collectViewerThumbnails } from "../../lib/viewer-runtime";

export function useCommonActions({
  bridge,
  fileName,
  docBytes,
  sourceBlob,
  getDocumentBytes,
  replaceDocumentBytes,
  totalPages,
  setDocBytes,
  setViewerError,
  setSaveState,
  setShowSplitModal,
  setShowMergeModal,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  fileName: string;
  docBytes: Uint8Array | null;
  sourceBlob: Blob | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  totalPages: number;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
  setShowSplitModal?: (v: boolean) => void;
  setShowMergeModal?: (v: boolean) => void;
}) {
  async function compressDocument() {
    if (!fileName) return;
    try {
      setViewerError("Compressing...");

      // Desktop/native bridge remains the first choice where available.
      if (bridge.capabilities?.compress !== false) {
        const bytes = (await getDocumentBytes()) ?? docBytes;
        if (!bytes) return;
        const compressed = await bridge.compressPdf(bytes);
        replaceDocumentBytes(compressed);
        setSaveState("idle");
        setViewerError(null);
        toast.success("Nén tài liệu thành công!");
        return;
      }

      // Browser fallback: use the streaming large-PDF service if qpdf is
      // available. Prefer Blob/File so a 300–500 MB PDF is not materialized
      // into another Uint8Array just to upload it.
      const capabilities = await getLargePdfCapabilities();
      if (!capabilities?.qpdf || !capabilities.operations.includes("optimize")) {
        throw new Error("Server-side PDF optimization is unavailable.");
      }

      const source = sourceBlob ?? (await getDocumentBytes()) ?? docBytes;
      if (!source) return;
      const compressed = await runLargePdfJob({
        source,
        fileName,
        operation: "optimize",
        onStatus: (state) => {
          if (state.status === "uploaded") {
            setViewerError("Upload complete. Optimizing PDF...");
          } else if (state.status === "processing") {
            setViewerError("Optimizing large PDF on server...");
          }
        },
      });
      replaceDocumentBytes(compressed);
      setSaveState("idle");
      setViewerError(null);
      toast.success("Nén tài liệu thành công!");
    } catch (err) {
      setViewerError("Compression failed: " + err);
      toast.error("Nén tài liệu thất bại.");
    }
  }

  async function addWatermark() {
    // Configuration belongs in the Watermark panel. This fallback deliberately
    // avoids native prompt() dialogs.
    toast.info("Mở Watermark trong PDF Tools để cấu hình nội dung và kiểu hiển thị.");
  }

  async function mergeDocuments() {
    const bytes = (await getDocumentBytes()) ?? docBytes;
    if (!bytes) return;
    setDocBytes(bytes);
    if (setShowMergeModal) {
      setShowMergeModal(true);
    }
  }

  async function splitDocument() {
    if (!fileName) return;
    const bytes = (await getDocumentBytes()) ?? docBytes;
    if (!bytes) return;
    setDocBytes(bytes);
    if (setShowSplitModal) {
      setShowSplitModal(true);
    }
  }

  async function convertToImages() {
    if (!fileName || totalPages < 1) return;
    try {
      setViewerError("Rendering page images...");
      const thumbnails = await collectViewerThumbnails(totalPages);
      setViewerError("Zipping images...");
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};
      for (const thumb of thumbnails) {
        const buf = await thumb.blob.arrayBuffer();
        const extension = thumb.blob.type.includes("png") ? "png" : "jpg";
        zipData[`page-${thumb.page}.${extension}`] = new Uint8Array(buf);
      }
      const zipped = zipSync(zipData);
      const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-images.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setViewerError(null);
      toast.success("Đã xuất ảnh các trang thành công!");
    } catch (err) {
      setViewerError("Failed to convert: " + err);
    }
  }

  return {
    compressDocument,
    addWatermark,
    mergeDocuments,
    splitDocument,
    convertToImages,
  };
}
