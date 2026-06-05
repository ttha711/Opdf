import type { RenderedTextItem } from "./PdfViewer.types";
import type { GroupedParagraph } from "./PdfTextSelection.types";
import { groupTextItemsIntoLines, sortItemsInReadingOrder } from "./PdfTextSelection.utils";

export function StirlingControls({
  active,
  subMode,
  onToggle,
  onSubModeChange,
}: {
  active: boolean;
  subMode: "auto" | "manual";
  onToggle: () => void;
  onSubModeChange: (mode: "auto" | "manual") => void;
}) {
  return (
    <div
      className="absolute top-2 right-2 z-30 select-none pointer-events-auto flex flex-col gap-1.5 items-end"
      style={{ pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all duration-200 cursor-pointer shadow-sm ${
          active
            ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
            : "bg-white/90 backdrop-blur-sm border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
      >
        <strong>✨ Stirling Edit Mode</strong>
        <strong className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400 animate-pulse" : "bg-slate-300"}`} />
      </button>

      {active && (
        <div className="flex bg-white/90 backdrop-blur-xs border border-slate-200/80 p-0.5 rounded-lg shadow-sm gap-0.5 text-[10px] pointer-events-auto">
          <button type="button" onClick={() => onSubModeChange("auto")} className={`px-2 py-1 font-bold rounded-md cursor-pointer transition-all ${subMode === "auto" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>🤖 Auto-Group</button>
          <button type="button" onClick={() => onSubModeChange("manual")} className={`px-2 py-1 font-bold rounded-md cursor-pointer transition-all ${subMode === "manual" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>🖱️ Drag-Select</button>
        </div>
      )}
    </div>
  );
}

export function StirlingParagraphs({
  paragraphs,
  onParagraphClick,
}: {
  paragraphs: GroupedParagraph[];
  onParagraphClick: (para: GroupedParagraph) => void;
}) {
  return paragraphs.map((para, idx) => (
    <div
      key={`stirling-para-${idx}-${para.top}`}
      onClick={(e) => {
        e.stopPropagation();
        onParagraphClick(para);
      }}
      className="absolute border border-dashed border-indigo-400/40 hover:border-indigo-600 hover:bg-indigo-500/10 cursor-pointer transition-all duration-150 rounded group pointer-events-auto"
      style={{
        left: para.left - 4,
        top: para.top - 4,
        width: para.width + 8,
        height: para.height + 8,
        pointerEvents: "auto",
      }}
      title="Click to edit this text paragraph directly"
    >
      <strong className="hidden group-hover:block absolute -top-4 left-0 bg-indigo-600 text-white text-[8px] font-bold px-1 rounded shadow-xs select-none">
        Stirling Paragraph Edit
      </strong>
    </div>
  ));
}

export function SavedPatches({
  patches,
  width,
  height,
  onClick,
}: {
  patches: any[];
  width: number;
  height: number;
  onClick: (patch: any) => void;
}) {
  return patches.map((patch) => {
    const payload = patch.payload as any;
    if (!payload) return null;

    const patchX = (payload.x ?? 0) * width;
    const patchY = (payload.y ?? 0) * height;
    const patchW = (payload.width ?? 0.1) * width;
    const patchH = (payload.height ?? 0.05) * height;

    return (
      <div
        key={`saved-patch-${patch.id}`}
        onClick={(e) => { e.stopPropagation(); onClick(patch); }}
        className="absolute border border-dashed border-indigo-500/60 hover:border-indigo-700 hover:bg-indigo-500/10 cursor-pointer transition-all duration-150 rounded group pointer-events-auto"
        style={{
          left: patchX - 3,
          top: patchY - 3,
          width: patchW + 6,
          height: patchH + 6,
          pointerEvents: "auto",
        }}
        title="Click to edit this paragraph patch again"
      >
        <strong className="hidden group-hover:block absolute -top-4 right-0 bg-indigo-700 text-white text-[8px] font-bold px-1 rounded shadow-xs select-none">
          📝 Edit Patch
        </strong>
      </div>
    );
  });
}

export function NormalTextLayer({ items }: { items: RenderedTextItem[] }) {
  const lines = groupTextItemsIntoLines(sortItemsInReadingOrder(items));
  return lines.map((line, index) => (
    <span
      key={`${index}-${line.left}-${line.top}`}
      style={{
        left: line.left,
        top: line.top,
        width: line.width,
        height: line.height,
        fontSize: line.fontSize,
      }}
    >
      {line.str}
    </span>
  ));
}
