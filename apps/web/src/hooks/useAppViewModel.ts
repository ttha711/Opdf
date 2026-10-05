import { executeViewerCommand } from "../lib/viewer-runtime";

type UseAppViewModelArgs = {
  state: any;
  actions: any;
  menuItems: any;
  callbacks: any;
};

export function useAppViewModel({ state, actions, menuItems, callbacks }: UseAppViewModelArgs) {
  const setActiveTool = (tool: any) => {
    if (tool === "signature") {
      void executeViewerCommand("insert:add-signature");
      return;
    }
    state.setActiveTool(tool);
  };
  const headerProps = {
    fileInputRef: state.fileInputRef,
    hasDesktopBridge: state.hasDesktopBridge,
    hasDocument: state.hasDocument,
    openFile: actions.openFile,
    fileMenuItems: menuItems.fileMenuItems,
    editMenuItems: menuItems.editMenuItems,
    viewMenuItems: menuItems.viewMenuItems,
    openMenu: state.openMenu,
    toggleMenu: callbacks.toggleMenu,
    closeMenu: callbacks.closeMenu,
    activeTool: state.activeTool,
    setActiveTool,
    savePdf: actions.savePdf,
    saveState: state.saveState,
    undoAnnotations: actions.undoAnnotations,
    redoAnnotations: actions.redoAnnotations,
    runOcr: actions.runOcr,
    compressDocument: actions.compressDocument,
    addWatermark: actions.addWatermark,
    splitDocument: actions.splitDocument,
    mergeDocuments: actions.mergeDocuments,
    convertToImages: actions.convertToImages,
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
    onActiveToolChange: setActiveTool,
    onDocumentLoaded: callbacks.onLoaded,
    onError: state.setViewerError,
    onActivePageChange: actions.onActivePageChange,
    onViewerDirty: callbacks.onViewerDirty,
    onViewerScaleChange: state.setScale,
    onPatchApplied: callbacks.onPatchApplied,
  };

  return { headerProps, viewerProps };
}
