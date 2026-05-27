import { useEffect, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Annotation } from "@opdf/core";
import { useOpdfBridge } from "./useOpdfBridge";

export function useDocumentLifecycle({
  bridge,
  hasDesktopBridge,
  fileInputRef,
  page,
  setFileName,
  setDocBytes,
  setPage,
  setTotalPages,
  setViewerError,
  setThumbnails,
  setAnnotations,
  setTransitionTick,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  hasDesktopBridge: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  page: number;
  setFileName: Dispatch<SetStateAction<string>>;
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setThumbnails: Dispatch<SetStateAction<Array<{ page: number; url: string; blob: Blob }>>>;
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  setTransitionTick: Dispatch<SetStateAction<number>>;
}) {
  async function loadBrowserFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setDocBytes(bytes);
    setPage(1);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
  }

  async function openFile() {
    if (!hasDesktopBridge) {
      const input = fileInputRef.current;
      if (!input) {
        setViewerError("File picker is unavailable.");
        return;
      }
      input.value = "";
      try {
        if (typeof input.showPicker === "function") {
          try {
            input.showPicker();
          } catch {
            // Fallback for browsers that restrict showPicker in async context
            input.click();
          }
        } else {
          input.click();
        }
      } catch {
        setViewerError("Cannot open file picker. Please click 'Choose File' directly.");
      }
      return;
    }

    try {
      const result = await bridge.pickAndOpenDocument();
      if (result) {
        setFileName(result.filePath);
        setDocBytes(result.bytes);
        setPage(1);
        setViewerError(null);
        setThumbnails([]);
        await bridge.pushRecent(result.filePath);
        setAnnotations(await bridge.listAnnotations(result.filePath));
      }
    } catch {}
  }

  async function openFileWithPath(filePath: string) {
    if (hasDesktopBridge) {
      try {
        const result = await bridge.pickAndOpenDocument();
        if (result) {
          setFileName(result.filePath);
          setDocBytes(result.bytes);
          setPage(1);
          setViewerError(null);
          setThumbnails([]);
          await bridge.pushRecent(result.filePath);
          setAnnotations(await bridge.listAnnotations(result.filePath));
        }
      } catch {}
      return;
    }

    try {
      setViewerError("Loading file...");
      const response = await fetch(`/@fs/${filePath.replaceAll("\\", "/")}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} when trying to load file`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      setFileName(filePath.split(/[\\/]/).pop() || filePath);
      setDocBytes(bytes);
      setPage(1);
      setViewerError(null);
      setThumbnails([]);
      setAnnotations([]);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "Unable to open file");
    }
  }

  async function onSelectLocalFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadBrowserFile(file);
  }

  function replaceDocumentBytes(bytes: Uint8Array, nextPage = page) {
    setDocBytes(bytes);
    setAnnotations([]);
    setThumbnails([]);
    setViewerError(null);
    setPage(Math.max(1, nextPage));
    setTransitionTick((n) => n + 1);
  }

  function closeDocument() {
    setDocBytes(null);
    setFileName("");
    setPage(1);
    setTotalPages(0);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
    import("../lib/web-storage").then(m => m.clearDraft());
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openPath = params.get("open");
    if (!openPath || hasDesktopBridge) return;
    const devOpenPath = openPath;

    let cancelled = false;
    async function loadDevFile() {
      try {
        const response = await fetch(`/@fs/${devOpenPath.replaceAll("\\", "/")}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setFileName(devOpenPath.split(/[\\/]/).pop() || devOpenPath);
        setDocBytes(bytes);
        setPage(1);
        setViewerError(null);
        setThumbnails([]);
        setAnnotations([]);
      } catch (error) {
        if (!cancelled) setViewerError(error instanceof Error ? error.message : "Unable to open file");
      }
    }

    void loadDevFile();
    return () => {
      cancelled = true;
    };
  }, [hasDesktopBridge, setAnnotations, setDocBytes, setFileName, setPage, setThumbnails, setViewerError]);

  return { openFile, openFileWithPath, onSelectLocalFile, replaceDocumentBytes, closeDocument };
}
