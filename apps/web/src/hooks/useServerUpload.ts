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

function emitUploadState(state: ServerUploadUiState) {
  window.dispatchEvent(new CustomEvent<ServerUploadUiState>(OPDF_UPLOAD_STATUS_EVENT, {
    detail: state,
  }));
}

function progressText(loaded: number, total: number) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return `Uploading to OPDF Server… ${percent}%`;
}

export function useServerUpload(args: Args) {
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
          args.setViewerError(progressText(loaded, total));
        },
      });

      if (pendingRef.current?.token !== pending.token) return;
      const annotations = await args.bridge.listAnnotations(result.filePath).catch(() => [] as Annotation[]);
      if (pendingRef.current?.token !== pending.token) return;

      args.setSourceIdentity(result.filePath);
      args.setAnnotations(annotations);
      args.markDocumentSaved({
        fileName: pending.file.name,
        docBytes: null,
        documentIdentity: result.filePath,
        annotations,
        bookmarks: [],
        pageRotations: {},
      });
      pendingRef.current = null;
      args.setViewerError("Stored on OPDF Server.");
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
        args.setViewerError(null);
        successTimerRef.current = null;
      }, 3000);
    } catch (error) {
      if (pendingRef.current?.token !== pending.token || pending.controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Upload failed.";
      args.setViewerError(`Upload failed: ${message}. PDF remains open locally.`);
      emitUploadState({
        status: "failed",
        fileName: pending.file.name,
        loaded: pending.session?.received ?? 0,
        total: pending.file.size,
        percent: pending.file.size > 0
          ? Math.round(((pending.session?.received ?? 0) / pending.file.size) * 100)
          : 0,
        error: message,
      });
    }
  }, [args, clearSuccessTimer]);

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
    args.setViewerError(null);
    emitUploadState({ status: "idle" });
  }, [args, clearSuccessTimer]);

  const retryUpload = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || !pending.controller.signal.aborted && !pending.session) {
      if (!pending) return;
    }
    pending.controller = new AbortController();
    args.setViewerError(progressText(pending.session?.received ?? 0, pending.file.size));
    emitUploadState({
      status: "uploading",
      fileName: pending.file.name,
      loaded: pending.session?.received ?? 0,
      total: pending.file.size,
      percent: pending.file.size > 0
        ? Math.round(((pending.session?.received ?? 0) / pending.file.size) * 100)
        : 0,
    });
    void runUpload(pending);
  }, [args, runUpload]);

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

    args.setFileName(file.name);
    args.setDocBytes(null);
    args.setSourceBlob(file);
    args.setSourceIdentity(localIdentity);
    args.setPage(1);
    args.setTotalPages(0);
    args.setViewerError(progressText(0, file.size));
    args.setThumbnails([]);
    args.setAnnotations([]);
    args.setBookmarks([]);
    args.setPageRotations({});
    args.markDocumentSaved({
      fileName: file.name,
      docBytes: null,
      documentIdentity: localIdentity,
      annotations: [],
      bookmarks: [],
      pageRotations: {},
    });
    emitUploadState({
      status: "uploading",
      fileName: file.name,
      loaded: 0,
      total: file.size,
      percent: 0,
    });
    void runUpload(pending);
  }, [args, clearSuccessTimer, runUpload]);

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
