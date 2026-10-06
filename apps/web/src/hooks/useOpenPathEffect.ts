import { useEffect, useRef } from "react";
import type { Annotation } from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";
import { resolveBrowserDocumentReference } from "../lib/openDocumentReference";

type Args = {
  bridge: OpdfBridge;
  hasDesktopBridge: boolean;
  setFileName: (value: string) => void;
  setDocBytes: (value: Uint8Array | null) => void;
  setSourceBlob: (value: Blob | null) => void;
  setSourceIdentity: (value: string) => void;
  setPage: (value: number) => void;
  setTotalPages: (value: number) => void;
  setViewerError: (value: string | null) => void;
  setAnnotations: (value: Annotation[]) => void;
  markDocumentSaved: (snapshot: {
    fileName: string;
    docBytes: Uint8Array | null;
    documentIdentity: string;
    annotations: Annotation[];
  }) => void;
};

export function useOpenPathEffect(args: Args) {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openPath = params.get("open");
    if (!openPath || argsRef.current.hasDesktopBridge) return;
    const requestedPath = openPath;

    let cancelled = false;
    async function loadPath() {
      const current = argsRef.current;
      try {
        const resolved = await resolveBrowserDocumentReference(requestedPath);
        if (cancelled) return;

        const annotations = resolved.isServerDocument
          ? await current.bridge.listAnnotations(resolved.identity)
          : [];
        if (cancelled) return;

        current.setFileName(resolved.displayName);
        current.setDocBytes(null);
        current.setSourceBlob(resolved.blob);
        current.setSourceIdentity(resolved.identity);
        current.setPage(1);
        current.setTotalPages(0);
        current.setViewerError(null);
        current.setAnnotations(annotations);
        if (resolved.isServerDocument) await current.bridge.pushRecent(resolved.identity);
        current.markDocumentSaved({
          fileName: resolved.displayName,
          docBytes: null,
          documentIdentity: resolved.identity,
          annotations,
        });
      } catch {
        if (!cancelled) argsRef.current.setViewerError("Unable to open file");
      }
    }

    void loadPath();
    return () => {
      cancelled = true;
    };
  }, []);
}
