import type { MergeFile } from "./types";

interface MergeToolPanelProps {
  mergeFiles: MergeFile[];
  isProcessing: boolean;
  onPick: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (id: string) => void;
  onMerge: (mode: "view" | "download") => void;
}

export function MergeToolPanel({
  mergeFiles,
  isProcessing,
  onPick,
  onMoveUp,
  onMoveDown,
  onRemove,
  onMerge,
}: MergeToolPanelProps) {
  return (
    <>
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold">Merge Stack List</span>
        <button
          onClick={onPick}
          className="h-6 rounded border border-[var(--acrobat-blue)] text-[var(--acrobat-blue)] px-2 bg-transparent text-[11px] font-bold cursor-pointer hover:bg-[var(--ui-accent-bg)] transition-colors"
        >
          + Add PDF
        </button>
      </div>

      <div className="max-h-36 overflow-y-auto border border-[var(--border-color)] rounded p-1 bg-[var(--ui-muted-bg)] flex flex-col gap-1.5">
        {mergeFiles.length === 0 ? (
          <span className="text-center py-4 text-xs text-[var(--text-secondary)]">No files in merge list.</span>
        ) : (
          mergeFiles.map((file, index) => (
            <div key={file.id} className="flex items-center gap-1 bg-[var(--bg-toolbar)] p-1.5 rounded border border-[var(--border-color)] text-[11px]">
              <div className="flex flex-col gap-px min-w-0 flex-1">
                <span className="truncate font-semibold block" title={file.name}>{file.name}</span>
                <span className="text-[9px] text-[var(--text-secondary)] block">({file.totalPages} pages)</span>
              </div>
              <div className="flex gap-px">
                <button
                  onClick={() => onMoveUp(index)}
                  disabled={index === 0}
                  className="h-4 w-4 flex items-center justify-center p-0 border-none bg-transparent hover:bg-[var(--ui-hover-bg)] text-[9px] cursor-pointer disabled:opacity-30"
                >
                  â–²
                </button>
                <button
                  onClick={() => onMoveDown(index)}
                  disabled={index === mergeFiles.length - 1}
                  className="h-4 w-4 flex items-center justify-center p-0 border-none bg-transparent hover:bg-[var(--ui-hover-bg)] text-[9px] cursor-pointer disabled:opacity-30"
                >
                  â–¼
                </button>
                <button
                  onClick={() => onRemove(file.id)}
                  className="h-4 w-4 flex items-center justify-center p-0 border-none bg-transparent hover:bg-[#fdecea] text-[var(--ui-danger)] text-[9px] cursor-pointer"
                >
                  âœ•
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded bg-[var(--ui-muted-bg)] p-2 text-[10px] text-[var(--text-secondary)] flex justify-between">
        <span>Stack: <strong>{mergeFiles.length}</strong> PDFs</span>
        <span>Total: <strong>{mergeFiles.reduce((sum, file) => sum + file.totalPages, 0)}</strong> pages</span>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onMerge("download")}
          disabled={isProcessing || mergeFiles.length < 2}
          className="flex-1 h-9 rounded-md border border-[var(--acrobat-blue)] text-[var(--acrobat-blue)] hover:bg-[var(--ui-accent-bg)] bg-transparent text-xs font-bold cursor-pointer transition-colors"
        >
          Download
        </button>
        <button
          onClick={() => onMerge("view")}
          disabled={isProcessing || mergeFiles.length < 2}
          className="flex-1 h-9 rounded-md bg-[var(--acrobat-blue)] hover:bg-[var(--acrobat-blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm"
        >
          Merge & Load
        </button>
      </div>
    </>
  );
}
