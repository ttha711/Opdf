import type React from "react";
import { getLargePdfCapabilities, runLargePdfJob } from "../../../lib/largePdfJobs";

interface UseCompressPdfArgs {
  fileName: string;
  docBytes: Uint8Array | null;
  sourceBlob?: Blob | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  bridge: any;
  compressLevel: "high" | "medium" | "low";
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: (msg: string | null) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCompressPdf(args: UseCompressPdfArgs) {
  const {
    fileName,
    docBytes,
    sourceBlob = null,
    getDocumentBytes,
    bridge,
    replaceDocumentBytes,
    setViewerError,
    setIsProcessing,
  } = args;

  const handleCompressPdf = async () => {
    setIsProcessing(true);
    setViewerError("Compressing document streams...");
    try {
      let compressed: Uint8Array;
      if (bridge.capabilities?.compress !== false) {
        const bytes = docBytes ?? await getDocumentBytes();
        if (!bytes) throw new Error("PDF bytes are unavailable.");
        compressed = await bridge.compressPdf(bytes);
      } else {
        const capabilities = await getLargePdfCapabilities();
        if (!capabilities?.qpdf || !capabilities.operations.includes("optimize")) {
          throw new Error("PDF optimization service is unavailable in this web deployment.");
        }
        const source = sourceBlob ?? docBytes ?? await getDocumentBytes();
        if (!source) throw new Error("PDF source is unavailable.");
        compressed = await runLargePdfJob({
          source,
          fileName: fileName || "document.pdf",
          operation: "optimize",
          onStatus: (state) => {
            if (state.status === "uploading" && state.totalBytes) {
              const pct = Math.max(0, Math.min(100, Math.round(((state.bytesReceived ?? 0) / state.totalBytes) * 100)));
              setViewerError(`Uploading for compression… ${pct}%`);
            } else if (state.status === "processing") {
              setViewerError("Optimizing PDF on OPDF Server...");
            }
          },
        });
      }

      replaceDocumentBytes(compressed);
      setViewerError("PDF optimized successfully.");
      window.setTimeout(() => setViewerError(null), 3500);
    } catch (err) {
      setViewerError("Compression failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  return { handleCompressPdf };
}
