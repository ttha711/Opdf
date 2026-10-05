import { useEffect, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Annotation } from "@opdf/core";
import { loadFullDraft, saveTabsList, loadTabsList, saveActiveTabId, loadActiveTabId, type OpdfTab } from "../lib/web-storage";
import type { ActiveTool } from "../lib/app-types";
import { isOpdfServerRuntime } from "./useOpdfBridge";
import { useGlobalKeyboardShortcuts } from "./useGlobalKeyboardShortcuts";

type AppEffectsArgs = {
  bridge: {
    replaceAnnotations?: (fileName: string, annotations: Annotation[]) => Promise<unknown>;
    writeSession?: (session: {
      activeFilePath: string | null;
      openTabs: string[];
      activeTabIndex: number;
      updatedAt: number;
    }) => Promise<void>;
  };
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
  setSourceBlob: (v: Blob | null) => void;
  setSourceIdentity: (v: string) => void;
  setAnnotations: (v: Annotation[]) => void;
  setPage: (v: number) => void;
  setThumbnails: (v: Array<{ page: number; url: string; blob: Blob }>) => void;
  setBookmarks: (v: Array<{ id: string; page: number; title: string; createdAt: number }>) => void;
  setPageRotations: (v: Record<number, number>) => void;
  setOpenMenu: Dispatch<SetStateAction<string | null>>;
  setActiveTool: (v: ActiveTool) => void;
  setTheme: Dispatch<SetStateAction<"light" | "dark">>;
  openFile: () => void;
  savePdf: () => void;
  savePdfAs: () => void;
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
    setFileName, setDocBytes, setSourceBlob, setSourceIdentity, setAnnotations, setPage, setThumbnails, setBookmarks, setPageRotations, setOpenMenu, setActiveTool, setTheme,
    openFile, savePdf, savePdfAs, exportPdf, undoAnnotations, redoAnnotations, zoomIn, zoomOut, goPrevPage, goNextPage,

    // NEW TABS PROPS
    tabs, setTabs, activeTabId, setActiveTabId, isSwitchingRef, setShowDashboard,
  } = args;

  const [hasRestoredTabs, setHasRestoredTabs] = useState(() => {
    if (typeof window === "undefined") return hasDesktopBridge;
    return hasDesktopBridge || new URLSearchParams(window.location.search).has("open");
  });

  // 1. Initial Tabs Restore on startup
  useEffect(() => {
    if (hasDesktopBridge) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("open")) return;

    let cancelled = false;
    const createdObjectUrls: string[] = [];

    const makeThumbUrls = (tab: OpdfTab) => {
      if (!tab.thumbnails || tab.thumbnails.length === 0) return tab.thumbnails;
      return tab.thumbnails.map((thumb) => {
        const url = URL.createObjectURL(thumb.blob);
        createdObjectUrls.push(url);
        return {
          ...thumb,
          url,
        };
      });
    };

    async function initTabs() {
      try {
        const [loadedTabs, loadedActiveId] = await Promise.all([
          loadTabsList(),
          loadActiveTabId(),
        ]);
        if (cancelled) return;

        const groupFilter = urlParams.get("group") || null;

        if (loadedTabs && loadedTabs.length > 0) {
          const tabsWithUrls = loadedTabs.map((tab) => ({
            ...tab,
            thumbnails: makeThumbUrls(tab),
          }));
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
            setShowDashboard(false);
            setFileName(targetTab.fileName);
            setDocBytes(targetTab.docBytes);
            setSourceBlob(targetTab.sourceBlob ?? null);
            setSourceIdentity(targetTab.sourceIdentity ?? "");
            setPage(targetTab.page || 1);
            setAnnotations(targetTab.annotations || []);
            setBookmarks(targetTab.bookmarks || []);
            setThumbnails(targetTab.thumbnails || []);
            setPageRotations(targetTab.pageRotations || {});

            if (bridge.replaceAnnotations) {
              await bridge.replaceAnnotations(
                targetTab.sourceIdentity?.startsWith("server://") ? targetTab.sourceIdentity : targetTab.fileName,
                targetTab.annotations || [],
              );
            }

            setTimeout(() => {
              if (!cancelled && isSwitchingRef) {
                (isSwitchingRef as any).current = false;
              }
            }, 100);
          } else {
            setShowDashboard(false);
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
            setShowDashboard(false);
            setFileName(newTab.fileName);
            setDocBytes(newTab.docBytes);
            setSourceBlob(newTab.sourceBlob ?? null);
            setSourceIdentity(newTab.sourceIdentity ?? "");
            setPage(newTab.page);
            setAnnotations(newTab.annotations);
            setBookmarks(newTab.bookmarks);
            setPageRotations({});

            if (bridge.replaceAnnotations) {
              await bridge.replaceAnnotations(
                newTab.sourceIdentity?.startsWith("server://") ? newTab.sourceIdentity : newTab.fileName,
                newTab.annotations || [],
              );
            }
          } else {
            setShowDashboard(false);
          }
        }
      } catch (error) {
        console.error("Failed to restore tabs:", error);
      } finally {
        if (!cancelled) {
          setHasRestoredTabs(true);
        }
      }
    }
    void initTabs();

    return () => {
      cancelled = true;
      createdObjectUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore cleanup failures during teardown.
        }
      });
    };
  }, [bridge, hasDesktopBridge]);

  // 2. Tabs Auto-Save effect
  useEffect(() => {
    if (hasDesktopBridge || !hasRestoredTabs || tabs.length === 0) return;
    const timeout = setTimeout(() => {
      void (async () => {
        const savedTabs = await saveTabsList(tabs);
        if (savedTabs) {
          void saveActiveTabId(activeTabId);
        }

        if (isOpdfServerRuntime() && bridge.writeSession) {
          const serverTabs = tabs
            .map((tab) => tab.sourceIdentity)
            .filter((value): value is string => Boolean(value?.startsWith("server://")));
          const activeTab = tabs.find((tab) => tab.id === activeTabId);
          const activeFilePath = activeTab?.sourceIdentity?.startsWith("server://")
            ? activeTab.sourceIdentity
            : null;
          const activeIndex = activeFilePath
            ? Math.max(0, serverTabs.indexOf(activeFilePath))
            : 0;
          await bridge.writeSession({
            activeFilePath,
            openTabs: serverTabs,
            activeTabIndex: activeIndex,
            updatedAt: Date.now(),
          });
        }
      })();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [bridge, hasDesktopBridge, hasRestoredTabs, tabs, activeTabId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("opdf-theme", theme);
  }, [theme]);

  useGlobalKeyboardShortcuts({
    openFile,
    savePdf,
    savePdfAs,
    undoAnnotations,
    redoAnnotations,
    zoomIn,
    zoomOut,
    goPrevPage,
    goNextPage,
    setActiveTool,
    setOpenMenu,
    setTheme,
  });
}
