import type { ChangeEvent, Ref } from "react";
import type { ActiveTool } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { TpdfTab } from "../lib/web-storage";
import { getEditorLaunchTitle } from "../lib/documentEditingExperience";
import { redoNativeContentEdit, undoNativeContentEdit } from "../lib/nativeContentHistory";
import { useTpdfBridge } from "../hooks/useTpdfBridge";
import { AiSparkIcon } from "./AiSparkIcon";
import { TpdfIcon } from "./TpdfIcon";
import { SaveControl, RedoButton, UndoButton, MobileSaveButton } from "./AppHeaderControls";
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
  autosaveStatus: "idle" | "offline" | "retrying";
  tabs: TpdfTab[];
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
  onOpenTabSwitcher?: () => void;
};

export function AppHeader(props: AppHeaderProps) {
  const {
    fileInputRef, hasDesktopBridge, isPublic, hasDocument, openFile,
    fileMenuItems, editMenuItems, viewMenuItems, openMenu, toggleMenu, closeMenu,
    activeTool, setActiveTool, undoAnnotations, redoAnnotations, runOcr,
    compressDocument, addWatermark, splitDocument, mergeDocuments, convertToImages,
    compareRevisions, searchRedact, advancedPdf, digitalSign, runDocumentTool,
    openDocumentMarkupTool, onSelectLocalFile, theme, toggleTheme,
    showDashboard, setShowDashboard, onOpenAiEditorWindow, onGoHome,
    savePdf, saveState, autosaveEnabled, autosaveStatus,
    tabs, activeTabId, activeGroupFilter, switchTab, closeTab,
    addTabToGroup, removeTabFromGroup, renameTabGroup,
    changeTabGroupColor, closeTabGroup, ungroupGroup, onOpenTabSwitcher,
  } = props;
  const bridgeCapabilities = useTpdfBridge().capabilities;
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
      data-tpdf-region="app-header"
      className="tpdf-app-header border-b border-[var(--border-color)] bg-[var(--bg-toolbar)] shadow-sm"
      style={{ zIndex: "var(--z-dropdown)" }}
    >
      <div className="tpdf-topbar">
        <button
          className="tpdf-brand-home"
          type="button"
          onClick={onGoHome}
          title="Home"
          aria-label="Go to TPDF Home"
          data-tpdf-action="home"
        >
          <TpdfIcon name="file-pdf" size={18} strokeWidth={1.9} />
          <span>Tpdf</span>
        </button>

        <div className="tpdf-mobile-menu">
          <MenuDropdown
            label="⋯"
            triggerIcon="more-horizontal"
            items={globalMenuItems}
            isOpen={openMenu === "ApplicationMobile"}
            onToggle={() => toggleMenu("ApplicationMobile")}
            onClose={closeMenu}
            mobileSheet
            triggerTitle="Application menu"
          />
        </div>
        <div className="tpdf-desktop-menus">
          <MenuDropdown
            label="⋯"
            triggerIcon="more-horizontal"
            items={globalMenuItems}
            isOpen={openMenu === "ApplicationDesktop"}
            onToggle={() => toggleMenu("ApplicationDesktop")}
            onClose={closeMenu}
            triggerTitle="Application menu"
          />
        </div>

        <button
          className="tpdf-theme-btn"
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          data-tpdf-action="toggle-theme"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark Mode (Ctrl+Shift+L)" : "Switch to Light Mode (Ctrl+Shift+L)"}
          type="button"
        >
          {theme === "light" ? <TpdfIcon name="sun" size={18} /> : <TpdfIcon name="moon" size={18} />}
        </button>

        <button
          type="button"
          className="tpdf-mobile-tab-btn"
          data-tpdf-action="open-tab-switcher"
          onClick={onOpenTabSwitcher}
          title={`Tabs (${tabs.length})`}
          aria-label={`Open tabs overview (${tabs.length} tabs)`}
        >
          <span className="tpdf-mobile-tab-count">{tabs.length}</span>
        </button>

        <div className="tpdf-header-tabs">
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
              showItemInFolder={hasDesktopBridge ? (filePath) => window.tpdf?.showItemInFolder?.(filePath) : undefined}
            />
          ) : <div className="tpdf-header-tabs-empty" />}
        </div>

        <div className="tpdf-header-actions">
          <button type="button" data-tpdf-action="search-commands" className="tpdf-header-icon-btn tpdf-palette-trigger" title="Search commands (Ctrl/⌘ K)" aria-label="Search commands" onClick={() => window.dispatchEvent(new Event("tpdf:open-command-palette"))}><TpdfIcon name="search" size={18} /></button>
          {hasDocument ? (
            <>
                <MobileSaveButton onSave={savePdf} saving={saveState === "saving"} />
              <UndoButton onClick={undo} />
              <RedoButton onClick={redo} />
              <SaveControl saveState={saveState} onSave={savePdf} autosaveEnabled={autosaveEnabled} autosaveStatus={autosaveStatus} />
              <button
                data-tpdf-action="edit-content"
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
            data-tpdf-action="ai-edit"
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
              id="tpdf-header-pdf-picker"
              aria-label="Choose PDF file to open"
              className="hidden-file-input"
              type="file"
              accept="application/pdf"
              onClick={(event) => { event.currentTarget.value = ""; }}
              onChange={onSelectLocalFile}
            />
          ) : null}
          <button
            data-tpdf-action="open-pdf"
            aria-controls={!hasDesktopBridge ? "tpdf-header-pdf-picker" : undefined}
            aria-label="Open PDF document"
            className="tpdf-open-btn"
            onClick={openFile}
            title="Open PDF"
            type="button"
          >
            <TpdfIcon name="folder-open" size={18} />
            <span>Open</span>
          </button>
        </div>
      </div>
    </header>
  );
}
