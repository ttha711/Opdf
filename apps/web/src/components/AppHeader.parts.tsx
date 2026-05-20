import { ToolIconButton } from "./ToolIconButton";
import type { ActiveTool, ViewMode, ZoomPreset } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";

// --- FILE & VIEW GROUP ---
interface FileViewGroupProps {
  openFile: () => void;
  hasDocument: boolean;
  exportPdf: () => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showFindBar: boolean;
  onToggleFindBar: () => void;
}

export function FileViewGroup({
  openFile,
  hasDocument,
  exportPdf,
  activeTool,
  setActiveTool,
  viewMode,
  setViewMode,
  showFindBar,
  onToggleFindBar,
}: FileViewGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--ui-radius-md)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-[var(--ui-pad-sm)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)] opacity-70">File & View</span>
      <div className="flex flex-1 items-center gap-[var(--ui-gap-xs)]">
        <ToolIconButton label="Open PDF (Ctrl+O)" onClick={openFile}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Save / Download (Ctrl+S)" disabled={!hasDocument} onClick={exportPdf}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </ToolIconButton>
        <div className="mx-0.5 h-4 w-px bg-[var(--border-color)]" />
        <ToolIconButton label="Select Tool" active={activeTool === "select"} onClick={() => setActiveTool("select")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 4 7.07 16.97 2.83-7.07 7.07-2.83z" />
            <line x1="12.5" y1="12.5" x2="20" y2="20" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label={viewMode === "continuous" ? "Continuous Scroll" : "Single Page"} onClick={() => setViewMode(viewMode === "continuous" ? "page" : "continuous")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="3" width="14" height="7" rx="1" />
            <rect x="5" y="14" width="14" height="7" rx="1" />
            <path d="M12 10v4" strokeDasharray="2 2" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Find Text (Ctrl+F)" active={showFindBar} onClick={onToggleFindBar}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="6" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </ToolIconButton>
      </div>
    </div>
  );
}

// --- NAVIGATION & ZOOM GROUP ---
interface NavigationZoomGroupProps {
  hasDocument: boolean;
  goPrevPage: () => void;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  goNextPage: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  scale: number;
  zoomPreset: ZoomPreset;
  applyZoomPreset: (preset: ZoomPreset) => void;
  zoomIn: () => void;
}

export function NavigationZoomGroup({
  hasDocument,
  goPrevPage,
  page,
  setPage,
  totalPages,
  goNextPage,
  zoomOut,
  resetZoom,
  scale,
  zoomPreset,
  applyZoomPreset,
  zoomIn,
}: NavigationZoomGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--ui-radius-md)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-[var(--ui-pad-sm)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)] opacity-70">Navigation & Zoom</span>
      <div className="flex flex-1 items-center gap-[var(--ui-gap-xs)]">
        <ToolIconButton label="Previous Page" disabled={!hasDocument} onClick={goPrevPage}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </ToolIconButton>
        <div className="flex items-center gap-1">
          <input 
            className="h-7 w-10 rounded-[var(--ui-radius-sm)] border border-[var(--border-color)] p-1 text-center text-[var(--ui-font-sm)] bg-[var(--ui-muted-bg)] text-[var(--text-primary)]" 
            value={page} 
            onChange={(e) => { const next = Number(e.target.value || 1); if (Number.isFinite(next)) setPage(Math.min(Math.max(1, next), Math.max(1, totalPages))); }} 
          />
          <span className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] whitespace-nowrap">of {Math.max(totalPages, 1)}</span>
        </div>
        <ToolIconButton label="Next Page" disabled={!hasDocument || (totalPages > 0 && page >= totalPages)} onClick={goNextPage}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </ToolIconButton>
        <div className="mx-0.5 h-4 w-px bg-[var(--border-color)]" />
        <ToolIconButton label="Zoom Out" disabled={!hasDocument} onClick={zoomOut}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="6" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </ToolIconButton>
        <button 
          className="h-8 min-w-[50px] cursor-pointer rounded-[var(--ui-radius-sm)] border border-transparent bg-transparent text-[var(--ui-font-sm)] text-[var(--text-primary)] transition-colors hover:bg-[var(--ui-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45 font-semibold" 
          disabled={!hasDocument} 
          onClick={resetZoom} 
          title="Reset Zoom" 
          type="button"
        >
          {Math.round(scale * 100)}%
        </button>
        <select 
          className="h-8 rounded-[var(--ui-radius-sm)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-[var(--ui-pad-sm)] text-[var(--ui-font-sm)] text-[var(--text-primary)]" 
          value={zoomPreset} 
          onChange={(e) => applyZoomPreset(e.target.value as ZoomPreset)} 
          disabled={!hasDocument}
        >
          <option value="actual">Actual size</option>
          <option value="fit-width">Fit width</option>
          <option value="fit-page">Fit page</option>
        </select>
        <ToolIconButton label="Zoom In" disabled={!hasDocument} onClick={zoomIn}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="6" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </ToolIconButton>
      </div>
    </div>
  );
}

// --- ANNOTATIONS & HISTORY GROUP ---
interface AnnotationsHistoryGroupProps {
  activeTool: ActiveTool;
  hasDocument: boolean;
  setActiveTool: (tool: ActiveTool) => void;
  undoAnnotations: () => void;
  redoAnnotations: () => void;
}

export function AnnotationsHistoryGroup({
  activeTool,
  hasDocument,
  setActiveTool,
  undoAnnotations,
  redoAnnotations,
}: AnnotationsHistoryGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--ui-radius-md)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-[var(--ui-pad-sm)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)] opacity-70">Annotations & History</span>
      <div className="flex flex-1 items-center gap-[var(--ui-gap-xs)]">
        <ToolIconButton label="Highlight" active={activeTool === "highlight"} disabled={!hasDocument} onClick={() => setActiveTool("highlight")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 4 6 6-11 11H4v-5z" />
            <line x1="12" y1="6" x2="18" y2="12" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Add / Edit Text (T)" active={activeTool === "note"} disabled={!hasDocument} onClick={() => setActiveTool("note")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Rectangle" active={activeTool === "shape"} disabled={!hasDocument} onClick={() => setActiveTool("shape")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="14" rx="2" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Signature (S)" active={activeTool === "signature"} disabled={!hasDocument} onClick={() => setActiveTool("signature")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H4" />
            <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L7 17l-4 1 1-4Z" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Measure Tool (M)" active={activeTool === "measure"} disabled={!hasDocument} onClick={() => setActiveTool("measure")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 3-18 18" />
            <path d="M17 4l3 3" />
            <path d="M14 7l3 3" />
            <path d="M11 10l3 3" />
            <path d="M8 13l3 3" />
            <path d="M5 16l3 3" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Redact" active={activeTool === "redact"} disabled={!hasDocument} onClick={() => setActiveTool("redact")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="7" y1="9" x2="17" y2="9" strokeWidth="3" />
          </svg>
        </ToolIconButton>
        <div className="mx-0.5 h-4 w-px bg-[var(--border-color)]" />
        <ToolIconButton label="Undo (Ctrl+Z)" disabled={!hasDocument} onClick={undoAnnotations}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Redo (Ctrl+Y)" disabled={!hasDocument} onClick={redoAnnotations}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </ToolIconButton>
      </div>
    </div>
  );
}

// --- PAGE ACTIONS GROUP ---
interface PageActionsGroupProps {
  hasDocument: boolean;
  runDocumentTool: (tool: DocumentTool) => void;
  rotateLeft: () => void;
  rotateRight: () => void;
}

export function PageActionsGroup({
  hasDocument,
  runDocumentTool,
  rotateLeft,
  rotateRight,
}: PageActionsGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--ui-radius-md)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-[var(--ui-pad-sm)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)] opacity-70">Page Actions</span>
      <div className="flex flex-1 items-center gap-[var(--ui-gap-xs)]">
        <ToolIconButton label="Delete Pages..." disabled={!hasDocument} onClick={() => runDocumentTool("delete-pages")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Insert PDF..." disabled={!hasDocument} onClick={() => runDocumentTool("insert-pdf")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Crop Page..." disabled={!hasDocument} onClick={() => runDocumentTool("crop-current")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2v14a2 2 0 0 0 2 2h14" />
            <path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
        </ToolIconButton>
        <div className="mx-0.5 h-4 w-px bg-[var(--border-color)]" />
        <ToolIconButton label="Rotate Current Page Left" disabled={!hasDocument} onClick={rotateLeft}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <rect x="9" y="9" width="6" height="8" rx="1" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Rotate Current Page Right" disabled={!hasDocument} onClick={rotateRight}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <rect x="9" y="9" width="6" height="8" rx="1" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Rotate All Pages Left" disabled={!hasDocument} onClick={() => runDocumentTool("rotate-all-left")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M7 13V8a1 1 0 0 1 1-1h5" />
            <rect x="10" y="10" width="6" height="8" rx="1" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Rotate All Pages Right" disabled={!hasDocument} onClick={() => runDocumentTool("rotate-all-right")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M7 13V8a1 1 0 0 1 1-1h5" />
            <rect x="10" y="10" width="6" height="8" rx="1" />
          </svg>
        </ToolIconButton>
      </div>
    </div>
  );
}

// --- DOCUMENT MARKUP GROUP ---
interface DocumentMarkupGroupProps {
  hasDocument: boolean;
  runOcr: () => void;
  openDocumentMarkupTool: (tool: "page-numbers" | "header" | "footer" | "bates") => void;
}

export function DocumentMarkupGroup({
  hasDocument,
  runOcr,
  openDocumentMarkupTool,
}: DocumentMarkupGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--ui-radius-md)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-[var(--ui-pad-sm)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)] opacity-70">Document Markup</span>
      <div className="flex flex-1 items-center gap-[var(--ui-gap-xs)]">
        <ToolIconButton label="Run OCR" disabled={!hasDocument} onClick={runOcr}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M4 16v2a2 2 0 0 0 2 2h2M16 20h2a2 2 0 0 0 2-2v-2" />
            <path d="M12 8v8" />
            <path d="m9 15 3-7 3 7" />
            <path d="M10 13h4" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Add Page Numbers" disabled={!hasDocument} onClick={() => openDocumentMarkupTool("page-numbers")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 8v8" />
            <path d="M15 8v8" />
            <path d="M7 11h10" />
            <path d="M7 14h10" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Add Header" disabled={!hasDocument} onClick={() => openDocumentMarkupTool("header")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="8" x2="21" y2="8" />
            <line x1="7" y1="5.5" x2="17" y2="5.5" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Add Footer" disabled={!hasDocument} onClick={() => openDocumentMarkupTool("footer")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="16" x2="21" y2="16" />
            <line x1="7" y1="18.5" x2="17" y2="18.5" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Add Bates Numbering" disabled={!hasDocument} onClick={() => openDocumentMarkupTool("bates")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 9h3v6H7z" />
            <path d="M14 9h3v6h-3z" />
          </svg>
        </ToolIconButton>
      </div>
    </div>
  );
}

// --- FILE UTILITIES GROUP ---
interface FileUtilitiesGroupProps {
  hasDocument: boolean;
  compressDocument: () => void;
  addWatermark: () => void;
  splitDocument: () => void;
  mergeDocuments: () => void;
  convertToImages: () => void;
  runDocumentTool: (tool: DocumentTool) => void;
}

export function FileUtilitiesGroup({
  hasDocument,
  compressDocument,
  addWatermark,
  splitDocument,
  mergeDocuments,
  convertToImages,
  runDocumentTool,
}: FileUtilitiesGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--ui-radius-md)] border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-[var(--ui-pad-sm)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)] opacity-70">File Utilities</span>
      <div className="flex flex-1 items-center gap-[var(--ui-gap-xs)]">
        <ToolIconButton label="Compress" disabled={!hasDocument} onClick={compressDocument}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <path d="m12 8-3 3h6l-3-3zm0 8 3-3H9l3 3z" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Watermark" disabled={!hasDocument} onClick={addWatermark}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m7 16 2-8 3 5 3-5 2 8" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Split" disabled={!hasDocument} onClick={splitDocument}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 3" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Merge" onClick={mergeDocuments}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 17H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
            <rect x="9" y="9" width="12" height="14" rx="2" />
            <path d="M15 13v6M12 16h6" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="To Images" disabled={!hasDocument} onClick={convertToImages}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8" cy="8" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Encrypt" disabled={!hasDocument} onClick={() => runDocumentTool("encrypt")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="Decrypt" disabled={!hasDocument} onClick={() => runDocumentTool("decrypt")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        </ToolIconButton>
        <ToolIconButton label="PDF/A" disabled={!hasDocument} onClick={() => runDocumentTool("normalize")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 10 2 2 4-4" />
          </svg>
        </ToolIconButton>
      </div>
    </div>
  );
}
