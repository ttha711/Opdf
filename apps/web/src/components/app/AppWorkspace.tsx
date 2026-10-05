import type { Dispatch, SetStateAction } from "react";
import { AdaptivePdfViewer } from "../AdaptivePdfViewer";
import { AiAssistantPanel } from "../AiAssistantPanel";
import { DocumentMarkupPanel } from "../DocumentMarkupPanel";
import { DocumentToolPanel } from "../DocumentToolPanel";
import { IntegratedUploadWorkspace } from "../IntegratedUploadWorkspace";
import { NativeContentEditorPanel } from "../NativeContentEditorPanel";
import { RightInfoPanel } from "../RightInfoPanel";
import { ThumbnailPanel } from "../ThumbnailPanel";
import { ViewerErrorBoundary } from "../ViewerErrorBoundary";
import { InsertPdfModal } from "../InsertPdfModal";
import { MergeModal } from "../MergeModal";
import { SplitModal } from "../SplitModal";
import type { MarkupTool } from "../../hooks/useDocumentActions";
type Controllers = ReturnType<typeof import("../../hooks/useAppControllers").useAppControllers>;
type Sidebars = ReturnType<typeof import("../../hooks/useResizableSidebars").useResizableSidebars>;
type PageActions = ReturnType<typeof import("../../hooks/useAppPageManagement").useAppPageManagement>;
type Props = {
  controllers: Controllers;
  sidebars: Sidebars;
  pageActions: PageActions;
  activeMarkupTool: MarkupTool | null;
  setActiveMarkupTool: (tool: MarkupTool | null) => void;
  selectedThumbnailPages: Set<number>;
  setSelectedThumbnailPages: Dispatch<SetStateAction<Set<number>>>;
  handleIntegratedFileSelected: (file: File) => void | Promise<void>;
  isAiPanelOpen: boolean;
  setIsAiPanelOpen: (value: boolean) => void;
  setIsLiveEditorOpen: (value: boolean) => void;
  setLiveEditorHtml: (value: string | null) => void;
  openSidebarTool: (toolId: string) => void;
  openMarkupSidebar: (tool: MarkupTool) => void;
  success: (message: string) => void;
};
export function AppWorkspace({
  controllers,
  sidebars,
  pageActions,
  activeMarkupTool,
  setActiveMarkupTool,
  selectedThumbnailPages,
  setSelectedThumbnailPages,
  handleIntegratedFileSelected,
  isAiPanelOpen,
  setIsAiPanelOpen,
  setIsLiveEditorOpen,
  setLiveEditorHtml,
  openSidebarTool,
  openMarkupSidebar,
  success,
}: Props) {
  const {
    state,
    bridge,
    viewerAreaRef,
    viewerProps,
    onViewerWheel,
    onDragOver,
    onDrop,
    materializeDocumentBytes,
    replaceDocumentBytes,
    runConfiguredMarkupTool,
    removeAnnotation,
    updateAnnotation,
    headerProps,
  } = controllers;
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
  } = sidebars;
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const showLeft = !state.activeDashboardTool;
  const rightAvailable = state.hasDocument || Boolean(state.activeDashboardTool) ||
    Boolean(activeMarkupTool) || isAiPanelOpen;
  const showRight = rightAvailable && !isRightCollapsed;
  const columns = [
    showLeft && !isLeftCollapsed ? `${leftWidth}px` : "0px",
    showLeft && !isLeftCollapsed ? "6px" : "0px",
    "1fr",
    showRight ? "6px" : "0px",
    showRight ? `${rightWidth}px` : "0px",
  ].join(" ");
  return (
    <main className="workspace acrobat-body" style={{ gridTemplateColumns: columns }}>
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
            style={{ gridColumn: 1, display: !showLeft || isLeftCollapsed ? "none" : "block" }}
            className="opdf-side-panel opdf-side-panel--left h-full min-h-0 overflow-hidden"
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
              onRotatePages={pageActions.handleRotatePages}
              onDeletePages={pageActions.handleDeletePages}
              onReorderPages={pageActions.handleReorderPages}
              onDuplicatePages={pageActions.handleDuplicatePages}
              onExtractPages={pageActions.handleExtractPages}
              runDocumentTool={(tool) => headerProps.runDocumentTool(tool)}
              onInsertAfterPage={(targetPage) => {
                state.setPage(targetPage);
                state.setShowInsertModal(true);
              }}
            />
          </div>
          <div
            className={`sidebar-resizer ${isDraggingLeft ? "dragging" : ""}`}
            onMouseDown={() => setIsDraggingLeft(true)}
            onDoubleClick={() => setIsLeftCollapsed(true)}
            title="Drag to resize sidebar, Double click to collapse"
            style={{ gridColumn: 2, display: !showLeft || isLeftCollapsed ? "none" : "block" }}
          />
          {activeTab ? (
            <section
              key={activeTab.id}
              ref={viewerAreaRef}
              className="viewer-area"
              tabIndex={0}
              onWheel={onViewerWheel}
              onDragOver={onDragOver}
              onDrop={onDrop}
              aria-label="PDF viewer area"
              style={{ gridColumn: 3 }}
            >
              <ViewerErrorBoundary>
                <AdaptivePdfViewer {...viewerProps} />
              </ViewerErrorBoundary>
            </section>
          ) : null}
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
        onMergeComplete={(bytes) => {
          replaceDocumentBytes(bytes, 1, {
            preserveSourceIdentity: false,
            resetDocumentMetadata: true,
          });
          success("PDF documents merged successfully.");
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
        onInsertComplete={(bytes, page) => replaceDocumentBytes(bytes, page)}
        setViewerError={state.setViewerError}
        hasDesktopBridge={state.hasDesktopBridge}
        bridge={bridge}
      />
      <div
        className={`sidebar-resizer ${isDraggingRight ? "dragging" : ""}`}
        onMouseDown={() => setIsDraggingRight(true)}
        onDoubleClick={() => setIsRightCollapsed(true)}
        title="Drag to resize sidebar, Double click to collapse"
        style={{ gridColumn: 4, display: showRight ? "block" : "none" }}
      />
      <div
        style={{ gridColumn: 5, display: showRight ? "block" : "none" }}
        className="opdf-side-panel opdf-side-panel--right h-full min-h-0 overflow-hidden"
        data-opdf-right-sidebar={showRight ? "open" : "closed"}
      >
        {state.hasDocument && state.activeTool === "edit-content" ? (
          <NativeContentEditorPanel
            page={state.page}
            getDocumentBytes={materializeDocumentBytes}
            onApplyBytes={(bytes) => {
              replaceDocumentBytes(bytes, state.page, { preserveAnnotations: true });
            }}
            onClose={() => state.setActiveTool("select")}
          />
        ) : isAiPanelOpen ? (
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
            onClose={() => state.setActiveDashboardTool(null)}
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
        ) : state.hasDocument ? (
          <RightInfoPanel
            hasDocument
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
              if (tool === "ocr") return void headerProps.runOcr();
              if (tool === "page-numbers") return openMarkupSidebar("page-numbers");
              openSidebarTool(tool);
            }}
          />
        ) : null}
      </div>
      {state.hasDocument && isLeftCollapsed ? (
        <button type="button" className="opdf-mobile-pages-toggle" onClick={() => setIsLeftCollapsed(false)}>
          Pages
        </button>
      ) : null}
      {rightAvailable && isRightCollapsed ? (
        <button
          type="button"
          className="absolute right-0 top-1/2 z-30 flex h-16 w-5 -translate-y-1/2 items-center justify-center rounded-l bg-[var(--acrobat-blue)] text-white"
          onClick={() => setIsRightCollapsed(false)}
          title="Expand right sidebar"
        >
          ‹
        </button>
      ) : null}
    </main>
  );
}
