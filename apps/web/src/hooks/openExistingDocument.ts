import type { Annotation } from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";
import { computeFileHash, loadAnnotationsByHash } from "../lib/web-storage";
import { resolveBrowserDocumentReference } from "../lib/openDocumentReference";

type SavedSnapshot = {
  fileName?: string;
  docBytes?: Uint8Array | null;
  documentIdentity?: string;
  annotations?: Annotation[];
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
        await args.bridge.pushRecent(result.filePath);
        args.markDocumentSaved({
          fileName: result.filePath,
          docBytes: result.bytes,
          annotations,
        });
      } catch {
        args.onError("Unable to open the file. Please try again.");
      }
      return;
    }

    try {
      args.setViewerError("Loading file...");
      const resolved = await resolveBrowserDocumentReference(filePath);
      const annotations = resolved.isServerDocument
        ? await args.bridge.listAnnotations(resolved.identity)
        : ((await loadAnnotationsByHash(resolved.identity) ?? []) as Annotation[]);

      args.setFileName(resolved.displayName);
      args.setDocBytes(null);
      args.setSourceBlob(resolved.blob);
      args.setSourceIdentity(resolved.identity);
      args.setPage(1);
      args.setTotalPages(0);
      args.setViewerError(null);
      args.setAnnotations(annotations);
      if (resolved.isServerDocument) await args.bridge.pushRecent(resolved.identity);
      args.markDocumentSaved({
        fileName: resolved.displayName,
        docBytes: null,
        documentIdentity: resolved.identity,
        annotations,
      });
    } catch (error) {
      args.setViewerError(error instanceof Error ? error.message : "Unable to open file");
    }
  };
}
