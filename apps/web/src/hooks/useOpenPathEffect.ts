import { useEffect, useRef } from "react";
import type { Annotation } from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";
import { computeBlobHash } from "../lib/web-storage";

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
  setThumbnails: (value: Array<{ page: number; url: string; blob: Blob }>) => void;
  setAnnotations: (value: Annotation[]) => void;
  setBookmarks: (value: Array<{ id: string; page: number; title: string; createdAt: number }>) => void;
  setPageRotations: (value: Record<number, number>) => void;
  markDocumentSaved: (snapshot: {
    fileName: string;
    docBytes: Uint8Array | null;
    documentIdentity: string;
    annotations: Annotation[];
    bookmarks: Array<{ id: string; page: number; title: string; createdAt: number }>;
    pageRotations: Record<number, number>;
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
        const isServerDocument = requestedPath.startsWith("server://");
        const blob = isServerDocument
          ? null
          : await fetch(`/@fs/${requestedPath.replaceAll("\\", "/")}`).then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.blob();
            });
        if (cancelled) return;

        const encodedName = requestedPath.split(/[\\/]/).pop() || requestedPath;
        const displayName = isServerDocument ? decodeURIComponent(encodedName) : encodedName;
        const identity = isServerDocument
          ? requestedPath
          : await computeBlobHash(blob as Blob, displayName, 0);
        const annotations = isServerDocument
          ? await current.bridge.listAnnotations(identity)
          : [];
        if (cancelled) return;

        current.setFileName(displayName);
        current.setDocBytes(null);
        current.setSourceBlob(blob);
        current.setSourceIdentity(identity);
        current.setPage(1);
        current.setTotalPages(0);
        current.setViewerError(null);
        current.setThumbnails([]);
        current.setAnnotations(annotations);
        current.setBookmarks([]);
        current.setPageRotations({});
        if (isServerDocument) await current.bridge.pushRecent(identity);
        current.markDocumentSaved({
          fileName: displayName,
          docBytes: null,
          documentIdentity: identity,
          annotations,
          bookmarks: [],
          pageRotations: {},
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
