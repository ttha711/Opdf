import type { ActiveTool, ViewMode } from "../lib/app-types";

export function StatusBar({
  hasDocument,
  page,
  totalPages,
  viewerError,
  scale,
  viewMode,
  activeTool,
  saveState,
}: {
  hasDocument: boolean;
  page: number;
  totalPages: number;
  viewerError: string | null;
  scale: number;
  viewMode: ViewMode;
  activeTool: ActiveTool;
  saveState: "idle" | "saving" | "saved";
}) {
  const pagesLoading = hasDocument && totalPages <= 0;

  return (
    <footer
      data-testid="status-bar"
      data-opdf-region="status-bar"
      data-opdf-has-document={hasDocument ? "true" : "false"}
      data-opdf-page={page}
      data-opdf-total-pages={totalPages}
      data-opdf-page-loading={pagesLoading ? "true" : "false"}
      data-opdf-zoom={scale}
      data-opdf-active-tool={activeTool}
      data-opdf-save-state={saveState}
      data-opdf-message={viewerError ?? ""}
      aria-label={pagesLoading ? "Loading document pages" : hasDocument ? `Page ${page} of ${totalPages}` : "No document"}
      className="flex select-none items-center justify-between border-t border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] text-[11px] text-[var(--text-secondary)]">
      <div className="flex items-center gap-1.5">
        {pagesLoading ? (
          <span data-testid="page-loading-status">Loading pages...</span>
        ) : hasDocument ? (
          <span data-testid="page-status">Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
        ) : (
          <span data-testid="empty-document-status">No document</span>
        )}
      </div>
      <div className="min-w-0 flex-1 px-4 text-center">
        {hasDocument && viewerError ? (
          <span className="text-[11px] text-[var(--ui-error-text)]">{viewerError}</span>
        ) : hasDocument ? (
          <span className={`text-[11px] font-semibold ${saveState === "saving" ? "text-amber-600" : saveState === "saved" ? "text-emerald-600" : "text-rose-600"}`}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Unsaved"}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <span>{Math.round(scale * 100)}%</span>
        <span className="text-[var(--border-color)]">|</span>
        <span>{viewMode === "continuous" ? "Continuous" : "Single Page"}</span>
        {activeTool !== "select" ? (
          <><span className="text-[var(--border-color)]">|</span><span className="font-semibold text-[var(--acrobat-blue)]">Tool: {activeTool}</span></>
        ) : null}
      </div>
    </footer>
  );
}
