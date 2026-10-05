import type { ChangeEvent, Ref } from "react";
import { MenuDropdown, type MenuItemDef } from "./MenuDropdown";
import type { ActiveTool } from "../lib/app-types";
import { TabBar } from "./TabBar";
import type { OpdfTab } from "../lib/web-storage";
import { getEditorLaunchTitle } from "../lib/documentEditingExperience";
import { useOpdfBridge } from "../hooks/useOpdfBridge";
import { toast } from "./ToastProvider";
import { AiSparkIcon } from "./AiSparkIcon";
import { redoNativeContentEdit, undoNativeContentEdit } from "../lib/nativeContentHistory";

export function AppHeader({
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
  savePdf,
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
  savePdf: () => void;
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
  const compactToolsMenuItems: MenuItemDef[] = [
    {
      kind: "action",
      label: showDashboard ? "Back to Document" : "All Tools...",
      onClick: () => setShowDashboard(!showDashboard),
    },
    { kind: "separator" },
    { kind: "section", label: "Pages" },
    { kind: "action", label: "Insert PDF...", disabled: !hasDocument, onClick: () => runDocumentTool("insert-pdf") },
    { kind: "action", label: "Split PDF...", disabled: !hasDocument, onClick: splitDocument },
    { kind: "action", label: "Merge PDFs...", onClick: mergeDocuments },
    { kind: "section", label: "Document" },
    { kind: "action", label: "Run OCR", disabled: !hasDocument, onClick: runOcr },
    { kind: "action", label: "Page Numbers...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("page-numbers") },
    { kind: "action", label: "Header...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("header") },
    { kind: "action", label: "Footer...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("footer") },
    { kind: "action", label: "Bates Numbering...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("bates") },
    { kind: "action", label: "Watermark...", disabled: !hasDocument, onClick: addWatermark },
    { kind: "section", label: "Convert" },
    { kind: "action", label: "Compress PDF", disabled: !hasDocument, onClick: compressDocument },
    { kind: "action", label: "Convert to Images", disabled: !hasDocument, onClick: convertToImages },
    { kind: "section", label: "Edit PDF" },
    { kind: "action", label: "Edit PDF Content", disabled: !hasDocument, onClick: () => setActiveTool("edit-content") },
    { kind: "section", label: "Review & Security" },
    { kind: "action", label: "Measure Drawing", disabled: !hasDocument, onClick: () => setActiveTool("measure") },
    { kind: "action", label: "Compare Revisions...", disabled: !hasDocument, onClick: compareRevisions },
    { kind: "action", label: "Search & Secure Redact...", disabled: !hasDocument, onClick: searchRedact },
    { kind: "action", label: "Digital Sign...", disabled: !hasDocument || !hasDesktopBridge || bridgeCapabilities?.digitalSignature === false, title: !hasDesktopBridge ? "Available in the Desktop App only" : undefined, onClick: digitalSign },
    { kind: "section", label: "Advanced" },
    { kind: "action", label: "Advanced PDF...", disabled: !hasDocument, onClick: advancedPdf },
  ];
  const effectiveEditMenuItems = activeTool === "edit-content"
    ? editMenuItems.map((item) =>
        item.kind === "action" && item.label === "Undo"
          ? { ...item, disabled: false, onClick: () => { void undoNativeContentEdit(); } }
          : item.kind === "action" && item.label === "Redo"
            ? { ...item, disabled: false, onClick: () => { void redoNativeContentEdit(); } }
            : item,
      )
    : editMenuItems;

  const mobileMenuItems: MenuItemDef[] = [
    { kind: "section", label: "File" },
    ...fileMenuItems,
    { kind: "separator" },
    { kind: "section", label: "Edit" },
    ...effectiveEditMenuItems,
    { kind: "separator" },
    { kind: "section", label: "View" },
    ...viewMenuItems,
    { kind: "separator" },
    { kind: "section", label: "Tools" },
    ...compactToolsMenuItems,
  ];


  return (
    <header data-opdf-region="app-header" className="flex flex-col border-b border-[var(--border-color)] bg-[var(--bg-toolbar)] shadow-sm" style={{ zIndex: "var(--z-dropdown)" }}>
      <div className="flex h-9 items-center gap-[var(--ui-gap-xs)] overflow-visible whitespace-nowrap border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[var(--ui-pad-sm)]">
        <div className="inline-flex select-none items-center gap-[var(--ui-gap-sm)] px-[10px] pl-[var(--ui-gap-sm)] text-[14px] font-bold tracking-[-0.3px] text-[#e03e2d]">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#e03e2d"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" /><path fill="white" d="M14 2v6h6" /><text x="5" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text></svg>
          <span className="text-[var(--ui-font-sm)] font-bold">Opdf</span>
        </div>
        <button
          className="ml-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[var(--icon-color)] transition-colors hover:bg-[var(--ui-hover-bg)]"
          data-opdf-action="toggle-theme"
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
        <div className="opdf-mobile-menu">
          <MenuDropdown label="☰" items={mobileMenuItems} isOpen={openMenu === "Mobile"} onToggle={() => toggleMenu("Mobile")} onClose={closeMenu} />
        </div>
        <div className="opdf-desktop-menus">
          <MenuDropdown label="File" items={fileMenuItems} isOpen={openMenu === "File"} onToggle={() => toggleMenu("File")} onClose={closeMenu} />
          <MenuDropdown label="Edit" items={effectiveEditMenuItems} isOpen={openMenu === "Edit"} onToggle={() => toggleMenu("Edit")} onClose={closeMenu} />
          <MenuDropdown label="View" items={viewMenuItems} isOpen={openMenu === "View"} onToggle={() => toggleMenu("View")} onClose={closeMenu} />
          <MenuDropdown label="Tools" items={compactToolsMenuItems} isOpen={openMenu === "Tools"} onToggle={() => toggleMenu("Tools")} onClose={closeMenu} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          {hasDocument ? (
            <>
              <button data-opdf-action="save" className="top-menu-btn" type="button" title="Save (Ctrl+S)" onClick={savePdf}>Save</button>
              <button data-opdf-action="edit-content" className="top-menu-btn" type="button" title="Edit PDF Content" onClick={() => setActiveTool("edit-content")}>Edit PDF</button>
              <button data-opdf-action="undo" className="top-menu-btn" type="button" title="Undo (Ctrl+Z)" onClick={activeTool === "edit-content" ? () => { void undoNativeContentEdit(); } : undoAnnotations}>Undo</button>
              <button data-opdf-action="redo" className="top-menu-btn" type="button" title="Redo (Ctrl+Y)" onClick={activeTool === "edit-content" ? () => { void redoNativeContentEdit(); } : redoAnnotations}>Redo</button>
            </>
          ) : null}
          <button
            data-opdf-action="ai-edit"
            className="top-menu-btn"
            onClick={isPublic ? () => toast.info("This feature is only available in the Local or Desktop App.") : onOpenAiEditorWindow}
            title={isPublic ? "Available in Local/Desktop only" : getEditorLaunchTitle()}
            type="button"
          >
            <span className="inline-flex items-center gap-1.5"><AiSparkIcon size={14} />AI Edit</span>
          </button>
        </div>
        <div className="mx-1 h-4 w-px bg-[var(--border-color)]" />
        {!hasDesktopBridge ? (
          <input ref={fileInputRef} className="hidden-file-input" type="file" accept="application/pdf" onClick={(e) => { e.currentTarget.value = ""; }} onChange={onSelectLocalFile} />
        ) : null}
        <button data-opdf-action="open-pdf" className="inline-flex cursor-pointer items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] px-2.5 py-1.5 text-[var(--ui-font-sm)] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--ui-hover-bg)]" onClick={openFile} title="Open PDF" type="button">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2z" /></svg>
          Open
        </button>
        {hasDocument && (
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${saveState === "saving" ? "bg-amber-100 text-amber-700" : saveState === "saved" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Unsaved"}
          </span>
        )}
      </div>

      {tabs.length > 0 ? <TabBar
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
      /> : null}
    </header>
  );
}
