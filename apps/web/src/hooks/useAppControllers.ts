import { useCallback, useEffect, useRef } from "react";
import { useOpdfBridge } from "./useOpdfBridge";
import { useAppState } from "./useAppState";
import { useDocumentLifecycle } from "./useDocumentLifecycle";
import { useAnnotationActions } from "./useAnnotationActions";
import { useDocumentActions } from "./useDocumentActions";
import { useViewerControls } from "./useViewerControls";
import { useAppMenus } from "./useAppMenus";
import { useAppEffects } from "./useAppEffects";
import { usePdfDrop } from "./usePdfDrop";
import { useAppViewModel } from "./useAppViewModel";
import { useAgentBridge, createAgentStateSnapshot } from "./useAgentBridge";
import type { MarkupTool } from "./useDocumentActions";
import { toast } from "../components/ToastProvider";

type UseAppControllersArgs = {
  isPublic: boolean;
  setActiveMarkupTool: (tool: MarkupTool | null) => void;
};

export function useAppControllers({ isPublic, setActiveMarkupTool }: UseAppControllersArgs) {
  const bridge = useOpdfBridge();
  const state = useAppState();
  const viewerAreaRef = useRef<HTMLDivElement>(null);

  // Auto-open dashboard effects
  useEffect(() => {
    if (isPublic) return;
    const timeout = setTimeout(() => {
      if (!state.hasDocument) {
        state.setShowDashboard(true);
      }
    }, 150);
    return () => clearTimeout(timeout);
  }, [state.hasDocument, state.setShowDashboard, isPublic]);

  useEffect(() => {
    if (state.hasDocument) {
      state.setShowDashboard(false);
    }
  }, [state.hasDocument, state.setShowDashboard]);

  const { openFile, openFileWithPath, onSelectLocalFile, replaceDocumentBytes, closeDocument } = useDocumentLifecycle({
    bridge,
    hasDesktopBridge: state.hasDesktopBridge,
    fileInputRef: state.fileInputRef,
    page: state.page,
    saveState: state.saveState,
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setSourceBlob: state.setSourceBlob,
    sourceIdentity: state.sourceIdentity,
    setSourceIdentity: state.setSourceIdentity,
    setPage: state.setPage,
    setTotalPages: state.setTotalPages,
    setViewerError: state.setViewerError,
    setThumbnails: state.setThumbnails,
    setAnnotations: state.setAnnotations,
    setBookmarks: state.setBookmarks,
    setPageRotations: state.setPageRotations,
    setTransitionTick: state.setTransitionTick,
    setSaveState: state.setSaveState,
    markDocumentSaved: state.markDocumentSaved,
    clearDocumentSaveTracking: state.clearDocumentSaveTracking,
  });

  const { addHighlight, createToolAnnotation, undoAnnotations, redoAnnotations, removeAnnotation, updateAnnotation } = useAnnotationActions({
    bridge,
    fileName: state.fileName,
    sourceIdentity: state.sourceIdentity,
    noteText: state.noteText,
    signatureStyle: state.signatureStyle,
    annotationToolDefaults: state.annotationToolDefaults,
    setAnnotations: state.setAnnotations,
    setViewerError: state.setViewerError,
    setSaveState: state.setSaveState,
  });

  const { runOcr, savePdf, savePdfAs, exportPdf, compressDocument, mergeDocuments, splitDocument, convertToImages, runDocumentTool, runConfiguredDocumentTool, runConfiguredMarkupTool, runConfiguredWatermark } = useDocumentActions({
    bridge,
    hasDocument: state.hasDocument,
    hasDesktopBridge: state.hasDesktopBridge,
    fileName: state.fileName,
    docBytes: state.docBytes,
    sourceBlob: state.sourceBlob,
    sourceIdentity: state.sourceIdentity,
    getDocumentBytes: state.materializeDocumentBytes,
    page: state.page,
    totalPages: state.totalPages,
    thumbnails: state.thumbnails,
    annotations: state.annotations,
    setFileName: state.setFileName,
    setAnnotations: state.setAnnotations,
    documentTool: state.documentTool,
    replaceDocumentBytes,
    setDocBytes: state.setDocBytes,
    setPage: state.setPage,
    setOcrJobs: state.setOcrJobs,
    setViewerError: state.setViewerError,
    setSaveState: state.setSaveState,
    markDocumentSaved: state.markDocumentSaved,
    setShowSplitModal: state.setShowSplitModal,
    setShowMergeModal: state.setShowMergeModal,
    setShowInsertModal: state.setShowInsertModal,
  });

  const onLoaded = useCallback((pages: number) => {
    state.setTotalPages(pages);
    state.setPage((p) => Math.min(Math.max(1, p), Math.max(1, pages)));
  }, [state.hasDocument, state.setScale, state.setZoomPreset]);

  const onSearchResult = useCallback((found: boolean, message: string) => {
    state.setSearchResult(found ? `Found: ${message}` : `Not found: ${message}`);
  }, [state]);

  const openWatermarkPanel = useCallback(() => {
    if (!state.hasDocument) return;
    state.setActiveDashboardTool("watermark-pdf");
  }, [state.hasDocument, state.setActiveDashboardTool]);

  const {
    goPrevPage,
    goNextPage,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    onPageToolAction,
    onViewerWheel,
    onActivePageChange,
  } = useViewerControls({
    hasDocument: state.hasDocument,
    highlightMode: state.highlightMode,
    viewMode: state.viewMode,
    totalPages: state.totalPages,
    viewerAreaRef,
    setTransitionDirection: state.setTransitionDirection,
    setTransitionTick: state.setTransitionTick,
    page: state.page,
    setPage: state.setPage,
    setZoomPreset: state.setZoomPreset,
    setScale: state.setScale,
    setRotation: state.setRotation,
    setPageRotations: state.setPageRotations,
    lastWheelFlipAtRef: state.lastWheelFlipAtRef,
    activeTool: state.activeTool,
    addHighlight,
    createToolAnnotation,
    setPendingNote: state.setPendingNote,
    setShowSignModal: state.setShowSignModal,
  });

  // CAD-style navigation: Ctrl/Cmd+wheel zooms around the pointer; hold
  // Space + drag or middle-mouse drag to pan large drawing sheets.
  useEffect(() => {
    // PDFium owns pan/zoom/scroll input for active documents. The legacy
    // wrapper handlers manipulate the outer container and would otherwise
    // double-handle Ctrl+wheel and Space/middle-button panning.
    if (state.hasDocument) return;

    const viewerElement = viewerAreaRef.current;
    if (!viewerElement) return;

    let spaceHeld = false;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let scrollStartLeft = 0;
    let scrollStartTop = 0;

    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element &&
        (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable),
      );
    };

    const refreshCursor = () => {
      viewerElement.style.cursor = panning ? "grabbing" : spaceHeld ? "grab" : "";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTypingTarget(event.target)) return;
      spaceHeld = true;
      refreshCursor();
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceHeld = false;
      if (!panning) refreshCursor();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const shouldPan = event.button === 1 || (event.button === 0 && spaceHeld);
      if (!shouldPan) return;
      event.preventDefault();
      panning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      scrollStartLeft = viewerElement.scrollLeft;
      scrollStartTop = viewerElement.scrollTop;
      refreshCursor();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!panning) return;
      viewerElement.scrollLeft = scrollStartLeft - (event.clientX - panStartX);
      viewerElement.scrollTop = scrollStartTop - (event.clientY - panStartY);
    };

    const stopPan = () => {
      if (!panning) return;
      panning = false;
      refreshCursor();
    };

    const handleNativeWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      state.setZoomPreset("actual");

      const rect = viewerElement.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const contentX = viewerElement.scrollLeft + localX;
      const contentY = viewerElement.scrollTop + localY;
      const factor = Math.exp(-event.deltaY * 0.0015);

      state.setScale((current) => {
        const nextScale = Math.min(5, Math.max(0.05, Number((current * factor).toFixed(4))));
        const ratio = nextScale / Math.max(current, 0.0001);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            viewerElement.scrollLeft = contentX * ratio - localX;
            viewerElement.scrollTop = contentY * ratio - localY;
          });
        });
        return nextScale;
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    viewerElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPan);
    viewerElement.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      viewerElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPan);
      viewerElement.removeEventListener("wheel", handleNativeWheel);
      viewerElement.style.cursor = "";
    };
  }, [state.setScale, state.setZoomPreset]);

  const closeMenu = useCallback(() => state.setOpenMenu(null), [state]);
  const toggleMenu = useCallback((name: string) => state.setOpenMenu(prev => prev === name ? null : name), [state]);

  const { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems } = useAppMenus({
    hasDocument: state.hasDocument,
    viewMode: state.viewMode,
    setViewMode: state.setViewMode,
    setActiveTool: state.setActiveTool,
    openFile,
    closeDocument,
    savePdf,
    savePdfAs,
    exportPdf,
    compressDocument,
    addWatermark: openWatermarkPanel,
    mergeDocuments,
    splitDocument,
    convertToImages,
    undoAnnotations,
    redoAnnotations,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    runOcr,
    setDocumentTool: state.setDocumentTool,
    runDocumentTool,
    capabilities: bridge.capabilities,
  });

  useAppEffects({
    bridge,
    hasDesktopBridge: state.hasDesktopBridge,
    docBytes: state.docBytes,
    hasDocument: state.hasDocument,
    fileName: state.fileName,
    annotations: state.annotations,
    thumbnails: state.thumbnails,
    bookmarks: state.bookmarks,
    page: state.page,
    theme: state.theme,
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setSourceBlob: state.setSourceBlob,
    setSourceIdentity: state.setSourceIdentity,
    setAnnotations: state.setAnnotations,
    setPage: state.setPage,
    setThumbnails: state.setThumbnails,
    setBookmarks: state.setBookmarks,
    setPageRotations: state.setPageRotations,
    setShowFindBar: state.setShowFindBar,
    setOpenMenu: state.setOpenMenu,
    setActiveTool: state.setActiveTool,
    setTheme: state.setTheme,
    findInputRef: state.findInputRef,
    openFile,
    savePdf,
    savePdfAs,
    exportPdf,
    undoAnnotations,
    redoAnnotations,
    zoomIn,
    zoomOut,
    goPrevPage,
    goNextPage,

    // NEW TABS PROPS
    tabs: state.tabs,
    setTabs: state.setTabs,
    activeTabId: state.activeTabId,
    setActiveTabId: state.setActiveTabId,
    isSwitchingRef: state.isSwitchingRef,
    setShowDashboard: state.setShowDashboard,
  });

  const toggleTheme = useCallback(() => state.setTheme(t => (t === "light" ? "dark" : "light")), [state]);
  const { onDragOver, onDrop } = usePdfDrop({
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setSourceBlob: state.setSourceBlob,
    setSourceIdentity: state.setSourceIdentity,
    setPage: state.setPage,
    setViewerError: state.setViewerError,
    setThumbnails: state.setThumbnails,
    setAnnotations: state.setAnnotations,
  });

  const { headerProps, viewerProps } = useAppViewModel({
    state,
    actions: {
      openFile,
      closeDocument,
      savePdf,
      savePdfAs,
      exportPdf,
      goPrevPage,
      goNextPage,
      zoomOut,
      zoomIn,
      resetZoom,
      applyZoomPreset,
      undoAnnotations,
      redoAnnotations,
      runOcr,
      rotateLeft,
      rotateRight,
      compressDocument,
      addWatermark: openWatermarkPanel,
      splitDocument,
      mergeDocuments,
      convertToImages,
      runDocumentTool,
      openDocumentMarkupTool: setActiveMarkupTool,
      onSelectLocalFile,
      onPageToolAction,
      onActivePageChange,
      updateAnnotation,
      removeAnnotation,
      createToolAnnotation,
    },
    menuItems: { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems },
    callbacks: {
      closeMenu,
      toggleMenu,
      onToggleFindBar: () => state.setShowFindBar(p => !p),
      toggleTheme,
      onLoaded,
      onSearchResult,
    },
  });

  useAgentBridge({
    state: createAgentStateSnapshot({
      hasDocument: state.hasDocument,
      fileName: state.fileName,
      currentPage: state.page,
      totalPages: state.totalPages,
      activeTool: state.activeTool,
      viewMode: state.viewMode,
      hasDesktopBridge: state.hasDesktopBridge,
    }),
    actions: {
      openFile,
      openFileWithPath,
      closeDocument,
      exportPdf,
      compressDocument,
      runOcr,
      convertToImages,
      goPrevPage,
      goNextPage,
      zoomIn,
      zoomOut,
      resetZoom,
      rotateLeft,
      rotateRight,
      undoAnnotations,
      redoAnnotations,
      runDocumentTool,
      runConfiguredDocumentTool,
      runConfiguredMarkupTool,
      runConfiguredWatermark,
      setPage: state.setPage,
      setViewMode: state.setViewMode,
      setActiveTool: state.setActiveTool,
      setShowDashboard: state.setShowDashboard,
      setActiveDashboardTool: state.setActiveDashboardTool,
      setViewerError: state.setViewerError,
    },
  });

  const openAiEditorWindow = useCallback(() => {
    if (isPublic) {
      toast.info("Tính năng này chỉ khả dụng trên phiên bản Local hoặc Desktop App.");
      return;
    }
    const editorUrl = localStorage.getItem("opdf-editor-url") || "http://localhost:5175";
    const popup = window.open(editorUrl, "opdf-ai-editor", "width=1440,height=920");
    if (popup) popup.focus();
  }, [isPublic]);

  return {
    state,
    bridge,
    viewerAreaRef,
    headerProps,
    viewerProps,
    onViewerWheel,
    onDragOver,
    onDrop,
    compressDocument,
    mergeDocuments,
    splitDocument,
    replaceDocumentBytes,
    materializeDocumentBytes: state.materializeDocumentBytes,
    runConfiguredMarkupTool,
    removeAnnotation,
    updateAnnotation,
    createToolAnnotation,
    openAiEditorWindow,
  };
}
