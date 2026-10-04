import { useCallback, useEffect, useRef, useState } from "react";
import { AdaptivePdfViewer } from "./components/AdaptivePdfViewer";
import { AppHeader } from "./components/AppHeader";
import { AllToolsDashboard } from "./components/AllToolsDashboard";
import { ThumbnailPanel } from "./components/ThumbnailPanel";
import { RightInfoPanel } from "./components/RightInfoPanel";
import { SplitModal } from "./components/SplitModal";
import { MergeModal } from "./components/MergeModal";
import { InsertPdfModal } from "./components/InsertPdfModal";
import { DocumentMarkupPanel } from "./components/DocumentMarkupPanel";
import { StatusBar } from "./components/StatusBar";
import { DocumentToolPanel } from "./components/DocumentToolPanel";
import { IntegratedUploadWorkspace } from "./components/IntegratedUploadWorkspace";
import type { MarkupTool } from "./hooks/useDocumentActions";
import { AiAssistantPanel } from "./components/AiAssistantPanel";
import { LiveHtmlEditor } from "./components/LiveHtmlEditor";
import { AiRewriteEditorWindow } from "./components/AiRewriteEditorWindow";
import { useResizableSidebars } from "./hooks/useResizableSidebars";
import { useDraggableFab } from "./hooks/useDraggableFab";
import { useIntegratedFileConverter } from "./hooks/useIntegratedFileConverter";
import { useAppControllers } from "./hooks/useAppControllers";
import { ViewerErrorBoundary } from "./components/ViewerErrorBoundary";
import { useToast } from "./components/ToastProvider";
import { AiSparkIcon } from "./components/AiSparkIcon";
import "./types/opdf";
import { RevisionCompareModal } from "./components/RevisionCompareModal";
import { SearchRedactModal } from "./components/SearchRedactModal";
import { AdvancedPdfModal } from "./components/AdvancedPdfModal";
import { DigitalSignatureModal } from "./components/DigitalSignatureModal";
import { resolvePdfSource } from "./lib/documentSource";
import { hasFullWebAccess } from "./lib/runtimeAccess";

export function App() {
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);
  const isServerRuntime = typeof window !== "undefined" && window.__OPDF_RUNTIME__ === "server";
  const isPublic = !hasFullWebAccess({
    hasDesktopBridge,
    isServerRuntime,
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
  });

  const isAiEditorWindow = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai-editor") === "1";
  if (isAiEditorWindow) {
    if (isPublic) {
      return (
        <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#666" }}>
          <h2>This feature is only available on Local or Desktop App versions.</h2>
        </div>
      );
    }
    return <AiRewriteEditorWindow />;
  }

  const [updateInfo, setUpdateInfo] = useState<{ version: string; description?: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.opdfUpdate) {
      window.opdfUpdate.onUpdateReady((info) => {
        console.log("Hot update ready from event:", info);
        setUpdateInfo(info);
      });

      window.opdfUpdate.checkPendingUpdate().then((info) => {
        if (info) {
          console.log("Hot update ready from cache check:", info);
          setUpdateInfo(info);
        }
      });
    }
  }, []);

  const [activeMarkupTool, setActiveMarkupTool] = useState<MarkupTool | null>(null);
  const [selectedThumbnailPages, setSelectedThumbnailPages] = useState<Set<number>>(new Set());
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isLiveEditorOpen, setIsLiveEditorOpen] = useState(false);
  const [liveEditorHtml, setLiveEditorHtml] = useState<string | null>(null);
  const [showRevisionCompare, setShowRevisionCompare] = useState(false);
  const [showSearchRedact, setShowSearchRedact] = useState(false);
  const [showAdvancedPdf, setShowAdvancedPdf] = useState(false);
  const [showDigitalSignature, setShowDigitalSignature] = useState(false);

  const {
    leftWidth,
    rightWidth,
    setRightWidth,
    isLeftCollapsed,
    setIsLeftCollapsed,
    isRightCollapsed,
    setIsRightCollapsed,
    isDraggingLeft,
    isDraggingRight,
    setIsDraggingLeft,
    setIsDraggingRight,
  } = useResizableSidebars();

  const {
    position,
    isDragging,
    buttonRef,
    panelAlign,
    hasMovedRef,
    handleMouseDown,
    handleTouchStart,
  } = useDraggableFab();

  const {
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
    materializeDocumentBytes,
    runConfiguredMarkupTool,
    removeAnnotation,
    updateAnnotation,
    openAiEditorWindow,
  } = useAppControllers({ isPublic, setActiveMarkupTool });

  const { handleIntegratedFileSelected } = useIntegratedFileConverter({
    activeDashboardTool: state.activeDashboardTool,
    setActiveDashboardTool: state.setActiveDashboardTool,
    setDocBytes: state.setDocBytes,
    setFileName: state.setFileName,
    setPage: state.setPage,
    setViewerError: state.setViewerError,
  });

  const toast = useToast();
  const activePdfSource = resolvePdfSource({
    sourceBlob: state.sourceBlob,
    docBytes: state.docBytes,
    sourceIdentity: state.sourceIdentity,
  });

  // Warn before leaving the page when there are unsaved changes.
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

  // Clear thumbnail selection when document is closed or replaced
  useEffect(() => {
    if (!state.hasDocument) setSelectedThumbnailPages(new Set());
  }, [state.hasDocument]);

  const handleRotatePages = useCallback(async (pages: number[], degrees: number) => {
    if (state.sourceIdentity.startsWith("server://") && bridge.mutateStoredDocument) {
      const result = await bridge.mutateStoredDocument(state.sourceIdentity, { type: "rotate-pages", pageNumbers: pages, degrees });
      window.dispatchEvent(new CustomEvent("opdf:server-document-mutated", { detail: { sourceIdentity: state.sourceIdentity, updatedAt: result.updatedAt } }));
      return;
    }
    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;
    const next = await bridge.rotatePages(bytes, pages, degrees);
    replaceDocumentBytes(next, state.page);
  }, [state.docBytes, state.page, state.sourceIdentity, bridge, materializeDocumentBytes, replaceDocumentBytes]);

  const handleDeletePages = useCallback(async (pages: number[]) => {
    if (state.sourceIdentity.startsWith("server://") && bridge.mutateStoredDocument) {
      const result = await bridge.mutateStoredDocument(state.sourceIdentity, { type: "delete-pages", pageNumbers: pages, totalPages: state.totalPages });
      window.dispatchEvent(new CustomEvent("opdf:server-document-mutated", { detail: { sourceIdentity: state.sourceIdentity, updatedAt: result.updatedAt } }));
      state.setPage((current) => Math.min(current, Math.max(1, state.totalPages - pages.length)));
      state.setTotalPages((current) => Math.max(1, current - pages.length));
      return;
    }
    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;
    const next = await bridge.deletePages(bytes, pages);
    replaceDocumentBytes(next, Math.min(state.page, state.totalPages - pages.length));
  }, [state.docBytes, state.page, state.totalPages, state.sourceIdentity, state.setPage, state.setTotalPages, bridge, materializeDocumentBytes, replaceDocumentBytes]);

  // Keep OPDF's page-management rail available for active PDFs. Thumbnails
  // are now rendered lazily by the PDFium viewer, so this no longer revives
  // the legacy PDF.js raster path.
  const showLeft = !state.activeDashboardTool;
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const leftColWidth = showLeft && !isLeftCollapsed ? `${leftWidth}px` : "0px";
  const leftResizerWidth = showLeft && !isLeftCollapsed ? "6px" : "0px";
  const rightResizerWidth = !isRightCollapsed ? "6px" : "0px";
  const rightColWidth = !isRightCollapsed ? `${rightWidth}px` : "0px";

  const openSidebarTool = (toolId: string) => {
    setActiveMarkupTool(null);
    state.setActiveDashboardTool(toolId);
    setIsRightCollapsed(false);
  };

  const openMarkupSidebar = (tool: MarkupTool) => {
    state.setActiveDashboardTool(null);
    setActiveMarkupTool(tool);
    setIsRightCollapsed(false);
  };

  return (
    <div className={`app acrobat-shell${updateInfo ? " has-update-banner" : ""}`}>
      {updateInfo && (
        <div style={{
          backgroundColor: "#10b981",
          color: "white",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "13px",
          fontWeight: "500",
          zIndex: "var(--z-panel)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>🎉</span>
            <span>Version <strong>v{updateInfo.version}</strong> is ready. ({updateInfo.description || "Bug fixes and performance improvements"})</span>
          </div>
          <button
            onClick={() => {
              if (window.opdfUpdate) {
                void window.opdfUpdate.restartApp();
              }
            }}
            style={{
              backgroundColor: "white",
              color: "#10b981",
              border: "none",
              padding: "4px 12px",
              borderRadius: "4px",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => { e.currentTarget.style.opacity = "0.9"; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            Restart to Update
          </button>
        </div>
      )}
      <AppHeader
        {...headerProps}
        isPublic={isPublic}
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        activeGroupFilter={state.activeGroupFilter}
        switchTab={state.switchTab}
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

      <RevisionCompareModal
        isOpen={showRevisionCompare}
        onClose={() => setShowRevisionCompare(false)}
        baseSource={activePdfSource}
        baseFileName={state.fileName}
        initialPage={state.page}
      />

      <SearchRedactModal
        isOpen={showSearchRedact}
        onClose={() => setShowSearchRedact(false)}
        source={activePdfSource}
        fileName={state.fileName}
        onApplied={(bytes) => {
          replaceDocumentBytes(bytes, state.page);
          toast.success("Secure redaction applied. Affected pages were rasterized to remove the underlying text layer.");
        }}
      />

      <AdvancedPdfModal
        isOpen={showAdvancedPdf}
        onClose={() => setShowAdvancedPdf(false)}
        source={activePdfSource}
        totalPages={state.totalPages}
        currentPage={state.page}
        initialBookmarks={state.bookmarks}
        onApplied={(bytes, message, embeddedBookmarks) => {
          replaceDocumentBytes(bytes, state.page);
          if (embeddedBookmarks) {
            state.setBookmarks(embeddedBookmarks.map((item, index) => ({
              id: "bookmark-" + Date.now() + "-" + index,
              title: item.title,
              page: item.page,
              parent: item.parent,
              createdAt: Date.now(),
            })));
          }
          toast.success(message);
        }}
      />

      <DigitalSignatureModal
        isOpen={showDigitalSignature}
        onClose={() => setShowDigitalSignature(false)}
        source={activePdfSource}
        currentPage={state.page}
        totalPages={state.totalPages}
        canSign={Boolean(window.opdf?.signPdfP12 && window.opdf?.inspectP12Certificate)}
        inspectCertificate={bridge.inspectP12Certificate}
        inspectSignatures={bridge.inspectPdfSignatures}
        signDocument={bridge.signPdfP12}
        onApplied={(bytes, certificate) => {
          replaceDocumentBytes(bytes, state.page);
          toast.success("Digitally signed by " + certificate.commonName + ". Save the PDF to preserve the signature.");
        }}
      />

      {state.showDashboard && !isPublic ? (
        <AllToolsDashboard
          hasDocument={state.hasDocument}
          fileName={state.fileName}
          docBytes={state.docBytes}
          getDocumentBytes={materializeDocumentBytes}
          onLoadConvertedPdf={(bytes, name) => {
            state.setFileName(name);
            replaceDocumentBytes(bytes, 1, {
              preserveSourceIdentity: false,
              resetDocumentMetadata: true,
            });
          }}
          onClose={() => state.setShowDashboard(false)}
          onTriggerCompress={() => openSidebarTool("compress-pdf")}
          onTriggerMerge={() => openSidebarTool("merge-pdf")}
          onTriggerSplit={() => openSidebarTool("split-pdf")}
          onSelectTool={(toolId) => {
            state.setActiveDashboardTool(toolId);
            state.setShowDashboard(false);
          }}
        />
      ) : (
        <main 
          className="workspace acrobat-body"
          style={{
            gridTemplateColumns: `${leftColWidth} ${leftResizerWidth} 1fr ${rightResizerWidth} ${rightColWidth}`
          }}
        >
          {!state.hasDocument && state.activeDashboardTool ? (
            <div style={{ gridColumn: 3 }} className="w-full h-full min-h-0 overflow-hidden">
              <IntegratedUploadWorkspace
                activeToolId={state.activeDashboardTool}
                onFileSelected={handleIntegratedFileSelected}
              />
            </div>
          ) : (
            <>
              <div 
                style={{ 
                  gridColumn: 1,
                  display: (!showLeft || isLeftCollapsed) ? "none" : "block"
                }} 
                className="h-full min-h-0 overflow-hidden"
              >
                <ThumbnailPanel
                  thumbnails={state.thumbnails}
                  page={state.page}
                  totalPages={state.totalPages}
                  hasDocument={state.hasDocument}
                  onSelectPage={state.setPage}
                  bookmarks={state.bookmarks}
                  setBookmarks={state.setBookmarks}
                  isCollapsed={isLeftCollapsed}
                  setIsCollapsed={setIsLeftCollapsed}
                  selectedPages={selectedThumbnailPages}
                  onSelectionChange={setSelectedThumbnailPages}
                  onRotatePages={handleRotatePages}
                  onDeletePages={handleDeletePages}
                  runDocumentTool={(tool) => headerProps.runDocumentTool(tool as import("./lib/document-tools").DocumentTool)}
                  onInsertAfterPage={(targetPage) => {
                    state.setPage(targetPage);
                    state.setShowInsertModal(true);
                  }}
                />
              </div>

              <div
                className={`sidebar-resizer ${isDraggingLeft ? "dragging" : ""}`}
                onMouseDown={() => setIsDraggingLeft(true)}
                title="Drag to resize sidebar, Double click to collapse"
                onDoubleClick={() => setIsLeftCollapsed(true)}
                style={{ 
                  gridColumn: 2,
                  display: (!showLeft || isLeftCollapsed) ? "none" : "block"
                }}
              />

              {activeTab && (
                <section
                  key={activeTab.id}
                  ref={viewerAreaRef}
                  className="viewer-area"
                  tabIndex={0}
                  onWheel={onViewerWheel}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  aria-label="PDF viewer area"
                  style={{
                    gridColumn: 3,
                    display: "block"
                  }}
                >
                  <ViewerErrorBoundary>
                    <AdaptivePdfViewer {...viewerProps} />
                  </ViewerErrorBoundary>
                </section>
              )}
            </>
          )}

          <SplitModal
            isOpen={state.showSplitModal}
            onClose={() => state.setShowSplitModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            getDocumentBytes={materializeDocumentBytes}
            totalPages={state.totalPages}
            setViewerError={state.setViewerError}
          />

          <MergeModal
            isOpen={state.showMergeModal}
            onClose={() => state.setShowMergeModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            getDocumentBytes={materializeDocumentBytes}
            sourceSize={state.sourceBlob?.size ?? state.docBytes?.length ?? 0}
            totalPages={state.totalPages}
            onMergeComplete={(mergedBytes) => {
              replaceDocumentBytes(mergedBytes, 1, {
                preserveSourceIdentity: false,
                resetDocumentMetadata: true,
              });
              toast.success("PDF documents merged successfully.");
            }}
            setViewerError={state.setViewerError}
          />

          <InsertPdfModal
            isOpen={state.showInsertModal}
            onClose={() => state.setShowInsertModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            getDocumentBytes={materializeDocumentBytes}
            totalPages={state.totalPages}
            currentPage={state.page}
            onInsertComplete={(insertedBytes, nextPage) => {
              replaceDocumentBytes(insertedBytes, nextPage);
            }}
            setViewerError={state.setViewerError}
            hasDesktopBridge={state.hasDesktopBridge}
            bridge={bridge}
          />



          <div
            className={`sidebar-resizer ${isDraggingRight ? "dragging" : ""}`}
            onMouseDown={() => setIsDraggingRight(true)}
            title="Drag to resize sidebar, Double click to collapse"
            onDoubleClick={() => setIsRightCollapsed(true)}
            style={{ 
              gridColumn: 4,
              display: isRightCollapsed ? "none" : "block"
            }}
          />

          <div 
            style={{ 
              gridColumn: 5,
              display: isRightCollapsed ? "none" : "block"
            }} 
            className="h-full min-h-0 overflow-hidden"
          >
            {isAiPanelOpen ? (
              <AiAssistantPanel
                isOpen
                docked
                onClose={() => setIsAiPanelOpen(false)}
                onOpenLiveEditor={() => setIsLiveEditorOpen(true)}
              />
            ) : activeMarkupTool ? (
              <DocumentMarkupPanel
                tool={activeMarkupTool}
                fileName={state.fileName}
                totalPages={state.totalPages}
                onClose={() => setActiveMarkupTool(null)}
                onApply={runConfiguredMarkupTool}
              />
            ) : state.activeDashboardTool ? (
              <DocumentToolPanel
                activeToolId={state.activeDashboardTool}
                fileName={state.fileName}
                docBytes={state.docBytes}
                sourceBlob={state.sourceBlob}
                getDocumentBytes={materializeDocumentBytes}
                totalPages={state.totalPages}
                annotations={state.annotations}
                onClose={() => {
                  state.setActiveDashboardTool(null);
                }}
                onLoadConvertedPdf={(bytes, name) => {
                  state.setFileName(name);
                  replaceDocumentBytes(bytes, 1, {
                    preserveSourceIdentity: false,
                    resetDocumentMetadata: true,
                  });
                }}
                onOpenHtmlEditor={(html) => {
                  setLiveEditorHtml(html);
                  setIsLiveEditorOpen(true);
                }}
                setViewerError={state.setViewerError}
                replaceDocumentBytes={replaceDocumentBytes}
                bridge={bridge}
              />
            ) : (
              <RightInfoPanel
                hasDocument={state.hasDocument}
                fileName={state.fileName}
                totalPages={state.totalPages}
                page={state.page}
                scale={state.scale}
                viewerError={state.viewerError}
                annotations={state.annotations}
                ocrJobs={state.ocrJobs}
                onRemoveAnnotation={removeAnnotation}
                onUpdateAnnotation={updateAnnotation}
                onGoToPage={state.setPage}
                isCollapsed={isRightCollapsed}
                setIsCollapsed={setIsRightCollapsed}
                onQuickTool={(tool) => {
                  if (tool === "ocr") {
                    void headerProps.runOcr();
                    return;
                  }
                  if (tool === "page-numbers") {
                    openMarkupSidebar("page-numbers");
                    return;
                  }
                  openSidebarTool(tool);
                }}
              />
            )}
          </div>

          {/* Floating Expand Buttons */}
          {(state.hasDocument || !state.activeDashboardTool) && isLeftCollapsed && (
            <button
              className="absolute left-0 top-1/2 z-30 flex h-16 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r bg-[var(--acrobat-blue)] text-white shadow hover:bg-[var(--acrobat-blue-hover)] transition-all hover:w-6"
              onClick={() => setIsLeftCollapsed(false)}
              title="Expand left sidebar"
              type="button"
            >
              <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {isRightCollapsed && (
            <button
              className="absolute right-0 top-1/2 z-30 flex h-16 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l bg-[var(--acrobat-blue)] text-white shadow hover:bg-[var(--acrobat-blue-hover)] transition-all hover:w-6"
              onClick={() => setIsRightCollapsed(false)}
              title="Expand right sidebar"
              type="button"
            >
              <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </main>
      )}
      <StatusBar hasDocument={state.hasDocument} page={state.page} totalPages={state.totalPages} viewerError={state.viewerError} scale={state.scale} viewMode={state.viewMode} activeTool={state.activeTool} saveState={state.saveState} />
      
      {/* Floating AI Chat Assistant Trigger FAB */}
      <button
        ref={buttonRef}
        className={`ai-float-toggle-btn pulse-aura ${isAiPanelOpen ? "panel-open" : ""} ${isDragging ? "dragging" : ""}`}
        style={position ? {
          left: `${position.x}px`,
          top: `${position.y}px`,
          right: "auto",
          bottom: "auto"
        } : undefined}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={() => {
          if (!hasMovedRef.current) {
            const nextOpen = !isAiPanelOpen;
            setIsAiPanelOpen(nextOpen);
            if (nextOpen) {
              setIsRightCollapsed(false);
              if (rightWidth < 340) setRightWidth(340);
            }
          }
        }}
        title={isAiPanelOpen ? "Close AI Assistant" : "Open AI Assistant"}
        type="button"
      >
        {isAiPanelOpen ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <AiSparkIcon size={24} />
        )}
      </button>

      <LiveHtmlEditor isOpen={isLiveEditorOpen} onClose={() => setIsLiveEditorOpen(false)} initialHtml={liveEditorHtml} />
    </div>
  );
}
