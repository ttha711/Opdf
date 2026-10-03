import type React from "react";

interface UseCompressPdfArgs {
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
      const compressed = await bridge.compressPdf(bytes);
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
