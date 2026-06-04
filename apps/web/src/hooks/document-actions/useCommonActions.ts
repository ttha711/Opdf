import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";

export function useCommonActions({
  bridge,
  fileName,
  docBytes,
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
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
  setShowSplitModal?: (v: boolean) => void;
  setShowMergeModal?: (v: boolean) => void;
}) {
  async function compressDocument() {
    if (!docBytes || !fileName) return;
    try {
      setViewerError("Compressing... (this may take a few seconds)");
      const compressed = await bridge.compressPdf(docBytes);
      setDocBytes(compressed);
      setSaveState("idle");
      setViewerError("Compression complete!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Compression failed: " + err);
    }
  }

  async function addWatermark() {
    if (!docBytes) return;
    const text = prompt("Enter watermark text:", "CONFIDENTIAL");
    if (!text) return;
    try {
      const watermarked = await bridge.watermarkPdf(docBytes, text);
      setDocBytes(watermarked);
      setSaveState("idle");
    } catch (err) {
      setViewerError("Watermark failed: " + err);
    }
  }

  async function mergeDocuments() {
    if (!docBytes) return;
    if (setShowMergeModal) {
      setShowMergeModal(true);
    }
  }

  async function splitDocument() {
    if (!docBytes || !fileName) return;
    if (setShowSplitModal) {
      setShowSplitModal(true);
    }
  }

  async function convertToImages() {
    if (!fileName || thumbnails.length === 0) {
      alert("Please wait for all pages to finish rendering before converting.");
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
