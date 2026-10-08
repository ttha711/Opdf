import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import { toast } from "../../components/ToastProvider";
import { getLargePdfCapabilities, runLargePdfJob } from "../../lib/largePdfJobs";
import { renderViewerPageImages } from "../../lib/viewer-runtime";

export function useCommonActions({
  bridge,
  fileName,
  docBytes,
  sourceBlob,
  getDocumentBytes,
  replaceDocumentBytes,
  totalPages,
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
        toast.success("Document compressed successfully.");
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
      toast.success("Document compressed successfully.");
    } catch (err) {
      setViewerError("Compression failed: " + err);
      toast.error("Document compression failed.");
    }
  }

  async function addWatermark() {
    // Configuration belongs in the Watermark panel. This fallback deliberately
    // avoids native prompt() dialogs.
    toast.info("Open Watermark in PDF Tools to configure the content and appearance.");
  }

  function mergeDocuments() {
    if (!fileName) return;
    setShowMergeModal?.(true);
  }

  function splitDocument() {
    if (!fileName) return;
    setShowSplitModal?.(true);
  }

  async function convertToImages(format: "png" | "jpeg" = "png") {
    if (!fileName || totalPages < 1) return;
    try {
      setViewerError("Rendering page images...");
      const pageImages = await renderViewerPageImages(totalPages);
      setViewerError("Zipping images...");
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};
      const targetMime = format === "jpeg" ? "image/jpeg" : "image/png";
      const extension = format === "jpeg" ? "jpg" : "png";

      for (const thumb of pageImages) {
        let outputBlob = thumb.blob;
        if (thumb.blob.type !== targetMime) {
          const bitmap = await createImageBitmap(thumb.blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Unable to create image conversion canvas.");
          if (format === "jpeg") {
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
          }
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          outputBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => blob ? resolve(blob) : reject(new Error("Unable to encode page image.")),
              targetMime,
              format === "jpeg" ? 0.92 : undefined,
            );
          });
        }

        const buf = await outputBlob.arrayBuffer();
        zipData[`page-${thumb.page}.${extension}`] = new Uint8Array(buf);
      }

      const zipped = zipSync(zipData);
      const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-images-${format}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setViewerError(null);
      toast.success(`Page images exported as ${format.toUpperCase()} successfully.`);
    } catch (err) {
      setViewerError("Failed to convert: " + err);
      throw err;
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
