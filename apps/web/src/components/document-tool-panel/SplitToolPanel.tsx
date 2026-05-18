import type { SplitPart } from "./types";

interface SplitToolPanelProps {
  splitMode: "all" | "range" | "extract";
  setSplitMode: (mode: "all" | "range" | "extract") => void;
  splitRangeInput: string;
  setSplitRangeInput: (value: string) => void;
  splitExtractInput: string;
  setSplitExtractInput: (value: string) => void;
  splitParts: SplitPart[];
  isProcessing: boolean;
  onSplit: () => void;
}

export function SplitToolPanel({
  splitMode,
  setSplitMode,
  splitRangeInput,
  setSplitRangeInput,
  splitExtractInput,
  setSplitExtractInput,
  splitParts,
  isProcessing,
  onSplit,
}: SplitToolPanelProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Split Mode</label>
        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="radio" checked={splitMode === "range"} onChange={() => setSplitMode("range")} className="accent-[var(--acrobat-blue)]" />
            Custom Ranges
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="radio" checked={splitMode === "all"} onChange={() => setSplitMode("all")} className="accent-[var(--acrobat-blue)]" />
            Extract All Pages
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="radio" checked={splitMode === "extract"} onChange={() => setSplitMode("extract")} className="accent-[var(--acrobat-blue)]" />
            Consolidate selected pages
          </label>
        </div>
      </div>

      {splitMode === "range" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">Define Custom Ranges</label>
          <input
            type="text"
            value={splitRangeInput}
            onChange={(e) => setSplitRangeInput(e.target.value)}
            placeholder="Example: 1-2, 3-5"
            className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]"
          />
          <span className="text-[10px] text-[var(--text-secondary)]">Separate blocks with commas.</span>
        </div>
      )}

      {splitMode === "extract" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">Select Pages</label>
          <input
            type="text"
            value={splitExtractInput}
            onChange={(e) => setSplitExtractInput(e.target.value)}
            placeholder="Example: 1, 3, 5-8"
            className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]"
          />
          <span className="text-[10px] text-[var(--text-secondary)]">Consolidates pages into a single PDF.</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Output preview ({splitParts.length} files)</span>
        <div className="max-h-24 overflow-y-auto border border-[var(--border-color)] rounded p-1 bg-[var(--ui-muted-bg)] flex flex-col gap-1 text-[11px]">
          {splitParts.length === 0 ? (
            <span className="text-center py-2 text-[var(--text-secondary)]">Enter valid page numbers.</span>
          ) : (
            splitParts.map((part, index) => (
              <div key={index} className="flex justify-between items-center bg-[var(--bg-toolbar)] p-1 rounded border border-[var(--border-color)]">
                <span className="truncate max-w-[120px] font-semibold" title={part.name}>{part.name}</span>
                <span className="text-[10px] text-[var(--text-secondary)]">({part.pages.length} pages)</span>
              </div>
            ))
          )}
        </div>
      </div>

      <button
        onClick={onSplit}
        disabled={isProcessing || splitParts.length === 0}
        className="w-full h-9 rounded-md bg-[var(--acrobat-blue)] hover:bg-[var(--acrobat-blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm mt-2"
      >
        {isProcessing ? "Splitting..." : splitParts.length > 1 ? "Split into ZIP Archive" : "Split & Download"}
      </button>
    </>
  );
}
