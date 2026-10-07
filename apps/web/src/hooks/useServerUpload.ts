import { useCallback, useEffect, useRef } from "react";
import type { Annotation } from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";
import {
  cancelPdfUpload,
  uploadPdfToServer,
  type ServerUploadSession,
} from "./opdf-bridge/serverUpload";

export const OPDF_UPLOAD_STATUS_EVENT = "opdf:upload-status";
export const OPDF_UPLOAD_RETRY_EVENT = "opdf:upload-retry";
export const OPDF_UPLOAD_CANCEL_EVENT = "opdf:upload-cancel";

export type ServerUploadUiState = {
  status: "idle" | "uploading" | "stored" | "failed";
  fileName?: string;
  loaded?: number;
  total?: number;
  percent?: number;
  error?: string;
};

type PendingUpload = {
  file: File;
  token: string;
  localIdentity: string;
  controller: AbortController;
  session: ServerUploadSession | null;
};

type Args = {
  bridge: OpdfBridge;
  sourceIdentity: string;
  saveState: "idle" | "saving" | "saved";
  setFileName: (value: string) => void;
  setDocBytes: (value: Uint8Array | null) => void;
  setSourceBlob: (value: Blob | null) => void;
  setSourceIdentity: (value: string) => void;
  setPage: (value: number) => void;
  setTotalPages: (value: number) => void;
  setViewerError: (value: string | null) => void;
  setAnnotations: (value: Annotation[]) => void;
  markDocumentSaved: (snapshot?: {
    fileName?: string;
    docBytes?: Uint8Array | null;
    documentIdentity?: string;
    annotations?: Annotation[];
  }) => void;
};

function emitUploadState(state: ServerUploadUiState) {
  window.dispatchEvent(new CustomEvent<ServerUploadUiState>(OPDF_UPLOAD_STATUS_EVENT, {
    detail: state,
  }));
}

function progressText(loaded: number, total: number) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return `Uploading to OPDF Server… ${percent}%`;
}

function sessionUploadedBytes(session: ServerUploadSession | null, fileSize: number) {
  if (!session) return 0;
  return session.uploadedChunks.reduce((total, index) => {
    const start = index * session.chunkBytes;
    return total + Math.max(0, Math.min(session.chunkBytes, fileSize - start));
  }, 0);
}

export function useServerUpload(args: Args) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const pendingRef = useRef<PendingUpload | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current != null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const runUpload = useCallback(async (pending: PendingUpload) => {
    const baseUrl = window.__OPDF_SERVER_BASE__ || "/api/opdf";
    try {
      const result = await uploadPdfToServer(pending.file, pending.file.name, {
        baseUrl,
        signal: pending.controller.signal,
        session: pending.session,
        onSession: (session) => {
          if (pendingRef.current?.token === pending.token) {
            pending.session = session;
          }
        },
        onProgress: (loaded, total) => {
          if (pendingRef.current?.token !== pending.token) return;
          const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
          emitUploadState({
            status: "uploading",
            fileName: pending.file.name,
            loaded,
            total,
            percent,
          });
          argsRef.current.setViewerError(progressText(loaded, total));
        },
      });

      if (pendingRef.current?.token !== pending.token) return;
      const current = argsRef.current;
      const isStillActive = current.sourceIdentity === pending.localIdentity;
      if (isStillActive) {
        current.setSourceIdentity(result.filePath);
        if (current.saveState === "saved") {
          current.markDocumentSaved({
            fileName: pending.file.name,
            docBytes: null,
            documentIdentity: result.filePath,
          });
        }
      }
      window.dispatchEvent(new CustomEvent("opdf:upload-complete", {
        detail: {
          localIdentity: pending.localIdentity,
          serverIdentity: result.filePath,
          fileName: pending.file.name,
        },
      }));
      pendingRef.current = null;
      argsRef.current.setViewerError("Stored on OPDF Server.");
      emitUploadState({
        status: "stored",
        fileName: pending.file.name,
        loaded: pending.file.size,
        total: pending.file.size,
        percent: 100,
      });
      clearSuccessTimer();
      successTimerRef.current = window.setTimeout(() => {
        emitUploadState({ status: "idle" });
        argsRef.current.setViewerError(null);
        successTimerRef.current = null;
      }, 3000);
    } catch (error) {
      if (pendingRef.current?.token !== pending.token || pending.controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Upload failed.";
      argsRef.current.setViewerError(`Upload failed: ${message}. PDF remains open locally.`);
      emitUploadState({
        status: "failed",
        fileName: pending.file.name,
        loaded: sessionUploadedBytes(pending.session, pending.file.size),
        total: pending.file.size,
        percent: pending.file.size > 0
          ? Math.round((sessionUploadedBytes(pending.session, pending.file.size) / pending.file.size) * 100)
          : 0,
        error: message,
      });
    }
  }, [clearSuccessTimer]);

  const cancelUpload = useCallback(() => {
    clearSuccessTimer();
    const pending = pendingRef.current;
    if (!pending) {
      emitUploadState({ status: "idle" });
      return;
    }
    pending.controller.abort();
    pendingRef.current = null;
    void cancelPdfUpload(pending.session, window.__OPDF_SERVER_BASE__ || "/api/opdf");
    argsRef.current.setViewerError(null);
    emitUploadState({ status: "idle" });
  }, [clearSuccessTimer]);

  const retryUpload = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pending.controller = new AbortController();
    const loaded = sessionUploadedBytes(pending.session, pending.file.size);
    argsRef.current.setViewerError(progressText(loaded, pending.file.size));
    emitUploadState({
      status: "uploading",
      fileName: pending.file.name,
      loaded,
      total: pending.file.size,
      percent: pending.file.size > 0
        ? Math.round((loaded / pending.file.size) * 100)
        : 0,
    });
    void runUpload(pending);
  }, [runUpload]);

  const openLocalFirst = useCallback((file: File) => {
    const previous = pendingRef.current;
    if (previous) {
      previous.controller.abort();
      void cancelPdfUpload(previous.session, window.__OPDF_SERVER_BASE__ || "/api/opdf");
    }
    clearSuccessTimer();

    const token = crypto.randomUUID();
    const localIdentity = `local-upload://${token}/${encodeURIComponent(file.name)}`;
    const pending: PendingUpload = {
      file,
      token,
      localIdentity,
      controller: new AbortController(),
      session: null,
    };
    pendingRef.current = pending;

    argsRef.current.setFileName(file.name);
    argsRef.current.setDocBytes(null);
    argsRef.current.setSourceBlob(file);
    argsRef.current.setSourceIdentity(localIdentity);
    argsRef.current.setPage(1);
    argsRef.current.setTotalPages(0);
    argsRef.current.setViewerError(progressText(0, file.size));
    argsRef.current.setAnnotations([]);
    argsRef.current.markDocumentSaved({
      fileName: file.name,
      docBytes: null,
      documentIdentity: localIdentity,
      annotations: [],
    });
    if (!navigator.onLine) {
      pendingRef.current = null;
      argsRef.current.setViewerError("Offline — PDF is open locally.");
      emitUploadState({ status: "idle" });
      return;
    }

    emitUploadState({
      status: "uploading",
      fileName: file.name,
      loaded: 0,
      total: file.size,
      percent: 0,
    });
    void runUpload(pending);
  }, [clearSuccessTimer, runUpload]);

  useEffect(() => {
    const retry = () => retryUpload();
    const cancel = () => cancelUpload();
    window.addEventListener(OPDF_UPLOAD_RETRY_EVENT, retry);
    window.addEventListener(OPDF_UPLOAD_CANCEL_EVENT, cancel);
    return () => {
      window.removeEventListener(OPDF_UPLOAD_RETRY_EVENT, retry);
      window.removeEventListener(OPDF_UPLOAD_CANCEL_EVENT, cancel);
      clearSuccessTimer();
      pendingRef.current?.controller.abort();
    };
  }, [cancelUpload, clearSuccessTimer, retryUpload]);

  return { openLocalFirst, cancelUpload };
}
