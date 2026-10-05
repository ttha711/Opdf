import { useCallback } from "react";
import { pdfSourceToBytes, resolvePdfSource } from "../lib/documentSource";

type NativeEditSource = {
  docBytes: Uint8Array | null;
  sourceBlob: Blob | null;
  sourceIdentity: string;
};

export function useNativeEditBytes(source: NativeEditSource) {
  return useCallback(async () => {
    const pdfSource = resolvePdfSource({
      docBytes: source.docBytes,
      sourceBlob: source.sourceBlob,
      sourceIdentity: source.sourceIdentity,
    });
    return pdfSource ? pdfSourceToBytes(pdfSource) : null;
  }, [source.docBytes, source.sourceBlob, source.sourceIdentity]);
}
