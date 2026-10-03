import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import { toast } from "../../components/ToastProvider";
import { getLargePdfCapabilities, runLargePdfJob } from "../../lib/largePdfJobs";

export function useCommonActions({
  bridge,
  fileName,
  docBytes,
  sourceBlob,
  getDocumentBytes,
  replaceDocumentBytes,
  thumbnails,
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
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
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
        const bytes = docBytes ?? await getDocumentBytes();
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

      const source = sourceBlob ?? docBytes ?? await getDocumentBytes();
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
    const bytes = docBytes ?? await getDocumentBytes();
    if (!bytes) return;
    setDocBytes(bytes);
    if (setShowMergeModal) {
      setShowMergeModal(true);
    }
  }

  async function splitDocument() {
    if (!fileName) return;
    const bytes = docBytes ?? await getDocumentBytes();
    if (!bytes) return;
    setDocBytes(bytes);
    if (setShowSplitModal) {
      setShowSplitModal(true);
    }
  }

  async function convertToImages() {
    if (!fileName || thumbnails.length === 0) {
      toast.info("Vui lòng chờ tất cả các trang render xong trước khi chuyển đổi.");
      return;
    }
    try {
      setViewerError("Zipping images...");
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};
      for (const thumb of thumbnails) {
        const buf = await thumb.blob.arrayBuffer();
        zipData[`page-${thumb.page}.jpg`] = new Uint8Array(buf);
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
