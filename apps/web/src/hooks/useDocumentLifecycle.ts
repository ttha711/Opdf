import { useEffect, useRef, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Annotation } from "@opdf/core";
import { useOpdfBridge } from "./useOpdfBridge";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

export function useDocumentLifecycle({
  bridge,
  hasDesktopBridge,
  fileInputRef,
  page,
  saveState,
  setFileName,
  setDocBytes,
  setPage,
  setTotalPages,
  setViewerError,
  setThumbnails,
  setAnnotations,
  setBookmarks,
  setPageRotations,
  setTransitionTick,
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
  setPage: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setThumbnails: Dispatch<SetStateAction<Array<{ page: number; url: string; blob: Blob }>>>;
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  setBookmarks: Dispatch<SetStateAction<Array<{ id: string; page: number; title: string; createdAt: number }>>>;
  setPageRotations: Dispatch<SetStateAction<Record<number, number>>>;
  setTransitionTick: Dispatch<SetStateAction<number>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
  markDocumentSaved: (snapshot?: {
    fileName?: string;
    docBytes?: Uint8Array | null;
    annotations?: Annotation[];
    bookmarks?: Array<{ id: string; page: number; title: string; createdAt: number }>;
    pageRotations?: Record<number, number>;
  }) => void;
  clearDocumentSaveTracking: () => void;
}) {
  const isOpeningFileRef = useRef(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function loadBrowserFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setDocBytes(bytes);
    setPage(1);
    setTotalPages(0);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
    setBookmarks([]);
    setPageRotations({});
    markDocumentSaved({ fileName: file.name, docBytes: bytes, annotations: [], bookmarks: [], pageRotations: {} });
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
        const loadedAnnotations = await bridge.listAnnotations(result.filePath);
        setFileName(result.filePath);
        setDocBytes(result.bytes);
        setPage(1);
        setTotalPages(0);
        setViewerError(null);
        setThumbnails([]);
        setBookmarks([]);
        setPageRotations({});
        await bridge.pushRecent(result.filePath);
        setAnnotations(loadedAnnotations);
        markDocumentSaved({
          fileName: result.filePath,
          docBytes: result.bytes,
          annotations: loadedAnnotations,
          bookmarks: [],
          pageRotations: {},
        });
      }
    } catch (error) {
      console.warn("openFile failed:", error);
      toast.error("Không thể mở tệp. Vui lòng thử lại.");
    } finally {
      // Always release the open-file lock deterministically.
      isOpeningFileRef.current = false;
    }
  }

  async function openFileWithPath(filePath: string) {
    if (hasDesktopBridge) {
      try {
        const result = await bridge.openDocument(filePath);
        if (result) {
          const loadedAnnotations = await bridge.listAnnotations(result.filePath);
          setFileName(result.filePath);
          setDocBytes(result.bytes);
          setPage(1);
          setTotalPages(0);
          setViewerError(null);
          setThumbnails([]);
          setBookmarks([]);
          setPageRotations({});
          await bridge.pushRecent(result.filePath);
          setAnnotations(loadedAnnotations);
          markDocumentSaved({
            fileName: result.filePath,
            docBytes: result.bytes,
            annotations: loadedAnnotations,
            bookmarks: [],
            pageRotations: {},
          });
        }
      } catch (error) {
        console.warn("openFileWithPath failed:", error);
        toast.error("Không thể mở tệp. Vui lòng thử lại.");
      }
      return;
    }

    try {
      setViewerError("Loading file...");
      const response = await fetch(`/@fs/${filePath.replaceAll("\\", "/")}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} when trying to load file`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const displayName = filePath.split(/[\\/]/).pop() || filePath;
      setFileName(displayName);
      setDocBytes(bytes);
      setPage(1);
      setTotalPages(0);
      setViewerError(null);
      setThumbnails([]);
      setAnnotations([]);
      setBookmarks([]);
      setPageRotations({});
      markDocumentSaved({
        fileName: displayName,
        docBytes: bytes,
        annotations: [],
        bookmarks: [],
        pageRotations: {},
      });
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
    setSaveState("idle");
  }

  async function closeDocument() {
    // Guard: require confirmation when there are unsaved changes (saveState "idle"
    // means the current fingerprint differs from the last saved one — see StatusBar "Unsaved").
    if (saveState === "idle") {
      const ok = await confirm({
        title: "Đóng tài liệu",
        message: "Tài liệu có thay đổi chưa lưu. Đóng mà không lưu?",
        confirmLabel: "Đóng không lưu",
        danger: true,
      });
      if (!ok) return;
    }
    setDocBytes(null);
    setFileName("");
    setPage(1);
    setTotalPages(0);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
    setBookmarks([]);
    setPageRotations({});
    clearDocumentSaveTracking();
    const { clearDraft } = await import("../lib/web-storage");
    await clearDraft();
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
        const displayName = devOpenPath.split(/[\\/]/).pop() || devOpenPath;
        setFileName(displayName);
        setDocBytes(bytes);
        setPage(1);
        setTotalPages(0);
        setViewerError(null);
        setThumbnails([]);
        setAnnotations([]);
        setBookmarks([]);
        setPageRotations({});
        markDocumentSaved({
          fileName: displayName,
          docBytes: bytes,
          annotations: [],
          bookmarks: [],
          pageRotations: {},
        });
      } catch {
        if (!cancelled) setViewerError("Unable to open file");
      }
    }

    void loadDevFile();
    return () => {
      cancelled = true;
    };
  }, [hasDesktopBridge, setAnnotations, setDocBytes, setFileName, setPage, setThumbnails, setViewerError]);

  return { openFile, openFileWithPath, onSelectLocalFile, replaceDocumentBytes, closeDocument };
}
