import type { ChangeEvent, Dispatch, Ref, SetStateAction } from "react";
import { MenuDropdown, type MenuItemDef } from "./MenuDropdown";
import type { ActiveTool, AnnotationToolDefaults, ViewMode, ZoomPreset } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import { TabBar } from "./TabBar";
import {
  FileViewGroup,
  NavigationZoomGroup,
  AnnotationsHistoryGroup,
  DocumentMarkupGroup,
  FileUtilitiesGroup,
} from "./AppHeader.parts";
import type { OpdfTab } from "../lib/web-storage";
import { getEditorLaunchTitle } from "../lib/documentEditingExperience";
import { useOpdfBridge } from "../hooks/useOpdfBridge";
import { toast } from "./ToastProvider";

export function AppHeader({
  fileInputRef,
  hasDesktopBridge,
  hasDocument,
  fileName,
  openFile,
  closeDocument,
  fileMenuItems,
  editMenuItems,
  viewMenuItems,
  toolsMenuItems,
  openMenu,
  toggleMenu,
  closeMenu,
  activeTool,
  setActiveTool,
  annotationToolDefaults,
  setAnnotationToolDefaults,
  exportPdf,
  page,
  totalPages,
  setPage,
  goPrevPage,
  goNextPage,
  zoomOut,
  zoomIn,
  resetZoom,
  scale,
  zoomPreset,
  applyZoomPreset,
  pageSearch,
  setPageSearch,
  viewMode,
  setViewMode,
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
  documentTool,
  setDocumentTool,
  runDocumentTool,
  openDocumentMarkupTool,
  onSelectLocalFile,
  showFindBar,
  onToggleFindBar,
  theme,
  toggleTheme,
  showDashboard,
  setShowDashboard,
  onOpenAiEditorWindow,
  savePdf,
  savePdfAs,
  saveState,

  // NEW TABS PROPS
  tabs,
  activeTabId,
  activeGroupFilter,
  switchTab,
  closeTab,
  addTabToGroup,
  removeTabFromGroup,
  renameTabGroup,
  changeTabGroupColor,
  closeTabGroup,
  ungroupGroup,
}: {
  fileInputRef: Ref<HTMLInputElement>;
  hasDesktopBridge: boolean;
  hasDocument: boolean;
  fileName: string;
  openFile: () => void;
  closeDocument: () => void;
  fileMenuItems: MenuItemDef[];
  editMenuItems: MenuItemDef[];
  viewMenuItems: MenuItemDef[];
  toolsMenuItems: MenuItemDef[];
  openMenu: string | null;
  toggleMenu: (label: string) => void;
  closeMenu: () => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  annotationToolDefaults: AnnotationToolDefaults;
  setAnnotationToolDefaults: Dispatch<SetStateAction<AnnotationToolDefaults>>;
  exportPdf: () => void;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  goPrevPage: () => void;
  goNextPage: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
  resetZoom: () => void;
  scale: number;
  zoomPreset: ZoomPreset;
  applyZoomPreset: (preset: ZoomPreset) => void;
  pageSearch: string;
  setPageSearch: (value: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  undoAnnotations: () => void;
  redoAnnotations: () => void;
  runOcr: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  compressDocument: () => void;
  addWatermark: () => void;
  splitDocument: () => void;
  mergeDocuments: () => void;
  convertToImages: () => void;
  documentTool: DocumentTool;
  setDocumentTool: (tool: DocumentTool) => void;
  runDocumentTool: (tool?: DocumentTool) => void;
  openDocumentMarkupTool: (tool: "page-numbers" | "header" | "footer" | "bates") => void;
  onSelectLocalFile: (event: ChangeEvent<HTMLInputElement>) => void;
  showFindBar: boolean;
  onToggleFindBar: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  showDashboard: boolean;
  setShowDashboard: (show: boolean) => void;
  onOpenAiEditorWindow?: () => void;
  savePdf: () => void;
  savePdfAs: () => void;
  saveState: "idle" | "saving" | "saved";

  // NEW TABS TYPES
  tabs: OpdfTab[];
  activeTabId: string | null;
  activeGroupFilter: string | null;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  addTabToGroup: (tabId: string, groupName: string, color?: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  renameTabGroup: (oldName: string, newName: string) => void;
  changeTabGroupColor: (groupName: string, color: string) => void;
  closeTabGroup: (groupName: string) => void;
  ungroupGroup: (groupName: string) => void;
}) {
  const bridgeCapabilities = useOpdfBridge().capabilities;
  return (
    <header className="z-10 flex flex-col border-b border-[var(--border-color)] bg-[var(--bg-toolbar)] shadow-sm">
      <div className="flex h-9 items-center gap-[var(--ui-gap-xs)] border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[var(--ui-pad-sm)]">
        <div className="inline-flex select-none items-center gap-[var(--ui-gap-sm)] px-[10px] pl-[var(--ui-gap-sm)] text-[14px] font-bold tracking-[-0.3px] text-[#e03e2d]">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#e03e2d"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" /><path fill="white" d="M14 2v6h6" /><text x="5" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text></svg>
          <span className="text-[var(--ui-font-sm)] font-bold">Opdf</span>
        </div>
        <button
          className="ml-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[var(--icon-color)] transition-colors hover:bg-[var(--ui-hover-bg)]"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark Mode (Ctrl+Shift+L)" : "Switch to Light Mode (Ctrl+Shift+L)"}
          type="button"
        >
          {theme === "light" ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m0-12.728.707.707m11.314 11.314.707.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9 9.75 9.75 0 0 0-6.74-9.26 1 1 0 0 0-1.17 1.45 6.75 6.75 0 1 1-8.24 8.24 1 1 0 0 0-1.45 1.17A9.75 9.75 0 0 0 12 3z"/></svg>
          )}
        </button>
        <div className="mx-1 h-4 w-px bg-[var(--border-color)]" />
        <MenuDropdown label="File" items={fileMenuItems} isOpen={openMenu === "File"} onToggle={() => toggleMenu("File")} onClose={closeMenu} />
        <MenuDropdown label="Edit" items={editMenuItems} isOpen={openMenu === "Edit"} onToggle={() => toggleMenu("Edit")} onClose={closeMenu} />
        <MenuDropdown label="View" items={viewMenuItems} isOpen={openMenu === "View"} onToggle={() => toggleMenu("View")} onClose={closeMenu} />
        <MenuDropdown label="Tools" items={toolsMenuItems} isOpen={openMenu === "Tools"} onToggle={() => toggleMenu("Tools")} onClose={closeMenu} />
        {(() => {
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

          return (
            <>
              <button
                className={`px-3 py-1.5 rounded-md text-[var(--ui-font-sm)] font-semibold transition-all ${
                  isPublic
                    ? "border border-dashed border-gray-300 text-gray-400 bg-gray-50/50 opacity-60 cursor-not-allowed"
                    : showDashboard
                    ? "border border-red-500 text-red-500 bg-red-500/10 cursor-pointer"
                    : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--ui-hover-bg)] cursor-pointer"
                }`}
                onClick={isPublic ? () => toast.info("Tính năng này chỉ khả dụng trên phiên bản Local hoặc Desktop App.") : () => setShowDashboard(!showDashboard)}
                title={isPublic ? "Feature locked in public view" : "All Tools Dashboard"}
                type="button"
              >
                {isPublic ? "🔒 All Tools Dashboard" : "All Tools Dashboard"}
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-[var(--ui-font-sm)] font-semibold transition-all ${
                  isPublic
                    ? "border border-dashed border-gray-300 text-gray-400 bg-gray-50/50 opacity-60 cursor-not-allowed"
                    : "border border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100 cursor-pointer"
                }`}
                onClick={isPublic ? () => toast.info("Tính năng này chỉ khả dụng trên phiên bản Local hoặc Desktop App.") : onOpenAiEditorWindow}
                title={isPublic ? "Feature locked in public view" : getEditorLaunchTitle()}
                type="button"
              >
                {isPublic ? `🔒 ${getEditorLaunchTitle()}` : getEditorLaunchTitle()}
              </button>
            </>
          );
        })()}
        <div className="mx-1 h-4 w-px bg-[var(--border-color)]" />
        {!hasDesktopBridge ? (
          <input ref={fileInputRef} className="hidden-file-input" type="file" accept="application/pdf" onClick={(e) => { e.currentTarget.value = ""; }} onChange={onSelectLocalFile} />
        ) : null}
        <button className="inline-flex cursor-pointer items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] px-2.5 py-1.5 text-[var(--ui-font-sm)] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--ui-hover-bg)]" onClick={openFile} title="Open PDF" type="button">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2z" /></svg>
          Open
        </button>
        {hasDocument && (
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${saveState === "saving" ? "bg-amber-100 text-amber-700" : saveState === "saved" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Unsaved"}
          </span>
        )}
      </div>

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        activeGroupFilter={activeGroupFilter}
        switchTab={switchTab}
        closeTab={closeTab}
        addTabToGroup={addTabToGroup}
        removeTabFromGroup={removeTabFromGroup}
        renameTabGroup={renameTabGroup}
        changeTabGroupColor={changeTabGroupColor}
        closeTabGroup={closeTabGroup}
        ungroupGroup={ungroupGroup}
        openFile={openFile}
        showItemInFolder={hasDesktopBridge ? (filePath) => window.opdf?.showItemInFolder?.(filePath) : undefined}
      />


      <div className="flex flex-wrap items-stretch gap-[var(--ui-pad-md)] px-[var(--ui-pad-lg)] py-[var(--ui-pad-sm)] bg-[var(--ui-muted-bg)] border-t border-[var(--border-color)]">
        <FileViewGroup
          openFile={openFile}
          hasDocument={hasDocument}
          savePdf={savePdf}
          savePdfAs={savePdfAs}
          exportPdf={exportPdf}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          viewMode={viewMode}
          setViewMode={setViewMode}
          showFindBar={showFindBar}
          onToggleFindBar={onToggleFindBar}
        />

        <NavigationZoomGroup
          hasDocument={hasDocument}
          goPrevPage={goPrevPage}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          goNextPage={goNextPage}
          zoomOut={zoomOut}
          resetZoom={resetZoom}
          scale={scale}
          zoomPreset={zoomPreset}
          applyZoomPreset={applyZoomPreset}
          zoomIn={zoomIn}
        />

        <AnnotationsHistoryGroup
          activeTool={activeTool}
          hasDocument={hasDocument}
          setActiveTool={setActiveTool}
          annotationToolDefaults={annotationToolDefaults}
          setAnnotationToolDefaults={setAnnotationToolDefaults}
          undoAnnotations={undoAnnotations}
          redoAnnotations={redoAnnotations}
        />

        <DocumentMarkupGroup
          hasDocument={hasDocument}
          runOcr={runOcr}
          openDocumentMarkupTool={openDocumentMarkupTool}
        />

        <FileUtilitiesGroup
          hasDocument={hasDocument}
          compressDocument={compressDocument}
          addWatermark={addWatermark}
          splitDocument={splitDocument}
          mergeDocuments={mergeDocuments}
          convertToImages={convertToImages}
          runDocumentTool={runDocumentTool}
          capabilities={bridgeCapabilities}
        />
      </div>
    </header>
  );
}
