import type { ChangeEvent, Ref } from "react";
import { MenuDropdown, type MenuItemDef } from "./MenuDropdown";
import { ToolIconButton } from "./ToolIconButton";
import type { ActiveTool, ViewMode, ZoomPreset } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";

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
  onSelectLocalFile,
  showFindBar,
  onToggleFindBar,
  theme,
  toggleTheme,
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
  runDocumentTool: () => void;
  onSelectLocalFile: (event: ChangeEvent<HTMLInputElement>) => void;
  showFindBar: boolean;
  onToggleFindBar: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}) {
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
        <div className="mx-1 h-4 w-px bg-[var(--border-color)]" />
        {!hasDesktopBridge ? (
          <input ref={fileInputRef} className="hidden-file-input" type="file" accept="application/pdf" onClick={(e) => { e.currentTarget.value = ""; }} onChange={onSelectLocalFile} />
        ) : null}
        <button className="inline-flex cursor-pointer items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] px-2.5 py-1.5 text-[var(--ui-font-sm)] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--ui-hover-bg)]" onClick={openFile} title="Open PDF" type="button">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2z" /></svg>
          Open
        </button>
        {hasDocument && fileName ? (
          <>
            <div className="mx-1 h-4 w-px bg-[var(--border-color)]" />
            <div className="relative top-px inline-flex max-w-[200px] items-center gap-[var(--ui-gap-md)] rounded-t-[var(--ui-radius-sm)] border border-b-0 border-[var(--border-color)] bg-[var(--bg-toolbar)] px-3 py-1.5 text-xs text-[var(--text-primary)]" title={fileName}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="#e03e2d"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" /></svg>
              <span className="truncate whitespace-nowrap">{fileName.split(/[/\\]/).pop()}</span>
              <button className="inline-flex h-4 w-4 items-center justify-center rounded-full p-0 text-[var(--text-secondary)] transition-colors hover:bg-[var(--ui-subtle-hover)] hover:text-black" onClick={closeDocument} title="Close" type="button">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-[var(--ui-pad-lg)] px-[var(--ui-pad-lg)] py-[var(--ui-pad-sm)]">
        <div className="flex flex-col items-center gap-0.5 border-r border-[var(--border-color)] pr-[var(--ui-pad-lg)]">
          <span className="mt-0.5 text-center text-[10px] uppercase tracking-[0.04em] text-[#888]">File</span>
          <div className="flex items-center gap-[var(--ui-gap-xs)]">
            <ToolIconButton label="Open PDF (Ctrl+O)" onClick={openFile}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2z" />
              </svg>
            </ToolIconButton>
            <ToolIconButton label="Save / Download (Ctrl+S)" disabled={!hasDocument} onClick={exportPdf}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </ToolIconButton>
            <div className="mx-1 h-4 w-px bg-[var(--border-color)]" />
            <ToolIconButton label="Select Tool" active={activeTool === "select"} onClick={() => setActiveTool("select")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m4 3 6 15 2-7 7-2z" />
              </svg>
            </ToolIconButton>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 border-r border-[var(--border-color)] pr-[var(--ui-pad-lg)]">
          <span className="mt-0.5 text-center text-[10px] uppercase tracking-[0.04em] text-[#888]">Comment</span>
          <div className="flex items-center gap-[var(--ui-gap-xs)]">
            <ToolIconButton label="Highlight" active={activeTool === "highlight"} disabled={!hasDocument} onClick={() => setActiveTool("highlight")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 5 4 4-9 9H6v-4z" /><path d="m12 8 4 4" /></svg></ToolIconButton>
            <ToolIconButton label="Add / Edit Text (T)" active={activeTool === "note"} disabled={!hasDocument} onClick={() => setActiveTool("note")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></ToolIconButton>
            <ToolIconButton label="Redact" active={activeTool === "redact"} disabled={!hasDocument} onClick={() => setActiveTool("redact")}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" /></svg></ToolIconButton>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 border-r border-[var(--border-color)] pr-[var(--ui-pad-lg)]">
          <span className="mt-0.5 text-center text-[10px] uppercase tracking-[0.04em] text-[#888]">Navigate</span>
          <div className="flex items-center gap-[var(--ui-gap-xs)]">
            <ToolIconButton label="Previous Page" disabled={!hasDocument} onClick={goPrevPage}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg></ToolIconButton>
            <input className="h-7 w-10 rounded-[var(--ui-radius-sm)] border border-[var(--border-color)] p-1 text-center text-[var(--ui-font-sm)]" value={page} onChange={(e) => { const next = Number(e.target.value || 1); if (Number.isFinite(next)) setPage(Math.min(Math.max(1, next), Math.max(1, totalPages))); }} />
            <span className="ml-[var(--ui-gap-xs)] text-[var(--ui-font-sm)] text-[var(--text-secondary)]">of {Math.max(totalPages, 1)}</span>
            <ToolIconButton label="Next Page" disabled={!hasDocument || (totalPages > 0 && page >= totalPages)} onClick={goNextPage}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></ToolIconButton>
            <ToolIconButton label="Zoom Out" disabled={!hasDocument} onClick={zoomOut}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /></svg></ToolIconButton>
            <button className="h-8 min-w-[50px] cursor-pointer rounded-[var(--ui-radius-sm)] border border-transparent bg-transparent text-[var(--ui-font-sm)] text-[var(--text-primary)] transition-colors hover:bg-[var(--ui-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45" disabled={!hasDocument} onClick={resetZoom} title="Reset Zoom" aria-label="Reset Zoom" type="button">{Math.round(scale * 100)}%</button>
            <select className="h-8 rounded-[var(--ui-radius-sm)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-[var(--ui-pad-sm)] text-[var(--ui-font-sm)] text-[var(--text-primary)]" value={zoomPreset} onChange={(e) => applyZoomPreset(e.target.value as ZoomPreset)} disabled={!hasDocument}>
              <option value="actual">Actual size</option>
              <option value="fit-width">Fit width</option>
              <option value="fit-page">Fit page</option>
            </select>
            <ToolIconButton label="Zoom In" disabled={!hasDocument} onClick={zoomIn}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6M8 11h6" /></svg></ToolIconButton>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 border-r border-[var(--border-color)] pr-[var(--ui-pad-lg)]">
          <span className="mt-0.5 text-center text-[10px] uppercase tracking-[0.04em] text-[#888]">Annotate</span>
          <div className="flex items-center gap-[var(--ui-gap-xs)]">
            <input className="w-40 rounded-[var(--ui-radius-sm)] border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-1.5 text-[var(--ui-font-sm)] text-[var(--text-primary)] transition-all focus:bg-[var(--bg-toolbar)] focus:outline-none" placeholder="Find text" value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} />
              <ToolIconButton
                label="Find (Ctrl+F)"
                active={showFindBar}
                onClick={onToggleFindBar}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              </ToolIconButton>
            <ToolIconButton label={viewMode === "continuous" ? "Continuous Scroll" : "Single Page"} onClick={() => setViewMode(viewMode === "continuous" ? "page" : "continuous")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12v4H6zM6 10h12v4H6zM6 16h12v4H6z" /></svg></ToolIconButton>
            <ToolIconButton label="Rectangle" active={activeTool === "shape"} disabled={!hasDocument} onClick={() => setActiveTool("shape")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" /></svg></ToolIconButton>
            <ToolIconButton label="Signature (S)" active={activeTool === "signature"} disabled={!hasDocument} onClick={() => setActiveTool("signature")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h16" /><path d="m6 16 8-8 3 3-8 8H6z" /></svg></ToolIconButton>
            <ToolIconButton label="Measure Tool (M)" active={activeTool === "measure"} disabled={!hasDocument} onClick={() => setActiveTool("measure")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.3 4.7a1 1 0 0 0-1.4 0L4.7 19.9a1 1 0 0 0 1.4 1.4L21.3 6.1a1 1 0 0 0 0-1.4z"/><path d="M15 6l2.5 2.5M12 9l2.5 2.5M9 12l2.5 2.5M6 15l2.5 2.5"/></svg></ToolIconButton>
            <ToolIconButton label="Undo" disabled={!hasDocument} onClick={undoAnnotations}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5" /><path d="M20 20a8 8 0 0 0-8-8H4" /></svg></ToolIconButton>
            <ToolIconButton label="Redo" disabled={!hasDocument} onClick={redoAnnotations}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5" /><path d="M4 20a8 8 0 0 1 8-8h8" /></svg></ToolIconButton>
            <ToolIconButton label="Run OCR" disabled={!hasDocument} onClick={runOcr}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h6M7 16h4" /></svg></ToolIconButton>
            <ToolIconButton label="Rotate Left" disabled={!hasDocument} onClick={rotateLeft}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8V3h5" /><path d="M3 3a9 9 0 1 0 3 13" /></svg></ToolIconButton>
            <ToolIconButton label="Rotate Right" disabled={!hasDocument} onClick={rotateRight}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V3h-5" /><path d="M21 3a9 9 0 1 1-3 13" /></svg></ToolIconButton>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 pr-[var(--ui-pad-lg)]">
          <span className="mt-0.5 text-center text-[10px] uppercase tracking-[0.04em] text-[#888]">Advanced</span>
          <div className="flex items-center gap-[var(--ui-gap-xs)]">
            <ToolIconButton label="Compress" disabled={!hasDocument} onClick={compressDocument}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 11-2-2-2 2M12 9v8M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg></ToolIconButton>
            <ToolIconButton label="Watermark" disabled={!hasDocument} onClick={addWatermark}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></ToolIconButton>
            <ToolIconButton label="Split" disabled={!hasDocument} onClick={splitDocument}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M4 6h16M4 18h16" /></svg></ToolIconButton>
            <ToolIconButton label="Merge" onClick={mergeDocuments}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg></ToolIconButton>
            <ToolIconButton label="To Images" disabled={!hasDocument} onClick={convertToImages}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></ToolIconButton>
            <select className="h-8 rounded-[var(--ui-radius-sm)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-[var(--ui-pad-sm)] text-[var(--ui-font-sm)] text-[var(--text-primary)]" value={documentTool} onChange={(e) => setDocumentTool(e.target.value as DocumentTool)} disabled={!hasDocument} aria-label="Document tool">
              <option value="delete-pages">Delete pages</option><option value="insert-pdf">Insert PDF</option><option value="crop-current">Crop page</option><option value="page-numbers">Page numbers</option><option value="header">Header</option><option value="footer">Footer</option><option value="bates">Bates</option><option value="encrypt">Encrypt</option><option value="decrypt">Decrypt</option><option value="normalize">PDF/A</option><option value="rotate-all-left">Rotate all left</option><option value="rotate-all-right">Rotate all right</option>
            </select>
            <ToolIconButton label="Run Document Tool" disabled={!hasDocument} onClick={runDocumentTool}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></ToolIconButton>
          </div>
        </div>
      </div>
    </header>
  );
}
