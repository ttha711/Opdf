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
    <footer data-testid="status-bar" aria-label={hasDocument ? `Page ${page} of ${totalPages}` : "No document"} className="flex select-none items-center justify-between border-t border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] text-[11px] text-[var(--text-secondary)]">
      <div className="flex items-center gap-1.5">
        {hasDocument ? (
          <span data-testid="page-status">Trang <strong>{page}</strong> / <strong>{totalPages}</strong></span>
        ) : (
          <span data-testid="empty-document-status">Chưa mở tài liệu</span>
        )}
      </div>
      <div className="min-w-0 flex-1 px-4 text-center">
        {hasDocument && viewerError ? (
          <span className="text-[11px] text-[var(--ui-error-text)]">{viewerError}</span>
        ) : hasDocument ? (
          <span className={`text-[11px] font-semibold ${saveState === "saving" ? "text-amber-600" : saveState === "saved" ? "text-emerald-600" : "text-rose-600"}`}>
            {saveState === "saving" ? "Đang lưu..." : saveState === "saved" ? "Đã lưu" : "Chưa lưu"}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <span>{Math.round(scale * 100)}%</span>
        <span className="text-[var(--border-color)]">|</span>
        <span>{viewMode === "continuous" ? "Liên tục" : "Một trang"}</span>
        {activeTool !== "select" ? (
          <><span className="text-[var(--border-color)]">|</span><span className="font-semibold text-[var(--acrobat-blue)]">Công cụ: {activeTool}</span></>
        ) : null}
      </div>
    </footer>
  );
}
