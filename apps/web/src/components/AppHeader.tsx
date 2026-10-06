import type { ChangeEvent, Ref } from "react";
import type { ActiveTool } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { OpdfTab } from "../lib/web-storage";
import { getEditorLaunchTitle } from "../lib/documentEditingExperience";
import { redoNativeContentEdit, undoNativeContentEdit } from "../lib/nativeContentHistory";
import { useOpdfBridge } from "../hooks/useOpdfBridge";
import { AiSparkIcon } from "./AiSparkIcon";
import { SaveControl, RedoButton, UndoButton } from "./AppHeaderControls";
import {
  buildCompactToolsMenuItems,
  buildGlobalMenuItems,
} from "./appHeaderMenuItems";
import { MenuDropdown, type MenuItemDef } from "./MenuDropdown";
import { TabBar } from "./TabBar";
import { toast } from "./ToastProvider";

type AppHeaderProps = {
  fileInputRef: Ref<HTMLInputElement>;
  hasDesktopBridge: boolean;
  isPublic: boolean;
  hasDocument: boolean;
  openFile: () => void;
  fileMenuItems: MenuItemDef[];
  editMenuItems: MenuItemDef[];
  viewMenuItems: MenuItemDef[];
  openMenu: string | null;
  toggleMenu: (label: string) => void;
  closeMenu: () => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  undoAnnotations: () => void;
  redoAnnotations: () => void;
  runOcr: () => void;
  compressDocument: () => void;
  addWatermark: () => void;
  splitDocument: () => void;
  mergeDocuments: () => void;
  convertToImages: () => void;
  compareRevisions: () => void;
  searchRedact: () => void;
  advancedPdf: () => void;
  digitalSign: () => void;
  runDocumentTool: (tool?: DocumentTool) => void;
  openDocumentMarkupTool: (tool: "page-numbers" | "header" | "footer" | "bates") => void;
  onSelectLocalFile: (event: ChangeEvent<HTMLInputElement>) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  showDashboard: boolean;
  setShowDashboard: (show: boolean) => void;
  onOpenAiEditorWindow?: () => void;
  onGoHome: () => void;
  savePdf: () => void;
  saveState: "idle" | "saving" | "saved";
  autosaveEnabled: boolean;
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
};

export function AppHeader(props: AppHeaderProps) {
  const {
    fileInputRef,
    hasDesktopBridge,
    isPublic,
    hasDocument,
    openFile,
    fileMenuItems,
    editMenuItems,
    viewMenuItems,
    openMenu,
    toggleMenu,
    closeMenu,
    activeTool,
    setActiveTool,
    undoAnnotations,
    redoAnnotations,
    runOcr,
    compressDocument,
    addWatermark,
    splitDocument,
    mergeDocuments,
    convertToImages,
    compareRevisions,
    searchRedact,
    advancedPdf,
    digitalSign,
    runDocumentTool,
    openDocumentMarkupTool,
    onSelectLocalFile,
    theme,
    toggleTheme,
    showDashboard,
    setShowDashboard,
    onOpenAiEditorWindow,
    onGoHome,
    savePdf,
    saveState,
    autosaveEnabled,
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
  } = props;

  const bridgeCapabilities = useOpdfBridge().capabilities;
  const effectiveEditMenuItems = activeTool === "edit-content"
    ? editMenuItems.map((item) =>
        item.kind === "action" && item.label === "Undo"
          ? { ...item, disabled: false, onClick: () => { void undoNativeContentEdit(); } }
          : item.kind === "action" && item.label === "Redo"
            ? { ...item, disabled: false, onClick: () => { void redoNativeContentEdit(); } }
            : item,
      )
    : editMenuItems;

  const compactToolsMenuItems = buildCompactToolsMenuItems({
    hasDocument,
    hasDesktopBridge,
    capabilities: bridgeCapabilities,
    showDashboard,
    setShowDashboard,
    setActiveTool,
    runOcr,
    compressDocument,
    addWatermark,
    splitDocument,
    mergeDocuments,
    convertToImages,
    compareRevisions,
    searchRedact,
    advancedPdf,
    digitalSign,
    runDocumentTool,
    openDocumentMarkupTool,
  });

  const aiEdit = isPublic
    ? () => toast.info("This feature is only available in the Local or Desktop App.")
    : () => onOpenAiEditorWindow?.();

  const globalMenuItems = buildGlobalMenuItems({
    fileMenuItems,
    editMenuItems: effectiveEditMenuItems,
    viewMenuItems,
    toolsMenuItems: compactToolsMenuItems,
    aiEdit,
  });

  const undo = activeTool === "edit-content"
    ? () => { void undoNativeContentEdit(); }
    : undoAnnotations;
  const redo = activeTool === "edit-content"
    ? () => { void redoNativeContentEdit(); }
    : redoAnnotations;

  return (
    <header
      data-opdf-region="app-header"
      className="opdf-app-header border-b border-[var(--border-color)] bg-[var(--bg-toolbar)] shadow-sm"
      style={{ zIndex: "var(--z-dropdown)" }}
    >
      <div className="opdf-topbar">
        <button
          className="opdf-brand-home"
          type="button"
          onClick={onGoHome}
          title="Home"
          aria-label="Go to OPDF Home"
          data-opdf-action="home"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#e03e2d" aria-hidden="true">
            <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" />
            <path fill="white" d="M14 2v6h6" />
            <text x="5" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
          </svg>
          <span>Opdf</span>
        </button>

        <div className="opdf-mobile-menu">
          <MenuDropdown
            label="⋯"
            items={globalMenuItems}
            isOpen={openMenu === "Application"}
            onToggle={() => toggleMenu("Application")}
            onClose={closeMenu}
            mobileSheet
            triggerTitle="Application menu"
          />
        </div>
        <div className="opdf-desktop-menus">
          <MenuDropdown
            label="⋯"
            items={globalMenuItems}
            isOpen={openMenu === "Application"}
            onToggle={() => toggleMenu("Application")}
            onClose={closeMenu}
            triggerTitle="Application menu"
          />
        </div>

        <button
          className="opdf-theme-btn"
          data-opdf-action="toggle-theme"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark Mode (Ctrl+Shift+L)" : "Switch to Light Mode (Ctrl+Shift+L)"}
          type="button"
        >
          {theme === "light" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m0-12.728.707.707m11.314 11.314.707.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 9.75 9.75 0 0 0-6.74-9.26 1 1 0 0 0-1.17 1.45 6.75 6.75 0 1 1-8.24 8.24 1 1 0 0 0-1.45 1.17A9.75 9.75 0 0 0 12 3z"/></svg>
          )}
        </button>

        <div className="opdf-header-tabs">
          {tabs.length > 0 ? (
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
          ) : <div className="opdf-header-tabs-empty" />}
        </div>

        <div className="opdf-header-actions">
          {hasDocument ? (
            <>
              <UndoButton onClick={undo} />
              <RedoButton onClick={redo} />
              <SaveControl saveState={saveState} onSave={savePdf} autosaveEnabled={autosaveEnabled} />
              <button
                data-opdf-action="edit-content"
                className="top-menu-btn"
                type="button"
                title="Edit PDF Content"
                onClick={() => setActiveTool("edit-content")}
              >
                Edit PDF
              </button>
            </>
          ) : null}
          <button
            data-opdf-action="ai-edit"
            className="top-menu-btn"
            onClick={aiEdit}
            title={isPublic ? "Available in Local/Desktop only" : getEditorLaunchTitle()}
            type="button"
          >
            <span className="inline-flex items-center gap-1.5"><AiSparkIcon size={14} />AI Edit</span>
          </button>
          {!hasDesktopBridge ? (
            <input
              ref={fileInputRef}
              className="hidden-file-input"
              type="file"
              accept="application/pdf"
              onClick={(event) => { event.currentTarget.value = ""; }}
              onChange={onSelectLocalFile}
            />
          ) : null}
          <button
            data-opdf-action="open-pdf"
            className="opdf-open-btn"
            onClick={openFile}
            title="Open PDF"
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2z" /></svg>
            <span>Open</span>
          </button>
        </div>
      </div>
    </header>
  );
}
