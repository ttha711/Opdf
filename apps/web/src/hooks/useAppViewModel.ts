type UseAppViewModelArgs = {
  state: any;
  actions: any;
  menuItems: any;
  callbacks: any;
};

export function useAppViewModel({ state, actions, menuItems, callbacks }: UseAppViewModelArgs) {
  const headerProps = {
    fileInputRef: state.fileInputRef,
    hasDesktopBridge: state.hasDesktopBridge,
    hasDocument: state.hasDocument,
    fileName: state.fileName,
    openFile: actions.openFile,
    closeDocument: actions.closeDocument,
    fileMenuItems: menuItems.fileMenuItems,
    editMenuItems: menuItems.editMenuItems,
    viewMenuItems: menuItems.viewMenuItems,
    toolsMenuItems: menuItems.toolsMenuItems,
    openMenu: state.openMenu,
    toggleMenu: callbacks.toggleMenu,
    closeMenu: callbacks.closeMenu,
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
    annotationToolDefaults: state.annotationToolDefaults,
    setAnnotationToolDefaults: state.setAnnotationToolDefaults,
    savePdf: actions.savePdf,
    savePdfAs: actions.savePdfAs,
    exportPdf: actions.exportPdf,
    saveState: state.saveState,
    page: state.page,
    totalPages: state.totalPages,
    setPage: state.setPage,
    goPrevPage: actions.goPrevPage,
    goNextPage: actions.goNextPage,
    zoomOut: actions.zoomOut,
    zoomIn: actions.zoomIn,
    resetZoom: actions.resetZoom,
    scale: state.scale,
    zoomPreset: state.zoomPreset,
    applyZoomPreset: actions.applyZoomPreset,
    viewMode: state.viewMode,
    setViewMode: state.setViewMode,
    undoAnnotations: actions.undoAnnotations,
    redoAnnotations: actions.redoAnnotations,
    runOcr: actions.runOcr,
    rotateLeft: actions.rotateLeft,
    rotateRight: actions.rotateRight,
    compressDocument: actions.compressDocument,
    addWatermark: actions.addWatermark,
    splitDocument: actions.splitDocument,
    mergeDocuments: actions.mergeDocuments,
    convertToImages: actions.convertToImages,
    documentTool: state.documentTool,
    setDocumentTool: state.setDocumentTool,
    runDocumentTool: actions.runDocumentTool,
    openDocumentMarkupTool: actions.openDocumentMarkupTool,
    onSelectLocalFile: actions.onSelectLocalFile,
    theme: state.theme,
    toggleTheme: callbacks.toggleTheme,
    showDashboard: state.showDashboard,
    setShowDashboard: state.setShowDashboard,
  };

  const viewerProps = {
    data: state.docBytes,
    sourceBlob: state.sourceBlob,
    sourceIdentity: state.sourceIdentity,
    page: state.page,
    scale: state.scale,
    activeTool: state.activeTool,
    onActiveToolChange: state.setActiveTool,
    onDocumentLoaded: callbacks.onLoaded,
    onError: state.setViewerError,
    onActivePageChange: actions.onActivePageChange,
    onViewerDirty: callbacks.onViewerDirty,
    onViewerScaleChange: state.setScale,
    onPatchApplied: callbacks.onPatchApplied,
  };

  return { headerProps, viewerProps };
}
