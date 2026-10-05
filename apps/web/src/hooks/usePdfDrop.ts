import { useCallback } from "react";
import type { Annotation } from "@opdf/core";
import { computeBlobHash, loadAnnotationsByHash } from "../lib/web-storage";

type UsePdfDropArgs = {
  setFileName: (name: string) => void;
  setDocBytes: (bytes: Uint8Array | null) => void;
  setSourceBlob: (blob: Blob | null) => void;
  setSourceIdentity: (identity: string) => void;
  setPage: (page: number) => void;
  setViewerError: (error: string | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;
};

export function usePdfDrop({
  setFileName,
  setDocBytes,
  setSourceBlob,
  setSourceIdentity,
  setPage,
  setViewerError,
  setAnnotations,
}: UsePdfDropArgs) {
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find(
      (candidate) =>
        candidate.type === "application/pdf" ||
        candidate.name.toLowerCase().endsWith(".pdf"),
    );
    if (!file) return;

    const identity = await computeBlobHash(file, file.name, file.lastModified);
    const savedAnnotations = (await loadAnnotationsByHash(identity) ?? []) as Annotation[];

    setFileName(file.name);
    setDocBytes(null);
    setSourceBlob(file);
    setSourceIdentity(identity);
    setPage(1);
    setViewerError(null);
    setAnnotations(savedAnnotations);
  }, [
    setAnnotations,
    setDocBytes,
    setFileName,
    setPage,
    setSourceBlob,
    setSourceIdentity,
    setViewerError,
  ]);

  return { onDragOver, onDrop };
}
