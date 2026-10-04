import React from "react";
import type { MergeFile } from "./types";

interface MergeToolPanelProps {
  mergeFiles: MergeFile[];
  isProcessing: boolean;
  onPick: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onMerge: (mode: "view" | "download") => void;
}

export function MergeToolPanel({
  mergeFiles,
  isProcessing,
  onPick,
  onMoveUp,
  onMoveDown,
  onReorder,
  onRemove,
  onMerge,
}: MergeToolPanelProps) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

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
            <div
              key={file.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) onReorder(dragIndex, index);
                setDragIndex(null);
              }}
              className={`flex items-center gap-1 bg-[var(--bg-toolbar)] p-1.5 rounded border border-[var(--border-color)] text-[11px] cursor-grab active:cursor-grabbing ${dragIndex === index ? "opacity-50" : ""}`}
              title="Drag to reorder"
            >
              <div className="flex flex-col gap-px min-w-0 flex-1">
                <span className="truncate font-semibold block" title={file.name}>{file.name}</span>
                <span className="text-[9px] text-[var(--text-secondary)] block">({file.totalPages} pages)</span>
              </div>
              <div className="flex gap-px">
                <button
                  onClick={() => onMoveUp(index)}
                  disabled={index === 0}
                  aria-label={`Move ${file.name} up`}
                  title="Move up"
                  className="h-5 w-5 flex items-center justify-center p-0 border-none rounded bg-transparent hover:bg-[var(--ui-hover-bg)] cursor-pointer disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 14 6-6 6 6" /></svg>
                </button>
                <button
                  onClick={() => onMoveDown(index)}
                  disabled={index === mergeFiles.length - 1}
                  aria-label={`Move ${file.name} down`}
                  title="Move down"
                  className="h-5 w-5 flex items-center justify-center p-0 border-none rounded bg-transparent hover:bg-[var(--ui-hover-bg)] cursor-pointer disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 10 6 6 6-6" /></svg>
                </button>
                <button
                  onClick={() => onRemove(file.id)}
                  aria-label={`Remove ${file.name}`}
                  title="Remove"
                  className="h-5 w-5 flex items-center justify-center p-0 border-none rounded bg-transparent hover:bg-[#fdecea] text-[var(--ui-danger)] cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
