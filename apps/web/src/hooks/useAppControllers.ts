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
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setPage: state.setPage,
    setTotalPages: state.setTotalPages,
    setViewerError: state.setViewerError,
    setThumbnails: state.setThumbnails,
    setAnnotations: state.setAnnotations,
    setTransitionTick: state.setTransitionTick,
  });

  const { addHighlight, createToolAnnotation, undoAnnotations, redoAnnotations, removeAnnotation, updateAnnotation } = useAnnotationActions({
    bridge,
    fileName: state.fileName,
    noteText: state.noteText,
    signatureStyle: state.signatureStyle,
    annotationToolDefaults: state.annotationToolDefaults,
    setAnnotations: state.setAnnotations,
    setViewerError: state.setViewerError,
  });

  const { runOcr, exportPdf, compressDocument, addWatermark, mergeDocuments, splitDocument, convertToImages, runDocumentTool, runConfiguredDocumentTool, runConfiguredMarkupTool, runConfiguredWatermark } = useDocumentActions({
    bridge,
    hasDocument: state.hasDocument,
    hasDesktopBridge: state.hasDesktopBridge,
    fileName: state.fileName,
    docBytes: state.docBytes,
    page: state.page,
    totalPages: state.totalPages,
    thumbnails: state.thumbnails,
    annotations: state.annotations,
    documentTool: state.documentTool,
    replaceDocumentBytes,
    setDocBytes: state.setDocBytes,
    setPage: state.setPage,
    setOcrJobs: state.setOcrJobs,
    setViewerError: state.setViewerError,
    setShowSplitModal: state.setShowSplitModal,
    setShowMergeModal: state.setShowMergeModal,
    setShowInsertModal: state.setShowInsertModal,
  });

  const onLoaded = useCallback((pages: number) => {
    state.setTotalPages(pages);
    state.setPage((p) => Math.min(Math.max(1, p), Math.max(1, pages)));
  }, [state.setScale, state.setZoomPreset]);

  const onSearchResult = useCallback((found: boolean, message: string) => {
    state.setSearchResult(found ? `Found: ${message}` : `Not found: ${message}`);
  }, [state]);

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

  // Handle Ctrl + mouse wheel zoom natively to prevent default browser page zooming
  useEffect(() => {
    const viewerElement = viewerAreaRef.current;
    if (!viewerElement) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        state.setZoomPreset("actual");
        const nextFactor = Math.exp(-e.deltaY * 0.0015);
        state.setScale((current) => Math.min(3, Math.max(0.5, Number((current * nextFactor).toFixed(3)))));
      }
    };

    viewerElement.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      viewerElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, [state]);

  const closeMenu = useCallback(() => state.setOpenMenu(null), [state]);
  const toggleMenu = useCallback((name: string) => state.setOpenMenu(prev => prev === name ? null : name), [state]);

  const { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems } = useAppMenus({
    hasDocument: state.hasDocument,
    viewMode: state.viewMode,
    setViewMode: state.setViewMode,
    setActiveTool: state.setActiveTool,
    openFile,
    closeDocument,
    exportPdf,
    compressDocument,
    addWatermark,
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
    setAnnotations: state.setAnnotations,
    setPage: state.setPage,
    setThumbnails: state.setThumbnails,
    setBookmarks: state.setBookmarks,
    setShowFindBar: state.setShowFindBar,
    setOpenMenu: state.setOpenMenu,
    setActiveTool: state.setActiveTool,
    setTheme: state.setTheme,
    findInputRef: state.findInputRef,
    openFile,
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
      addWatermark,
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
      alert("This feature is only available on Local or Desktop App versions.");
      return;
    }
    const payload = {
      fileName: state.fileName,
      docBytes: state.docBytes ? Array.from(state.docBytes) : undefined,
    };
    window.__opdfAiEditorBootstrap = payload;
    window.__opdfAiEditorGetBootstrap = () => payload;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("ai-editor", "1");
    const popup = window.open(nextUrl.toString(), "opdf-ai-editor", "width=1440,height=920");
    if (popup) popup.focus();
  }, [state.fileName, state.docBytes, isPublic]);

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
    runConfiguredMarkupTool,
    removeAnnotation,
    createToolAnnotation,
    openAiEditorWindow,
  };
}
