import type React from "react";
import { getLargePdfCapabilities, runLargePdfJob } from "../../../lib/largePdfJobs";

interface UseCompressPdfArgs {
  fileName: string;
  docBytes: Uint8Array | null;
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
    getDocumentBytes,
    bridge,
    compressLevel,
    replaceDocumentBytes,
    setViewerError,
    setIsProcessing,
  } = args;

  const handleCompressPdf = async () => {
    setIsProcessing(true);
    setViewerError("Compressing document streams...");
    try {
      const bytes = docBytes ?? await getDocumentBytes();
      if (!bytes) throw new Error("PDF bytes are unavailable.");

      let compressed: Uint8Array;
      if (bridge.capabilities?.compress !== false) {
        compressed = await bridge.compressPdf(bytes);
      } else {
        const capabilities = await getLargePdfCapabilities();
        if (!capabilities?.qpdf || !capabilities.operations.includes("optimize")) {
          throw new Error("PDF optimization service is unavailable in this web deployment.");
        }
        compressed = await runLargePdfJob({
          source: bytes,
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
      setViewerError(`Optimized successfully with ${compressLevel.toUpperCase()} compression.`);
      window.setTimeout(() => setViewerError(null), 3500);
    } catch (err) {
      setViewerError("Compression failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  return { handleCompressPdf };
}
