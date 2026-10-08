import { useMemo } from "react";
import { pdfSourceToBytes, resolvePdfSource } from "../lib/documentSource";

type NativeEditSource = {
  docBytes: Uint8Array | null;
  sourceBlob: Blob | null;
  sourceIdentity: string;
};

export function useNativeEditBytes(source: NativeEditSource) {
  return useMemo(() => {
    // Share both the in-flight download and its result across page inspections.
    // A new source or document revision creates a fresh provider and cache.
    let pending: Promise<Uint8Array | null> | null = null;
    return () => {
      if (!pending) {
        const pdfSource = resolvePdfSource({
          docBytes: source.docBytes,
          sourceBlob: source.sourceBlob,
          sourceIdentity: source.sourceIdentity,
        });
        pending = (pdfSource ? pdfSourceToBytes(pdfSource) : Promise.resolve(null))
          .catch((error: unknown) => {
            pending = null; // Allow retry after a transient fetch failure.
            throw error;
          });
      }
      return pending;
    };
  }, [source.docBytes, source.sourceBlob, source.sourceIdentity]);
}
