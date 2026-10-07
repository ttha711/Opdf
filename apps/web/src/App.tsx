import { useCallback, useEffect, useMemo, useState } from "react";
import { AiRewriteEditorWindow } from "./components/AiRewriteEditorWindow";
import { AiSparkIcon } from "./components/AiSparkIcon";
import { AllToolsDashboard } from "./components/AllToolsDashboard";
import { AppHeader } from "./components/AppHeader";
import { HomeScreen } from "./components/HomeScreen";
import { LiveHtmlEditor } from "./components/LiveHtmlEditor";
import { StatusBar } from "./components/StatusBar";
import { ServerUploadBanner } from "./components/ServerUploadBanner";
import { AppDocumentDialogs } from "./components/app/AppDocumentDialogs";
import { AppUpdateBanner } from "./components/app/AppUpdateBanner";
import { AppWorkspace } from "./components/app/AppWorkspace";
import { useToast } from "./components/ToastProvider";
import type { MarkupTool } from "./hooks/useDocumentActions";
import { useAppControllers } from "./hooks/useAppControllers";
import { useDocumentScopedUiReset } from "./hooks/useDocumentScopedUiReset";
import { useDraggableFab } from "./hooks/useDraggableFab";
import { useIntegratedFileConverter } from "./hooks/useIntegratedFileConverter";
import { useResizableSidebars } from "./hooks/useResizableSidebars";
import { resolvePdfSource } from "./lib/documentSource";
import { hasFullWebAccess } from "./lib/runtimeAccess";
import "./types/opdf";

export function App() {
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);
  const isServerRuntime = typeof window !== "undefined" && window.__OPDF_RUNTIME__ === "server";
  const isPublic = !hasFullWebAccess({
    hasDesktopBridge,
    isServerRuntime,
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
  });
  const isAiEditorWindow = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("ai-editor") === "1";
  const [updateInfo, setUpdateInfo] = useState<{ version: string; description?: string } | null>(null);
  const [activeMarkupTool, setActiveMarkupTool] = useState<MarkupTool | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isLiveEditorOpen, setIsLiveEditorOpen] = useState(false);
  const [liveEditorHtml, setLiveEditorHtml] = useState<string | null>(null);
  const [showRevisionCompare, setShowRevisionCompare] = useState(false);
  const [showSearchRedact, setShowSearchRedact] = useState(false);
  const [showAdvancedPdf, setShowAdvancedPdf] = useState(false);
  const [showDigitalSignature, setShowDigitalSignature] = useState(false);
  const [showHome, setShowHome] = useState(false);
  const [bridgeRecents, setBridgeRecents] = useState<Array<{ filePath: string; openedAt: number }>>([]);
  const sidebars = useResizableSidebars();
  const fab = useDraggableFab();
  const controllers = useAppControllers({ isPublic, setActiveMarkupTool });
  const { state, bridge, headerProps, onDragOver, onDrop, replaceDocumentBytes, materializeDocumentBytes, openAiEditorWindow, openFileWithPath } = controllers;
  const toast = useToast();
  const { handleIntegratedFileSelected } = useIntegratedFileConverter({
    activeDashboardTool: state.activeDashboardTool,
    setActiveDashboardTool: state.setActiveDashboardTool,
    setDocBytes: state.setDocBytes,
    setFileName: state.setFileName,
    setPage: state.setPage,
    setViewerError: state.setViewerError,
  });
  useEffect(() => {
    if (!window.opdfUpdate) return;
    window.opdfUpdate.onUpdateReady(setUpdateInfo);
    void window.opdfUpdate.checkPendingUpdate().then((info) => {
      if (info) setUpdateInfo(info);
    });
  }, []);
  useEffect(() => {
    if (state.activeTool === "edit-content") sidebars.setIsRightCollapsed(true);
  }, [state.activeTool, sidebars.setIsRightCollapsed]);
  useEffect(() => {
    let cancelled = false;
    void bridge.getRecent()
      .then((rows) => { if (!cancelled) setBridgeRecents(rows.slice(0, 12)); })
      .catch(() => { if (!cancelled) setBridgeRecents([]); });
    return () => { cancelled = true; };
  }, [bridge, state.fileName, state.sourceIdentity]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (state.hasDocument && state.saveState === "idle") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.hasDocument, state.saveState]);
  const resetDocumentScopedUi = useCallback(() => {
    state.setActiveTool("select");
    state.setActiveDashboardTool(null);
    state.setShowDashboard(false);
    setActiveMarkupTool(null);
    setIsAiPanelOpen(false);
    setIsLiveEditorOpen(false);
    setLiveEditorHtml(null);
    setShowRevisionCompare(false);
    setShowSearchRedact(false);
    setShowAdvancedPdf(false);
    setShowDigitalSignature(false);
    sidebars.setIsRightCollapsed(true);
  }, [sidebars.setIsRightCollapsed, state.setActiveDashboardTool, state.setActiveTool, state.setShowDashboard]);
  useDocumentScopedUiReset(state.hasDocument, resetDocumentScopedUi);
  const homeRecentDocuments = useMemo(() => [
    ...state.tabs.map((tab) => ({
      id: `tab:${tab.id}`,
      fileName: tab.fileName.split(/[\\/]/).pop() || tab.fileName,
    })),
    ...bridgeRecents
      .filter((recent) => !state.tabs.some((tab) =>
        tab.sourceIdentity === recent.filePath || tab.fileName === recent.filePath))
      .map((recent) => {
        const leaf = recent.filePath.split(/[\\/]/).pop() || recent.filePath;
        try {
          return { id: `path:${recent.filePath}`, fileName: decodeURIComponent(leaf) };
        } catch {
          return { id: `path:${recent.filePath}`, fileName: leaf };
        }
      }),
  ].slice(0, 8), [bridgeRecents, state.tabs]);
  const activePdfSource = resolvePdfSource({
    sourceBlob: state.sourceBlob,
    docBytes: state.docBytes,
    sourceIdentity: state.sourceIdentity,
  });
  const openSidebarTool = useCallback((toolId: string) => {
    setActiveMarkupTool(null);
    state.setActiveDashboardTool(toolId);
    state.setShowDashboard(false);
    sidebars.setIsRightCollapsed(false);
  }, [sidebars.setIsRightCollapsed, state.setActiveDashboardTool, state.setShowDashboard]);
  const openMarkupSidebar = useCallback((tool: MarkupTool) => {
    state.setActiveDashboardTool(null);
    state.setShowDashboard(false);
    setActiveMarkupTool(tool);
    sidebars.setIsRightCollapsed(false);
  }, [sidebars.setIsRightCollapsed, state.setActiveDashboardTool, state.setShowDashboard]);
  if (isAiEditorWindow) {
    if (isPublic) {
      return <div className="flex h-screen items-center justify-center text-gray-500">This feature is only available on Local or Desktop App versions.</div>;
    }
    return <AiRewriteEditorWindow />;
  }
  const showWorkspace = state.hasDocument || Boolean(state.activeDashboardTool);
  return (
    <div className={`app acrobat-shell${updateInfo ? " has-update-banner" : ""}`}>
      <AppUpdateBanner updateInfo={updateInfo} />
      <ServerUploadBanner />
      <AppHeader
        {...headerProps}
        autosaveStatus={controllers.autosaveStatus}
        isPublic={isPublic}
        onGoHome={() => setShowHome(true)}
        openFile={() => {
          setShowHome(false);
          headerProps.openFile();
        }}
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        activeGroupFilter={state.activeGroupFilter}
        switchTab={(id) => {
          setShowHome(false);
          state.switchTab(id);
        }}
        closeTab={state.closeTab}
        addTabToGroup={state.addTabToGroup}
        removeTabFromGroup={state.removeTabFromGroup}
        renameTabGroup={state.renameTabGroup}
        changeTabGroupColor={state.changeTabGroupColor}
        closeTabGroup={state.closeTabGroup}
        ungroupGroup={state.ungroupGroup}
        onOpenAiEditorWindow={openAiEditorWindow}
        compareRevisions={() => setShowRevisionCompare(true)}
        searchRedact={() => setShowSearchRedact(true)}
        advancedPdf={() => setShowAdvancedPdf(true)}
        digitalSign={() => setShowDigitalSignature(true)}
        compressDocument={() => openSidebarTool("compress-pdf")}
        addWatermark={() => openSidebarTool("watermark-pdf")}
        splitDocument={() => openSidebarTool("split-pdf")}
        mergeDocuments={() => openSidebarTool("merge-pdf")}
        convertToImages={() => openSidebarTool("pdf-to-png")}
        openDocumentMarkupTool={openMarkupSidebar}
      />
      <AppDocumentDialogs
        state={state}
        bridge={bridge}
        source={activePdfSource}
        replaceDocumentBytes={replaceDocumentBytes}
        showRevisionCompare={showRevisionCompare}
        setShowRevisionCompare={setShowRevisionCompare}
        showSearchRedact={showSearchRedact}
        setShowSearchRedact={setShowSearchRedact}
        showAdvancedPdf={showAdvancedPdf}
        setShowAdvancedPdf={setShowAdvancedPdf}
        showDigitalSignature={showDigitalSignature}
        setShowDigitalSignature={setShowDigitalSignature}
        success={toast.success}
      />
      {showHome ? (
        <div className="min-h-0 overflow-hidden" onDragOver={onDragOver} onDrop={(event) => {
          setShowHome(false);
          onDrop(event);
        }}>
          <HomeScreen
            recentDocuments={homeRecentDocuments}
            onOpenFile={() => {
              setShowHome(false);
              headerProps.openFile();
            }}
            onOpenTools={() => {
              setShowHome(false);
              state.setShowDashboard(true);
            }}
            onOpenRecent={(id) => {
              setShowHome(false);
              if (id.startsWith("tab:")) return state.switchTab(id.slice(4));
              if (id.startsWith("path:")) void openFileWithPath(id.slice(5));
            }}
          />
        </div>
      ) : state.showDashboard && !isPublic ? (
        <AllToolsDashboard
          hasDocument={state.hasDocument}
          fileName={state.fileName}
          docBytes={state.docBytes}
          getDocumentBytes={materializeDocumentBytes}
          onLoadConvertedPdf={(bytes, name) => {
            state.setFileName(name);
            replaceDocumentBytes(bytes, 1, { preserveSourceIdentity: false, resetDocumentMetadata: true });
          }}
          onClose={() => state.setShowDashboard(false)}
          onTriggerCompress={() => openSidebarTool("compress-pdf")}
          onTriggerMerge={() => openSidebarTool("merge-pdf")}
          onTriggerSplit={() => openSidebarTool("split-pdf")}
          onTriggerFillForm={() => setShowAdvancedPdf(true)}
          onTriggerOcr={() => void headerProps.runOcr()}
          onTriggerWatermark={() => openSidebarTool("watermark-pdf")}
          onTriggerPageNumbers={() => openMarkupSidebar("page-numbers")}
          onTriggerCompare={() => setShowRevisionCompare(true)}
          onTriggerRedact={() => setShowSearchRedact(true)}
          onTriggerSign={() => setShowDigitalSignature(true)}
          onSelectTool={(toolId) => { state.setActiveDashboardTool(toolId); state.setShowDashboard(false); }}
        />
      ) : !showWorkspace ? (
        <div className="min-h-0 overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}>
          <HomeScreen
            recentDocuments={homeRecentDocuments}
            onOpenFile={headerProps.openFile}
            onOpenTools={() => state.setShowDashboard(true)}
            onOpenRecent={(id) => {
              if (id.startsWith("tab:")) return state.switchTab(id.slice(4));
              if (id.startsWith("path:")) void openFileWithPath(id.slice(5));
            }}
          />
        </div>
      ) : (
        <AppWorkspace
          controllers={controllers}
          sidebars={sidebars}
          activeMarkupTool={activeMarkupTool}
          setActiveMarkupTool={setActiveMarkupTool}
          handleIntegratedFileSelected={handleIntegratedFileSelected}
          isAiPanelOpen={isAiPanelOpen}
          setIsAiPanelOpen={setIsAiPanelOpen}
          setIsLiveEditorOpen={setIsLiveEditorOpen}
          setLiveEditorHtml={setLiveEditorHtml}
          openSidebarTool={openSidebarTool}
          openMarkupSidebar={openMarkupSidebar}
          success={toast.success}
        />
      )}
      <StatusBar hasDocument={state.hasDocument && !showHome} page={state.page} totalPages={state.totalPages} viewerError={state.viewerError} scale={state.scale} viewMode={state.viewMode} activeTool={state.activeTool} saveState={state.saveState} autosaveStatus={controllers.autosaveStatus} />
      {!isAiPanelOpen ? (
        <button
          ref={fab.buttonRef}
          data-opdf-action="open-ai"
          className={`ai-float-toggle-btn pulse-aura ${fab.isDragging ? "dragging" : ""}`}
          style={fab.position ? { left: fab.position.x, top: fab.position.y, right: "auto", bottom: "auto" } : undefined}
          onMouseDown={fab.handleMouseDown}
          onTouchStart={fab.handleTouchStart}
          onClick={() => {
            if (fab.hasMovedRef.current) return;
            setIsAiPanelOpen(true);
            sidebars.setIsRightCollapsed(false);
            if (sidebars.rightWidth < 340) sidebars.setRightWidth(340);
          }}
          title="Open AI Assistant"
          type="button"
        >
          <AiSparkIcon size={24} />
        </button>
      ) : null}
      <LiveHtmlEditor isOpen={isLiveEditorOpen} onClose={() => setIsLiveEditorOpen(false)} initialHtml={liveEditorHtml} />
    </div>
  );
}
