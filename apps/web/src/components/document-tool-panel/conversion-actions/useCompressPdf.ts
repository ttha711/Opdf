import type React from "react";

interface UseCompressPdfArgs {
  docBytes: Uint8Array | null;
  bridge: any;
  compressLevel: "high" | "medium" | "low";
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: (msg: string | null) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCompressPdf(args: UseCompressPdfArgs) {
  const {
    docBytes,
    bridge,
    compressLevel,
    replaceDocumentBytes,
    setViewerError,
    setIsProcessing,
  } = args;

  const handleCompressPdf = async () => {
    if (!docBytes) return;
    setIsProcessing(true);
    setViewerError("Compressing document streams...");
    try {
      const compressed = await bridge.compressPdf(docBytes);
      replaceDocumentBytes(compressed);
      setViewerError(`Optimized successfully with ${compressLevel.toUpperCase()} Compression!`);
      setTimeout(() => setViewerError(null), 3500);
    } catch (err) {
      setViewerError("Compression failed: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  return { handleCompressPdf };
}
