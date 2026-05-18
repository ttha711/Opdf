import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, OcrJob } from "@opdf/core";
import type { ActiveTool, PendingNote, ViewMode, ZoomPreset } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { OpdfTab } from "../lib/web-storage";

export function useAppState() {
  const [fileName, setFileName] = useState("");
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [ocrJobs, setOcrJobs] = useState<OcrJob[]>([]);
  const [pageSearch, setPageSearch] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [zoomPreset, setZoomPreset] = useState<ZoomPreset>("actual");
  const [pendingNote, setPendingNote] = useState<PendingNote>(null);
  const [noteText, setNoteText] = useState("New note");
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureStyle, setSignatureStyle] = useState("User Signature");
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("continuous");
  const [documentTool, setDocumentTool] = useState<DocumentTool>("delete-pages");
  const [transitionTick, setTransitionTick] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<"next" | "prev">("next");
  const [thumbnails, setThumbnails] = useState<Array<{ page: number; url: string; blob: Blob }>>([]);
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; page: number; title: string; createdAt: number }>>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showFindBar, setShowFindBar] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [activeDashboardTool, setActiveDashboardTool] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("opdf-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  // MULTI-TABS STATE
  const [tabs, setTabs] = useState<OpdfTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  // URL Group filter for separate windows (?group=Work)
  const [activeGroupFilter] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("group") || null;
    }
    return null;
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const lastWheelFlipAtRef = useRef(0);
  
  const isSwitchingRef = useRef(false);
  const tabsRef = useRef(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const hasDocument = useMemo(() => Boolean(fileName && docBytes), [fileName, docBytes]);
  const highlightMode = activeTool === "highlight";
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);

  // Tab operations
  const switchTab = useCallback((tabId: string) => {
    const targetTab = tabsRef.current.find(t => t.id === tabId);
    if (!targetTab) return;

    isSwitchingRef.current = true;
    setActiveTabId(tabId);
    setFileName(targetTab.fileName);
    setDocBytes(targetTab.docBytes);
    setPage(targetTab.page || 1);
    setTotalPages(targetTab.totalPages || 0);
    setAnnotations(targetTab.annotations || []);
    setBookmarks(targetTab.bookmarks || []);
    setThumbnails(targetTab.thumbnails || []);
    
    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 100);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const remainingTabs = prevTabs.filter(t => t.id !== tabId);
      
      if (activeTabId === tabId) {
        if (remainingTabs.length > 0) {
          setTimeout(() => {
            switchTab(remainingTabs[0].id);
          }, 0);
        } else {
          isSwitchingRef.current = true;
          setActiveTabId(null);
          setFileName("");
          setDocBytes(null);
          setPage(1);
          setTotalPages(0);
          setAnnotations([]);
          setBookmarks([]);
          setThumbnails([]);
          setShowDashboard(true);
          setTimeout(() => {
            isSwitchingRef.current = false;
          }, 100);
        }
      }
      
      return remainingTabs;
    });
  }, [activeTabId, switchTab]);

  const addTabToGroup = useCallback((tabId: string, groupName: string, groupColor?: string) => {
    const colors = ["#ff5a5f", "#e03e2d", "#10b981", "#0061d5", "#8b5cf6", "#f59e0b"];
    const chosenColor = groupColor || colors[Math.floor(Math.random() * colors.length)];
    
    setTabs(prevTabs => {
      const existingGroupTab = prevTabs.find(t => t.group === groupName);
      const colorToUse = existingGroupTab?.groupColor || chosenColor;
      
      return prevTabs.map(t => {
        if (t.id === tabId) {
          return {
            ...t,
            group: groupName,
            groupColor: colorToUse
          };
        }
        return t;
      });
    });
  }, []);

  const removeTabFromGroup = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      return prevTabs.map(t => {
        if (t.id === tabId) {
          return {
            ...t,
            group: null,
            groupColor: null
          };
        }
        return t;
      });
    });
  }, []);

  const renameTabGroup = useCallback((oldName: string, newName: string) => {
    setTabs(prevTabs => {
      return prevTabs.map(t => {
        if (t.group === oldName) {
          return {
            ...t,
            group: newName
          };
        }
        return t;
      });
    });
  }, []);

  const changeTabGroupColor = useCallback((groupName: string, color: string) => {
    setTabs(prevTabs => {
      return prevTabs.map(t => {
        if (t.group === groupName) {
          return {
            ...t,
            groupColor: color
          };
        }
        return t;
      });
    });
  }, []);

  const closeTabGroup = useCallback((groupName: string) => {
    setTabs(prevTabs => {
      const remainingTabs = prevTabs.filter(t => t.group !== groupName);
      const tabsToClose = prevTabs.filter(t => t.group === groupName);
      const isActiveInClosedGroup = tabsToClose.some(t => t.id === activeTabId);
      
      if (isActiveInClosedGroup) {
        if (remainingTabs.length > 0) {
          setTimeout(() => {
            switchTab(remainingTabs[0].id);
          }, 0);
        } else {
          isSwitchingRef.current = true;
          setActiveTabId(null);
          setFileName("");
          setDocBytes(null);
          setPage(1);
          setTotalPages(0);
          setAnnotations([]);
          setBookmarks([]);
          setThumbnails([]);
          setShowDashboard(true);
          setTimeout(() => {
            isSwitchingRef.current = false;
          }, 100);
        }
      }
      
      return remainingTabs;
    });
  }, [activeTabId, switchTab]);

  const ungroupGroup = useCallback((groupName: string) => {
    setTabs(prevTabs => {
      return prevTabs.map(t => {
        if (t.group === groupName) {
          return {
            ...t,
            group: null,
            groupColor: null
          };
        }
        return t;
      });
    });
  }, []);


  // Automatic sync of active document properties into its tab
  useEffect(() => {
    if (isSwitchingRef.current) return;
    if (!fileName || !docBytes) return;

    const currentTabs = tabsRef.current;
    const activeTab = currentTabs.find(t => t.id === activeTabId);

    if (activeTab && activeTab.fileName === fileName) {
      setTabs(prevTabs => {
        return prevTabs.map(t => {
          if (t.id === activeTabId) {
            if (
              t.docBytes !== docBytes ||
              t.page !== page ||
              t.totalPages !== totalPages ||
              t.annotations !== annotations ||
              t.bookmarks !== bookmarks ||
              t.thumbnails !== thumbnails
            ) {
              return {
                ...t,
                docBytes,
                page,
                totalPages,
                annotations,
                bookmarks,
                thumbnails
              };
            }
          }
          return t;
        });
      });
    } else {
      // Look if there's already a tab loaded with this filename to switch to it
      const alreadyOpenTab = currentTabs.find(t => t.fileName === fileName);
      if (alreadyOpenTab) {
        isSwitchingRef.current = true;
        setActiveTabId(alreadyOpenTab.id);
        setFileName(alreadyOpenTab.fileName);
        setDocBytes(alreadyOpenTab.docBytes);
        setPage(alreadyOpenTab.page || 1);
        setTotalPages(alreadyOpenTab.totalPages || 0);
        setAnnotations(alreadyOpenTab.annotations || []);
        setBookmarks(alreadyOpenTab.bookmarks || []);
        setThumbnails(alreadyOpenTab.thumbnails || []);
        setTimeout(() => { isSwitchingRef.current = false; }, 50);
      } else {
        // Create a new tab
        const newTabId = "tab_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        const colors = ["#ff5a5f", "#e03e2d", "#10b981", "#0061d5", "#8b5cf6", "#f59e0b"];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        const newTab: OpdfTab = {
          id: newTabId,
          fileName,
          docBytes,
          page,
          totalPages,
          annotations,
          bookmarks,
          group: activeGroupFilter,
          groupColor: activeGroupFilter ? randomColor : null,
          thumbnails: []
        };
        
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTabId);
      }
    }
  }, [fileName, docBytes, page, totalPages, annotations, bookmarks, thumbnails, activeTabId, activeGroupFilter]);

  return {
    fileName, setFileName, docBytes, setDocBytes, page, setPage, totalPages, setTotalPages, scale, setScale, rotation, setRotation,
    annotations, setAnnotations, ocrJobs, setOcrJobs, pageSearch, setPageSearch, searchResult, setSearchResult, activeTool, setActiveTool,
    zoomPreset, setZoomPreset, pendingNote, setPendingNote, noteText, setNoteText, showSignModal, setShowSignModal,
    signatureStyle, setSignatureStyle, showSplitModal, setShowSplitModal, showMergeModal, setShowMergeModal, showInsertModal, setShowInsertModal, viewerError, setViewerError, viewMode, setViewMode, documentTool, setDocumentTool,
    transitionTick, setTransitionTick, transitionDirection, setTransitionDirection, thumbnails, setThumbnails, bookmarks, setBookmarks, openMenu, setOpenMenu,
    showFindBar, setShowFindBar, theme, setTheme, fileInputRef, findInputRef, lastWheelFlipAtRef, hasDocument, highlightMode, hasDesktopBridge,
    showDashboard, setShowDashboard, activeDashboardTool, setActiveDashboardTool,

    // NEW TABS STATE & ACTIONS
    tabs, setTabs, activeTabId, setActiveTabId, activeGroupFilter, isSwitchingRef,
    switchTab, closeTab, addTabToGroup, removeTabFromGroup, renameTabGroup, changeTabGroupColor, closeTabGroup, ungroupGroup
  };
}
