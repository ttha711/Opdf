import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Annotation } from "@opdf/core";
import { loadFullDraft, savePdfBytes, saveWebState } from "../lib/web-storage";
import type { ActiveTool } from "../lib/app-types";

type AppEffectsArgs = {
  bridge: { replaceAnnotations?: (fileName: string, annotations: Annotation[]) => Promise<unknown> };
  hasDesktopBridge: boolean;
  docBytes: Uint8Array | null;
  hasDocument: boolean;
  fileName: string;
  annotations: Annotation[];
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  page: number;
  theme: "light" | "dark";
  setFileName: (v: string) => void;
  setDocBytes: (v: Uint8Array | null) => void;
  setAnnotations: (v: Annotation[]) => void;
  setPage: (v: number) => void;
  setThumbnails: (v: Array<{ page: number; url: string; blob: Blob }>) => void;
  setShowFindBar: Dispatch<SetStateAction<boolean>>;
  setOpenMenu: Dispatch<SetStateAction<string | null>>;
  setActiveTool: (v: ActiveTool) => void;
  setTheme: Dispatch<SetStateAction<"light" | "dark">>;
  findInputRef: RefObject<HTMLInputElement>;
  openFile: () => void;
  exportPdf: () => void;
  undoAnnotations: () => Promise<void>;
  redoAnnotations: () => Promise<void>;
  zoomIn: () => void;
  zoomOut: () => void;
  goPrevPage: () => void;
  goNextPage: () => void;
};

export function useAppEffects(args: AppEffectsArgs) {
  const {
    bridge, hasDesktopBridge, docBytes, hasDocument, fileName, annotations, thumbnails, page, theme,
    setFileName, setDocBytes, setAnnotations, setPage, setThumbnails, setShowFindBar, setOpenMenu, setActiveTool, setTheme, findInputRef,
    openFile, exportPdf, undoAnnotations, redoAnnotations, zoomIn, zoomOut, goPrevPage, goNextPage,
  } = args;

  useEffect(() => {
    if (hasDesktopBridge) return;
    async function initDraft() {
      const draft = await loadFullDraft();
      if (draft && draft.bytes && draft.state) {
        setFileName(draft.state.fileName);
        setDocBytes(draft.bytes);
        setAnnotations(draft.state.annotations || []);
        setPage(draft.state.page || 1);
        if (draft.state.thumbnails && draft.state.thumbnails.length > 0) {
          const restored = draft.state.thumbnails.map(t => ({ ...t, url: URL.createObjectURL(t.blob) }));
          setThumbnails(restored);
        }
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(draft.state.fileName, draft.state.annotations || []);
        }
      }
    }
    void initDraft();
  }, [bridge, hasDesktopBridge, setAnnotations, setDocBytes, setFileName, setPage, setThumbnails]);

  useEffect(() => {
    if (hasDesktopBridge || !docBytes) return;
    void savePdfBytes(docBytes);
  }, [hasDesktopBridge, docBytes]);

  useEffect(() => {
    if (hasDesktopBridge || !hasDocument) return;
    const timeout = setTimeout(() => {
      saveWebState({ fileName, annotations, thumbnails, page });
    }, 1500);
    return () => clearTimeout(timeout);
  }, [hasDesktopBridge, hasDocument, fileName, annotations, thumbnails, page]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("opdf-theme", theme);
  }, [theme]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (ctrl && e.key === "o") { e.preventDefault(); openFile(); return; }
      if (ctrl && e.key === "s") { e.preventDefault(); exportPdf(); return; }
      if (ctrl && e.key === "z") { e.preventDefault(); void undoAnnotations(); return; }
      if (ctrl && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); void redoAnnotations(); return; }
      if (ctrl && e.key === "f") {
        e.preventDefault();
        setShowFindBar(prev => {
          if (!prev) setTimeout(() => findInputRef.current?.focus(), 50);
          return !prev;
        });
        return;
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setTheme(t => (t === "light" ? "dark" : "light"));
        return;
      }

      if (inInput) return;
      if (e.key === "+" || e.key === "=") { zoomIn(); return; }
      if (e.key === "-") { zoomOut(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrevPage(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNextPage(); return; }
      if (e.key === "Escape") { setShowFindBar(false); setOpenMenu(null); }
      if (e.key.toLowerCase() === "v") { setActiveTool("select"); return; }
      if (e.key.toLowerCase() === "i") { setActiveTool("highlight"); return; }
      if (e.key.toLowerCase() === "t") { setActiveTool("note"); return; }
      if (e.key.toLowerCase() === "r") { setActiveTool("redact"); return; }
      if (e.key.toLowerCase() === "s") { setActiveTool("signature"); return; }
      if (e.key.toLowerCase() === "q") { setActiveTool("shape"); return; }
      if (e.key.toLowerCase() === "m") { setActiveTool("measure"); return; }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFile, exportPdf, undoAnnotations, redoAnnotations, zoomIn, zoomOut, goPrevPage, goNextPage, findInputRef, setActiveTool, setOpenMenu, setShowFindBar, setTheme]);
}
