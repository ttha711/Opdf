import { AdaptivePdfViewer } from "../AdaptivePdfViewer";
import { AiAssistantPanel } from "../AiAssistantPanel";
import { DocumentMarkupPanel } from "../DocumentMarkupPanel";
import { DocumentToolPanel } from "../DocumentToolPanel";
import { IntegratedUploadWorkspace } from "../IntegratedUploadWorkspace";
import { NativeContentEditorPanel } from "../NativeContentEditorPanel";
import { RightInfoPanel } from "../RightInfoPanel";
import { ViewerErrorBoundary } from "../ViewerErrorBoundary";
import { InsertPdfModal } from "../InsertPdfModal";
import { MergeModal } from "../MergeModal";
import { SplitModal } from "../SplitModal";
import type { MarkupTool } from "../../hooks/useDocumentActions";
import { useNativeEditBytes } from "../../hooks/useNativeEditBytes";
import { commitPendingNativeInlineEdit, requestNativeInlineTextEdit } from "../../lib/nativeEditRuntime";

type Controllers = ReturnType<typeof import("../../hooks/useAppControllers").useAppControllers>;
type Sidebars = ReturnType<typeof import("../../hooks/useResizableSidebars").useResizableSidebars>;

type Props = {
  controllers: Controllers;
  sidebars: Sidebars;
  activeMarkupTool: MarkupTool | null;
  setActiveMarkupTool: (tool: MarkupTool | null) => void;
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
  activeMarkupTool,
  setActiveMarkupTool,
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
    goToPage,
  } = controllers;
  const {
    rightWidth,
    isRightCollapsed,
    setIsRightCollapsed,
    isDraggingRight,
    setIsDraggingRight,
  } = sidebars;

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const getNativeEditBytes = useNativeEditBytes(state);
  const rightAvailable = state.hasDocument || Boolean(state.activeDashboardTool) ||
    Boolean(activeMarkupTool) || isAiPanelOpen;
  const showRight = rightAvailable && !isRightCollapsed;
  const columns = [
    "1fr",
    showRight ? "6px" : "0px",
    showRight ? `${rightWidth}px` : "0px",
  ].join(" ");

  return (
    <main className="workspace acrobat-body" style={{ gridTemplateColumns: columns }}>
      {!state.hasDocument && state.activeDashboardTool ? (
        <div style={{ gridColumn: 1 }} className="w-full h-full min-h-0 overflow-hidden">
          <IntegratedUploadWorkspace
            activeToolId={state.activeDashboardTool}
            onFileSelected={handleIntegratedFileSelected}
          />
        </div>
      ) : activeTab ? (
        <section
          key={activeTab.id}
          ref={viewerAreaRef}
          className="viewer-area"
          tabIndex={0}
          onWheel={onViewerWheel}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDoubleClick={() => {
            if (state.activeTool !== "select") return;
            const text = window.getSelection()?.toString().trim() ?? "";
            if (!text) return;
            requestNativeInlineTextEdit(state.page - 1, text);
            state.setActiveTool("edit-content");
          }}
          aria-label="PDF viewer area"
          style={{ gridColumn: 1 }}
        >
          <ViewerErrorBoundary>
            <AdaptivePdfViewer {...viewerProps} getDocumentBytes={getNativeEditBytes} />
          </ViewerErrorBoundary>
        </section>
      ) : null}

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
        style={{ gridColumn: 2, display: showRight ? "block" : "none" }}
      />
      {showRight ? (
        <button
          type="button"
          className="opdf-right-panel-backdrop"
          data-opdf-action="right-panel-backdrop"
          aria-label="Close right panel"
          onClick={() => setIsRightCollapsed(true)}
        />
      ) : null}
      <div
        style={{ gridColumn: 3, display: showRight ? "block" : "none" }}
        className="opdf-side-panel opdf-side-panel--right relative h-full min-h-0 overflow-hidden"
        data-opdf-right-sidebar={showRight ? "open" : "closed"}
      >
        <button
          type="button"
          className="opdf-panel-collapse"
          data-opdf-action="collapse-right-panel"
          onClick={() => setIsRightCollapsed(true)}
          title="Collapse right panel"
        >
          <span aria-hidden="true">›</span>
          <span>Collapse</span>
        </button>
        {state.hasDocument && state.activeTool === "edit-content" ? (
          <NativeContentEditorPanel
            page={state.page}
            getDocumentBytes={getNativeEditBytes}
            onApplyBytes={(bytes) => {
              replaceDocumentBytes(bytes, state.page, { preserveAnnotations: true, preservePageCount: true });
            }}
            onClose={() => { void commitPendingNativeInlineEdit().finally(() => state.setActiveTool("select")); }}
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
            onGoToPage={goToPage}
            onQuickTool={(tool) => {
              if (tool === "ocr") return void headerProps.runOcr();
              if (tool === "page-numbers") return openMarkupSidebar("page-numbers");
              openSidebarTool(tool);
            }}
          />
        ) : null}
      </div>

      {rightAvailable && isRightCollapsed ? (
        <button
          type="button"
          className="absolute right-0 top-1/2 z-30 flex h-16 w-5 -translate-y-1/2 items-center justify-center rounded-l bg-[var(--acrobat-blue)] text-white"
          data-opdf-action="expand-right-panel"
          onClick={() => setIsRightCollapsed(false)}
          title={state.activeTool === "edit-content" ? "Open advanced edit settings" : "Expand right sidebar"}
        >
          ‹
        </button>
      ) : null}
    </main>
  );
}
