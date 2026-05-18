import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Annotation } from "@opdf/core";
import { loadFullDraft, saveTabsList, loadTabsList, saveActiveTabId, loadActiveTabId, type OpdfTab } from "../lib/web-storage";
import type { ActiveTool } from "../lib/app-types";

type AppEffectsArgs = {
  bridge: { replaceAnnotations?: (fileName: string, annotations: Annotation[]) => Promise<unknown> };
  hasDesktopBridge: boolean;
  docBytes: Uint8Array | null;
  hasDocument: boolean;
  fileName: string;
  annotations: Annotation[];
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  bookmarks: Array<{ id: string; page: number; title: string; createdAt: number }>;
  page: number;
  theme: "light" | "dark";
  setFileName: (v: string) => void;
  setDocBytes: (v: Uint8Array | null) => void;
  setAnnotations: (v: Annotation[]) => void;
  setPage: (v: number) => void;
  setThumbnails: (v: Array<{ page: number; url: string; blob: Blob }>) => void;
  setBookmarks: (v: Array<{ id: string; page: number; title: string; createdAt: number }>) => void;
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

  // NEW TABS ARGS
  tabs: OpdfTab[];
  setTabs: (v: OpdfTab[]) => void;
  activeTabId: string | null;
  setActiveTabId: (v: string | null) => void;
  isSwitchingRef: RefObject<boolean>;
  setShowDashboard: (v: boolean) => void;
};

export function useAppEffects(args: AppEffectsArgs) {
  const {
    bridge, hasDesktopBridge, docBytes, hasDocument, fileName, annotations, thumbnails, bookmarks, page, theme,
    setFileName, setDocBytes, setAnnotations, setPage, setThumbnails, setBookmarks, setShowFindBar, setOpenMenu, setActiveTool, setTheme, findInputRef,
    openFile, exportPdf, undoAnnotations, redoAnnotations, zoomIn, zoomOut, goPrevPage, goNextPage,

    // NEW TABS PROPS
    tabs, setTabs, activeTabId, setActiveTabId, isSwitchingRef, setShowDashboard,
  } = args;

  // 1. Initial Tabs Restore on startup
  useEffect(() => {
    if (hasDesktopBridge) return;
    if (new URLSearchParams(window.location.search).has("open")) return;
    
    async function initTabs() {
      const loadedTabs = await loadTabsList();
      const loadedActiveId = await loadActiveTabId();
      
      const urlParams = new URLSearchParams(window.location.search);
      const groupFilter = urlParams.get("group") || null;

      if (loadedTabs && loadedTabs.length > 0) {
        const tabsWithUrls = loadedTabs.map(tab => {
          if (tab.thumbnails && tab.thumbnails.length > 0) {
            return {
              ...tab,
              thumbnails: tab.thumbnails.map(t => ({
                ...t,
                url: URL.createObjectURL(t.blob)
              }))
            };
          }
          return tab;
        });
        setTabs(tabsWithUrls);
        
        let targetTab = tabsWithUrls.find(t => t.id === loadedActiveId);
        
        if (groupFilter) {
          const groupTabs = tabsWithUrls.filter(t => t.group === groupFilter);
          if (groupTabs.length > 0) {
            if (!targetTab || targetTab.group !== groupFilter) {
              targetTab = groupTabs[0];
            }
          } else {
            targetTab = undefined;
          }
        }
        
        if (targetTab) {
          if (isSwitchingRef) {
            (isSwitchingRef as any).current = true;
          }
          setActiveTabId(targetTab.id);
          setFileName(targetTab.fileName);
          setDocBytes(targetTab.docBytes);
          setPage(targetTab.page || 1);
          setAnnotations(targetTab.annotations || []);
          setBookmarks(targetTab.bookmarks || []);
          setThumbnails(targetTab.thumbnails || []);
          
          if (bridge.replaceAnnotations) {
            await bridge.replaceAnnotations(targetTab.fileName, targetTab.annotations || []);
          }
          
          setTimeout(() => {
            if (isSwitchingRef) {
              (isSwitchingRef as any).current = false;
            }
          }, 100);
        } else {
          setShowDashboard(true);
        }
      } else {
        // Legacy draft loading fallback
        const draft = await loadFullDraft();
        if (draft && draft.bytes && draft.state) {
          const newTabId = "tab_initial";
          const newTab: OpdfTab = {
            id: newTabId,
            fileName: draft.state.fileName,
            docBytes: draft.bytes,
            page: draft.state.page || 1,
            totalPages: 0,
            annotations: draft.state.annotations || [],
            bookmarks: draft.state.bookmarks || [],
            group: null,
            groupColor: null
          };
          
          setTabs([newTab]);
          setActiveTabId(newTabId);
          setFileName(newTab.fileName);
          setDocBytes(newTab.docBytes);
          setPage(newTab.page);
          setAnnotations(newTab.annotations);
          setBookmarks(newTab.bookmarks);
          
          if (bridge.replaceAnnotations) {
            await bridge.replaceAnnotations(newTab.fileName, newTab.annotations || []);
          }
        } else {
          setShowDashboard(true);
        }
      }
    }
    void initTabs();
  }, [bridge, hasDesktopBridge]);

  // 2. Tabs Auto-Save effect
  useEffect(() => {
    if (hasDesktopBridge || tabs.length === 0) return;
    const timeout = setTimeout(() => {
      void saveTabsList(tabs);
      void saveActiveTabId(activeTabId);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [hasDesktopBridge, tabs, activeTabId]);

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
