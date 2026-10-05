import { useRef, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Annotation } from "@opdf/core";
import { isOpdfServerRuntime, useOpdfBridge } from "./useOpdfBridge";
import { useServerUpload } from "./useServerUpload";
import { useOpenPathEffect } from "./useOpenPathEffect";
import { createOpenExistingDocument } from "./openExistingDocument";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";
import { computeBlobHash, computeFileHash, loadAnnotationsByHash } from "../lib/web-storage";

export function useDocumentLifecycle({
  bridge,
  hasDesktopBridge,
  fileInputRef,
  page,
  saveState,
  setFileName,
  setDocBytes,
  setSourceBlob,
  sourceIdentity,
  setSourceIdentity,
  setPage,
  setTotalPages,
  setViewerError,
  setAnnotations,
  setPageRotations,
  setSaveState,
  markDocumentSaved,
  clearDocumentSaveTracking,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  hasDesktopBridge: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  page: number;
  saveState: "idle" | "saving" | "saved";
  setFileName: Dispatch<SetStateAction<string>>;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setSourceBlob: Dispatch<SetStateAction<Blob | null>>;
  sourceIdentity: string;
  setSourceIdentity: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  setPageRotations: Dispatch<SetStateAction<Record<number, number>>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
  markDocumentSaved: (snapshot?: {
    fileName?: string;
    docBytes?: Uint8Array | null;
    documentIdentity?: string;
    annotations?: Annotation[];
    pageRotations?: Record<number, number>;
  }) => void;
  clearDocumentSaveTracking: () => void;
}) {
  const isOpeningFileRef = useRef(false);
  const toast = useToast();
  const confirm = useConfirm();

  const { openLocalFirst, cancelUpload } = useServerUpload({
    bridge,
    sourceIdentity,
    saveState,
    setFileName,
    setDocBytes,
    setSourceBlob,
    setSourceIdentity,
    setPage,
    setTotalPages,
    setViewerError,
      setAnnotations,
      setPageRotations,
    markDocumentSaved,
  });

  async function loadBrowserFile(file: File) {
    if (isOpdfServerRuntime()) {
      openLocalFirst(file);
      return;
    }

    const identity = await computeBlobHash(file, file.name, file.lastModified);
    const savedAnnotations = (await loadAnnotationsByHash(identity) ?? []) as Annotation[];
    setFileName(file.name);
    setDocBytes(null);
    setSourceBlob(file);
    setSourceIdentity(identity);
    setPage(1);
    setTotalPages(0);
    setViewerError(null);
    setAnnotations(savedAnnotations);
    setPageRotations({});
    markDocumentSaved({
      fileName: file.name,
      docBytes: null,
      documentIdentity: identity,
      annotations: savedAnnotations,
      pageRotations: {},
    });
  }

  async function openFile() {
    if (isOpeningFileRef.current) return;
    isOpeningFileRef.current = true;
    try {
      if (!hasDesktopBridge) {
        const input = fileInputRef.current;
        if (!input) {
          setViewerError("File picker is unavailable.");
          return;
        }
        input.value = "";
        try {
          // Keep file-open in the direct user-gesture path for best browser compatibility.
          input.click();
        } catch {
          try {
            if (typeof input.showPicker === "function") {
              input.showPicker();
            }
          } catch {
            setViewerError("Cannot open file picker. Please click 'Choose File' directly.");
          }
        }
        return;
      }

      const result = await bridge.pickAndOpenDocument();
      if (result) {
        const bridgeAnnotations = await bridge.listAnnotations(result.filePath);
        // If bridge has no persisted annotations (e.g. first run after restart), fall back to hash store.
        const hash = await computeFileHash(result.bytes);
        const loadedAnnotations: Annotation[] = bridgeAnnotations.length > 0
          ? bridgeAnnotations
          : ((await loadAnnotationsByHash(hash) ?? []) as Annotation[]);
        setFileName(result.filePath);
        setDocBytes(result.bytes);
        setSourceBlob(null);
        setSourceIdentity("");
        setPage(1);
        setTotalPages(0);
        setViewerError(null);
                setPageRotations({});
        await bridge.pushRecent(result.filePath);
        setAnnotations(loadedAnnotations);
        markDocumentSaved({
          fileName: result.filePath,
          docBytes: result.bytes,
          annotations: loadedAnnotations,
              pageRotations: {},
        });
      }
    } catch (error) {
      console.warn("openFile failed:", error);
      toast.error("Unable to open the file. Please try again.");
    } finally {
      // Always release the open-file lock deterministically.
      isOpeningFileRef.current = false;
    }
  }

  const openFileWithPath = createOpenExistingDocument({
    bridge,
    hasDesktopBridge,
    setFileName,
    setDocBytes,
    setSourceBlob,
    setSourceIdentity,
    setPage,
    setTotalPages,
    setViewerError,
      setAnnotations,
      setPageRotations,
    markDocumentSaved,
    onError: (message) => toast.error(message),
  });

  async function onSelectLocalFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadBrowserFile(file);
  }

  function replaceDocumentBytes(
    bytes: Uint8Array,
    nextPage = page,
    options: { preserveSourceIdentity?: boolean; resetDocumentMetadata?: boolean; preserveAnnotations?: boolean } = {},
  ) {
    const preserveSourceIdentity = options.preserveSourceIdentity ?? true;
    setDocBytes(bytes);
    setSourceBlob(null);
    setSourceIdentity(
      preserveSourceIdentity && sourceIdentity.startsWith("server://")
        ? sourceIdentity
        : "",
    );
    if (!options.preserveAnnotations) setAnnotations([]);
    if (options.resetDocumentMetadata) {
        setPageRotations({});
    }
    setTotalPages(0);
    setViewerError(null);
    setPage(Math.max(1, nextPage));
    setSaveState("idle");
  }

  async function closeDocument() {
    // Guard: require confirmation when there are unsaved changes (saveState "idle"
    // means the current fingerprint differs from the last saved one — see StatusBar "Unsaved").
    if (saveState === "idle") {
      const ok = await confirm({
        title: "Close document",
        message: "The document has unsaved changes. Close without saving?",
        confirmLabel: "Close without saving",
        danger: true,
      });
      if (!ok) return;
    }
    cancelUpload();
    setDocBytes(null);
    setSourceBlob(null);
    setSourceIdentity("");
    setFileName("");
    setPage(1);
    setTotalPages(0);
    setViewerError(null);
    setAnnotations([]);
    setPageRotations({});
    clearDocumentSaveTracking();
    const { clearDraft } = await import("../lib/web-storage");
    await clearDraft();
  }

  useOpenPathEffect({
    bridge,
    hasDesktopBridge,
    setFileName,
    setDocBytes,
    setSourceBlob,
    setSourceIdentity,
    setPage,
    setTotalPages,
    setViewerError,
      setAnnotations,
      setPageRotations,
    markDocumentSaved,
  });

  return { openFile, openFileWithPath, onSelectLocalFile, replaceDocumentBytes, closeDocument };
}
