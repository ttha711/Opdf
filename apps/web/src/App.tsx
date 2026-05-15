import { useCallback } from "react";
import { PdfViewer } from "./components/PdfViewer";
import { AppHeader } from "./components/AppHeader";
import { ThumbnailPanel } from "./components/ThumbnailPanel";
import { RightInfoPanel } from "./components/RightInfoPanel";
import { OverlayEditors } from "./components/OverlayEditors";
import { StatusBar } from "./components/StatusBar";
import { FindBar } from "./components/FindBar";
import { useOpdfBridge } from "./hooks/useOpdfBridge";
import { useAnnotationActions } from "./hooks/useAnnotationActions";
import { useDocumentActions } from "./hooks/useDocumentActions";
import { useViewerControls } from "./hooks/useViewerControls";
import { useAppMenus } from "./hooks/useAppMenus";
import { useDocumentLifecycle } from "./hooks/useDocumentLifecycle";
import { useAppState } from "./hooks/useAppState";
import { useAppEffects } from "./hooks/useAppEffects";
import { usePdfDrop } from "./hooks/usePdfDrop";
import { useAppViewModel } from "./hooks/useAppViewModel";
import "./types/opdf";

export function App() {
  const bridge = useOpdfBridge();
  const state = useAppState();

  const { openFile, onSelectLocalFile, replaceDocumentBytes, closeDocument } = useDocumentLifecycle({
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
    setAnnotations: state.setAnnotations,
    setViewerError: state.setViewerError,
  });

  const { runOcr, exportPdf, compressDocument, addWatermark, mergeDocuments, splitDocument, convertToImages, runDocumentTool } = useDocumentActions({
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
  });

  const onLoaded = useCallback((pages: number) => {
    state.setTotalPages(pages);
    state.setPage((p) => Math.min(Math.max(1, p), Math.max(1, pages)));
  }, [state]);

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
    setPage: state.setPage,
    setZoomPreset: state.setZoomPreset,
    setScale: state.setScale,
    setRotation: state.setRotation,
    lastWheelFlipAtRef: state.lastWheelFlipAtRef,
    activeTool: state.activeTool,
    addHighlight,
    createToolAnnotation,
    setPendingNote: state.setPendingNote,
    setShowSignModal: state.setShowSignModal,
  });

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
    page: state.page,
    theme: state.theme,
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setAnnotations: state.setAnnotations,
    setPage: state.setPage,
    setThumbnails: state.setThumbnails,
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
      onSelectLocalFile,
      onPageToolAction,
      onActivePageChange,
      updateAnnotation,
      removeAnnotation,
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

  return (
    <div className="app acrobat-shell">
      <AppHeader {...headerProps} />

      <main className="workspace acrobat-body">
        <ThumbnailPanel thumbnails={state.thumbnails} page={state.page} hasDocument={state.hasDocument} onSelectPage={state.setPage} />

        <section
          className="viewer-area"
          tabIndex={0}
          onWheel={onViewerWheel}
          onDragOver={onDragOver}
          onDrop={onDrop}
          aria-label="PDF viewer area"
        >
          {state.showFindBar && (
            <FindBar
              searchText={state.pageSearch}
              searchResult={state.searchResult}
              findInputRef={state.findInputRef}
              onChangeSearch={state.setPageSearch}
              onClose={() => {
                state.setShowFindBar(false);
                state.setPageSearch("");
              }}
            />
          )}
          <PdfViewer {...viewerProps} />
        </section>
        <OverlayEditors
          pendingNote={state.pendingNote}
          activeTool={state.activeTool}
          noteText={state.noteText}
          setNoteText={state.setNoteText}
          signatureStyle={state.signatureStyle}
          setSignatureStyle={state.setSignatureStyle}
          showSignModal={state.showSignModal}
          setShowSignModal={state.setShowSignModal}
          setPendingNote={state.setPendingNote}
          createToolAnnotation={createToolAnnotation}
        />

        <RightInfoPanel
          hasDocument={state.hasDocument}
          fileName={state.fileName}
          totalPages={state.totalPages}
          page={state.page}
          scale={state.scale}
          viewerError={state.viewerError}
          searchResult={state.searchResult}
          annotations={state.annotations}
          ocrJobs={state.ocrJobs}
          onRemoveAnnotation={removeAnnotation}
        />
      </main>
      <StatusBar hasDocument={state.hasDocument} page={state.page} totalPages={state.totalPages} viewerError={state.viewerError} scale={state.scale} viewMode={state.viewMode} activeTool={state.activeTool} />
    </div>
  );
}
