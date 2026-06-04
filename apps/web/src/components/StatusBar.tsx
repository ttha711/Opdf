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
  return (
    <footer className="flex select-none items-center justify-between border-t border-[var(--border-color)] bg-[#f0f0f0] px-[14px] text-[11px] text-[var(--text-secondary)]">
      <div className="flex items-center gap-1.5">
        {hasDocument ? (
          <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
        ) : (
          <span>No document</span>
        )}
      </div>
      <div className="min-w-0 flex-1 px-4 text-center">
        {hasDocument && viewerError ? (
          <span className="text-[11px] text-[#d32f2f]">{viewerError}</span>
        ) : hasDocument ? (
          <span className={`text-[11px] font-semibold ${saveState === "saving" ? "text-amber-600" : saveState === "saved" ? "text-emerald-600" : "text-rose-600"}`}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Unsaved"}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <span>{Math.round(scale * 100)}%</span>
        <span className="text-[#ccc]">|</span>
        <span>{viewMode === "continuous" ? "Continuous" : "Single Page"}</span>
        {activeTool !== "select" ? (
          <><span className="text-[#ccc]">|</span><span className="font-semibold text-[var(--acrobat-blue)]">Tool: {activeTool}</span></>
        ) : null}
      </div>
    </footer>
  );
}
