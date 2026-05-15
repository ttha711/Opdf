import { useCallback } from "react";
import type { Annotation } from "@opdf/core";

type UsePdfDropArgs = {
  setFileName: (name: string) => void;
  setDocBytes: (bytes: Uint8Array | null) => void;
  setPage: (page: number) => void;
  setViewerError: (error: string | null) => void;
  setThumbnails: (thumbs: Array<{ page: number; url: string; blob: Blob }>) => void;
  setAnnotations: (annotations: Annotation[]) => void;
};

export function usePdfDrop({
  setFileName,
  setDocBytes,
  setPage,
  setViewerError,
  setThumbnails,
  setAnnotations,
}: UsePdfDropArgs) {
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(
      f => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setDocBytes(bytes);
    setPage(1);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
  }, [setAnnotations, setDocBytes, setFileName, setPage, setThumbnails, setViewerError]);

  return { onDragOver, onDrop };
}
