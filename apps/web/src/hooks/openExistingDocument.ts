import type { Annotation } from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";
import { computeBlobHash, computeFileHash, loadAnnotationsByHash } from "../lib/web-storage";

type SavedSnapshot = {
  fileName?: string;
  docBytes?: Uint8Array | null;
  documentIdentity?: string;
  annotations?: Annotation[];
  pageRotations?: Record<number, number>;
};

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
  setPageRotations: (value: Record<number, number>) => void;
  markDocumentSaved: (snapshot?: SavedSnapshot) => void;
  onError: (message: string) => void;
};

export function createOpenExistingDocument(args: Args) {
  return async function openFileWithPath(filePath: string) {
    if (args.hasDesktopBridge) {
      try {
        const result = await args.bridge.openDocument(filePath);
        if (!result) return;
        const bridgeAnnotations = await args.bridge.listAnnotations(result.filePath);
        const hash = await computeFileHash(result.bytes);
        const annotations = bridgeAnnotations.length > 0
          ? bridgeAnnotations
          : ((await loadAnnotationsByHash(hash) ?? []) as Annotation[]);
        args.setFileName(result.filePath);
        args.setDocBytes(result.bytes);
        args.setSourceBlob(null);
        args.setSourceIdentity("");
        args.setPage(1);
        args.setTotalPages(0);
        args.setViewerError(null);
        args.setAnnotations(annotations);
        args.setPageRotations({});
        await args.bridge.pushRecent(result.filePath);
        args.markDocumentSaved({
          fileName: result.filePath,
          docBytes: result.bytes,
          annotations,
          pageRotations: {},
        });
      } catch {
        args.onError("Unable to open the file. Please try again.");
      }
      return;
    }

    try {
      args.setViewerError("Loading file...");
      const isServerDocument = filePath.startsWith("server://");
      const blob = isServerDocument
        ? null
        : await fetch(`/@fs/${filePath.replaceAll("\\", "/")}`).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status} when trying to load file`);
            return response.blob();
          });
      const encodedName = filePath.split("/").pop() || filePath;
      const displayName = isServerDocument ? decodeURIComponent(encodedName) : encodedName;
      const identity = isServerDocument
        ? filePath
        : await computeBlobHash(blob as Blob, displayName, 0);
      const annotations = isServerDocument
        ? await args.bridge.listAnnotations(identity)
        : ((await loadAnnotationsByHash(identity) ?? []) as Annotation[]);

      args.setFileName(displayName);
      args.setDocBytes(null);
      args.setSourceBlob(blob);
      args.setSourceIdentity(identity);
      args.setPage(1);
      args.setTotalPages(0);
      args.setViewerError(null);
      args.setAnnotations(annotations);
      args.setPageRotations({});
      if (isServerDocument) await args.bridge.pushRecent(identity);
      args.markDocumentSaved({
        fileName: displayName,
        docBytes: null,
        documentIdentity: identity,
        annotations,
        pageRotations: {},
      });
    } catch (error) {
      args.setViewerError(error instanceof Error ? error.message : "Unable to open file");
    }
  };
}
