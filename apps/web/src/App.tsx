import { useCallback, useEffect, useRef, useState } from "react";
import { PdfViewer } from "./components/PdfViewer";
import { AppHeader } from "./components/AppHeader";
import { AllToolsDashboard } from "./components/AllToolsDashboard";
import { ThumbnailPanel } from "./components/ThumbnailPanel";
import { RightInfoPanel } from "./components/RightInfoPanel";
import { OverlayEditors } from "./components/OverlayEditors";
import { SplitModal } from "./components/SplitModal";
import { MergeModal } from "./components/MergeModal";
import { InsertPdfModal } from "./components/InsertPdfModal";
import { DocumentMarkupModal } from "./components/DocumentMarkupModal";
import { StatusBar } from "./components/StatusBar";
import { FindBar } from "./components/FindBar";
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
import aiAvatar from "./assets/ai-avatar.jpg";
import "./types/opdf";
import { useConfirm } from "./components/ConfirmDialog";

function PageSelectionFloatingBar({
  selectedPages,
  totalPages,
  onClear,
  onRotate,
  onDelete,
  onInsertAfterPage,
  runDocumentTool,
}: {
  selectedPages: Set<number>;
  totalPages: number;
  onClear: () => void;
  onRotate: (pages: number[], degrees: number) => Promise<void>;
  onDelete: (pages: number[]) => Promise<void>;
  onInsertAfterPage?: (page: number) => void;
  runDocumentTool?: (tool: string) => void;
}) {
  const confirm = useConfirm();
  const [isActing, setIsActing] = useState(false);
  const isAllSelected = totalPages > 0 && selectedPages.size === totalPages;

  async function handleRotate(degrees: number) {
    if (isActing) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    setIsActing(true);
    try { await onRotate(pages, degrees); } finally { setIsActing(false); }
  }

  async function handleDelete() {
    if (isActing) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    const ok = await confirm({
      title: "Delete Pages",
      message: `Delete ${pages.length} selected page(s) (${pages.join(", ")})? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setIsActing(true);
    try { await onDelete(pages); } finally { setIsActing(false); }
  }

  const btnCls = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium hover:bg-violet-50 disabled:opacity-50 cursor-pointer transition-colors text-[var(--text-primary)]";
  const divider = <div className="h-4 w-px bg-violet-200 shrink-0" />;

  return (
    <div
      style={{ pointerEvents: "all" }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full border border-violet-300 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-sm"
    >
      <span className="text-[12px] font-semibold text-violet-700 mr-0.5 shrink-0">
        {isAllSelected ? "All" : selectedPages.size} page{selectedPages.size !== 1 ? "s" : ""}
      </span>

      {divider}

      {/* Rotate selected */}
      <button className={btnCls} title="Rotate left 90°" type="button" disabled={isActing} onClick={() => handleRotate(-90)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
        </svg>
        Rotate ↺
      </button>
      <button className={btnCls} title="Rotate right 90°" type="button" disabled={isActing} onClick={() => handleRotate(90)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
        Rotate ↻
      </button>

      {/* Rotate ALL — only when all pages selected */}
      {isAllSelected && runDocumentTool && (
        <>
          {divider}
          <button className={btnCls} title="Rotate all pages left" type="button" disabled={isActing} onClick={() => runDocumentTool("rotate-left-all")}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
            </svg>
            All ↺
          </button>
          <button className={btnCls} title="Rotate all pages right" type="button" disabled={isActing} onClick={() => runDocumentTool("rotate-right-all")}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
            </svg>
            All ↻
          </button>
        </>
      )}

      {/* Insert PDF — only when exactly 1 page selected */}
      {selectedPages.size === 1 && onInsertAfterPage && (
        <>
          {divider}
          <button
            className={btnCls}
            title="Insert PDF after this page"
            type="button"
            disabled={isActing}
            onClick={() => {
              const page = Array.from(selectedPages)[0];
              onInsertAfterPage(page);
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            Insert PDF
          </button>
        </>
      )}

      {divider}
      <button
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer transition-colors"
        title="Delete selected pages" type="button" disabled={isActing}
        onClick={handleDelete}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete
      </button>

      {divider}
      <button
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-violet-400 hover:bg-violet-50 hover:text-violet-700 cursor-pointer transition-colors"
        title="Clear selection (Escape)" type="button"
        onClick={onClear}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function App() {
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);
  const isLocal = hasDesktopBridge || (typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname === "::1" ||
    window.location.hostname.endsWith(".trycloudflare.com") ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.startsWith("10.") ||
    window.location.hostname.startsWith("172.")
  ));
  const isPublic = !isLocal;

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
  const lastViewerSelectedRef = useRef<number | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isLiveEditorOpen, setIsLiveEditorOpen] = useState(false);
  const [liveEditorHtml, setLiveEditorHtml] = useState<string | null>(null);

  const {
    leftWidth,
    rightWidth,
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
    runConfiguredMarkupTool,
    removeAnnotation,
    createToolAnnotation,
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

  const handleTabThumbsLoaded = useCallback((tabId: string, thumbs: Array<{ page: number; url: string; blob: Blob }>) => {
    state.setTabs((prevTabs) =>
      prevTabs.map((t) => (t.id === tabId ? { ...t, thumbnails: thumbs } : t))
    );
    if (state.activeTabId === tabId) {
      state.setThumbnails(thumbs);
    }
  }, [state]);

  // Clear thumbnail selection when document is closed or replaced
  useEffect(() => {
    if (!state.hasDocument) setSelectedThumbnailPages(new Set());
  }, [state.hasDocument]);

  const handleRotatePages = useCallback(async (pages: number[], degrees: number) => {
    if (!state.docBytes) return;
    const next = await bridge.rotatePages(state.docBytes, pages, degrees);
    replaceDocumentBytes(next, state.page);
  }, [state.docBytes, state.page, bridge, replaceDocumentBytes]);

  const handleViewerPageSelectionClick = useCallback((pageNum: number, ctrl: boolean, shift: boolean) => {
    if (shift && lastViewerSelectedRef.current !== null) {
      const start = Math.min(lastViewerSelectedRef.current, pageNum);
      const end = Math.max(lastViewerSelectedRef.current, pageNum);
      setSelectedThumbnailPages(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(i);
        return next;
      });
    } else {
      setSelectedThumbnailPages(prev => {
        const next = new Set(prev);
        if (next.has(pageNum)) next.delete(pageNum);
        else next.add(pageNum);
        return next;
      });
      lastViewerSelectedRef.current = pageNum;
    }
  }, []);

  const handleDeletePages = useCallback(async (pages: number[]) => {
    if (!state.docBytes) return;
    const next = await bridge.deletePages(state.docBytes, pages);
    replaceDocumentBytes(next, Math.min(state.page, state.totalPages - pages.length));
  }, [state.docBytes, state.page, state.totalPages, bridge, replaceDocumentBytes]);

  const showLeft = state.hasDocument || !state.activeDashboardTool;
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const leftColWidth = showLeft && !isLeftCollapsed ? `${leftWidth}px` : "0px";
  const leftResizerWidth = showLeft && !isLeftCollapsed ? "4px" : "0px";
  const rightResizerWidth = !isRightCollapsed ? "4px" : "0px";
  const rightColWidth = !isRightCollapsed ? `${rightWidth}px` : "0px";

  return (
    <div className="app acrobat-shell">
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
          zIndex: 9999,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>🎉</span>
            <span>Phiên bản mới <strong>v{updateInfo.version}</strong> đã sẵn sàng. ({updateInfo.description || "Có lỗi được sửa và cải tiến hiệu năng"})</span>
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
      />

      {state.showDashboard && !isPublic ? (
        <AllToolsDashboard
          hasDocument={state.hasDocument}
          fileName={state.fileName}
          docBytes={state.docBytes}
          thumbnails={state.thumbnails}
          onLoadConvertedPdf={(bytes, name) => {
            state.setDocBytes(bytes);
            state.setFileName(name);
            state.setPage(1);
          }}
          onClose={() => state.setShowDashboard(false)}
          onTriggerCompress={compressDocument}
          onTriggerMerge={mergeDocuments}
          onTriggerSplit={splitDocument}
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
                  {selectedThumbnailPages.size > 0 && <PageSelectionFloatingBar
                    selectedPages={selectedThumbnailPages}
                    totalPages={state.totalPages}
                    onClear={() => setSelectedThumbnailPages(new Set())}
                    onRotate={handleRotatePages}
                    onDelete={handleDeletePages}
                    onInsertAfterPage={(targetPage) => {
                      state.setPage(targetPage);
                      state.setShowInsertModal(true);
                    }}
                    runDocumentTool={(tool) => headerProps.runDocumentTool(tool as import("./lib/document-tools").DocumentTool)}
                  />}
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
                  <ViewerErrorBoundary>
                    <PdfViewer
                      {...viewerProps}
                      data={state.docBytes}
                      page={state.page}
                      annotations={state.annotations}
                      pageRotations={state.pageRotations}
                      initialThumbnails={state.thumbnails}
                      onThumbsLoaded={(thumbs) => handleTabThumbsLoaded(activeTab.id, thumbs)}
                      selectedPages={selectedThumbnailPages}
                      onPageSelectionClick={handleViewerPageSelectionClick}
                    />
                  </ViewerErrorBoundary>
                </section>
              )}
            </>
          )}

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

          <SplitModal
            isOpen={state.showSplitModal}
            onClose={() => state.setShowSplitModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            totalPages={state.totalPages}
            setViewerError={state.setViewerError}
          />

          <MergeModal
            isOpen={state.showMergeModal}
            onClose={() => state.setShowMergeModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            totalPages={state.totalPages}
            onMergeComplete={(mergedBytes) => {
              state.setDocBytes(mergedBytes);
              state.setPage(1);
              toast.success("Ghép tài liệu PDF thành công!");
            }}
            setViewerError={state.setViewerError}
          />

          <InsertPdfModal
            isOpen={state.showInsertModal}
            onClose={() => state.setShowInsertModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            totalPages={state.totalPages}
            currentPage={state.page}
            onInsertComplete={(insertedBytes, nextPage) => {
              replaceDocumentBytes(insertedBytes, nextPage);
            }}
            setViewerError={state.setViewerError}
            hasDesktopBridge={state.hasDesktopBridge}
            bridge={bridge}
          />

          <DocumentMarkupModal
            tool={activeMarkupTool}
            fileName={state.fileName}
            totalPages={state.totalPages}
            onClose={() => setActiveMarkupTool(null)}
            onApply={runConfiguredMarkupTool}
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
            {state.activeDashboardTool ? (
              <DocumentToolPanel
                activeToolId={state.activeDashboardTool}
                fileName={state.fileName}
                docBytes={state.docBytes}
                totalPages={state.totalPages}
                thumbnails={state.thumbnails}
                annotations={state.annotations}
                onClose={() => {
                  state.setActiveDashboardTool(null);
                }}
                onLoadConvertedPdf={(bytes, name) => {
                  state.setDocBytes(bytes);
                  state.setFileName(name);
                  state.setPage(1);
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
                searchResult={state.searchResult}
                annotations={state.annotations}
                ocrJobs={state.ocrJobs}
                onRemoveAnnotation={removeAnnotation}
                isCollapsed={isRightCollapsed}
                setIsCollapsed={setIsRightCollapsed}
              />
            )}
          </div>

          {/* Floating Expand Buttons */}
          {(state.hasDocument || !state.activeDashboardTool) && isLeftCollapsed && (
            <button
              className="absolute left-0 top-1/2 z-30 flex h-16 w-3.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r bg-[var(--acrobat-blue)] text-white shadow hover:bg-[var(--acrobat-blue-hover)] transition-all hover:w-5"
              onClick={() => setIsLeftCollapsed(false)}
              title="Expand Left Sidebar"
              type="button"
            >
              <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {isRightCollapsed && (
            <button
              className="absolute right-0 top-1/2 z-30 flex h-16 w-3.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l bg-[var(--acrobat-blue)] text-white shadow hover:bg-[var(--acrobat-blue-hover)] transition-all hover:w-5"
              onClick={() => setIsRightCollapsed(false)}
              title="Expand Right Sidebar"
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
            setIsAiPanelOpen(!isAiPanelOpen);
          }
        }}
        title={isAiPanelOpen ? "Đóng trợ lý AI" : "Mở trợ lý AI"}
        type="button"
      >
        {isAiPanelOpen ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <img src={aiAvatar} alt="AI" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
        )}
      </button>

      {/* AI Assistant Chat Panel */}
      <AiAssistantPanel
        isOpen={isAiPanelOpen}
        onClose={() => setIsAiPanelOpen(false)}
        align={panelAlign}
        onOpenLiveEditor={() => setIsLiveEditorOpen(true)}
      />
      <LiveHtmlEditor isOpen={isLiveEditorOpen} onClose={() => setIsLiveEditorOpen(false)} initialHtml={liveEditorHtml} />
    </div>
  );
}
