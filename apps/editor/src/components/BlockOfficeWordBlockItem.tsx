import React from "react";
import { cn } from "../lib/utils";
import { DocumentBlock, TableCell, AIParsedDocument } from "../types";

interface BlockItemProps {
  block: DocumentBlock;
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  renderInteractiveChart: (block: DocumentBlock) => React.ReactNode;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;
}

export default function BlockOfficeWordBlockItem({
  block,
  currentDoc,
  setCurrentDoc,
  selectedBlockId,
  setSelectedBlockId,
  moveBlock,
  duplicateBlock,
  deleteBlock,
  renderInteractiveChart,
  evaluateFormula
}: BlockItemProps) {
  const isSelected = selectedBlockId === block.id;
  const globalIdx = currentDoc.blocks.findIndex(b => b.id === block.id);

  const getBlockTypeLabel = () => {
    switch (block.type) {
      case "heading": return `TIÊU ĐỀ H${block.meta?.level || 2}`;
      case "callout": return "Lưu ý";
      case "table": return "Bảng dữ liệu";
      case "chart": return "Biểu đồ";
      case "slide": return "Trang Slide";
      case "page-break": return "Ngắt trang";
      default: return "Đoạn văn";
    }
  };

  const updateBlockContent = (val: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === block.id ? { ...b, content: val } : b)
    }));
  };

  const updateBulletPoint = (bIdx: number, val: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id !== block.id) return b;
        const bps = [...(b.meta?.bulletPoints || [])];
        bps[bIdx] = val;
        return { ...b, meta: { ...b.meta, bulletPoints: bps } };
      })
    }));
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); }}
      className={cn("relative group cursor-text p-1.5 rounded transition-all", isSelected ? "ring-2 ring-indigo-600 bg-indigo-50/5 shadow-sm" : "hover:bg-slate-50/50")}
    >
      {/* Floating Control Bar */}
      {isSelected && (
        <div className="absolute -top-[44px] left-0 right-0 mx-auto z-40 bg-white border border-slate-300 shadow-md rounded-lg p-1.5 flex flex-wrap items-center gap-2 select-none print:hidden font-sans w-max max-w-full text-xs">
          <span className="bg-indigo-50 text-indigo-700 font-extrabold uppercase text-[9px] px-2 py-0.5 rounded tracking-wide border border-indigo-150">
            {getBlockTypeLabel()}
          </span>
          <span className="text-slate-400 font-bold text-[9px]">Khối #{globalIdx + 1}</span>
          <div className="w-px h-4 bg-slate-200" />
          <button disabled={globalIdx === 0} onClick={(e) => { e.stopPropagation(); moveBlock(block.id, "up"); }} className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-30 rounded cursor-pointer">▲ Lên</button>
          <button disabled={globalIdx === currentDoc.blocks.length - 1} onClick={(e) => { e.stopPropagation(); moveBlock(block.id, "down"); }} className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-30 rounded cursor-pointer">▼ Xuống</button>
          <div className="w-px h-4 bg-slate-200" />
          <button onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }} className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer">📄 Nhân bản</button>
          <button onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }} className="px-1.5 py-0.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-red-700 font-bold cursor-pointer">🗑 Xóa</button>
          <button onClick={(e) => { e.stopPropagation(); setSelectedBlockId(null); }} className="p-1 hover:bg-slate-100 text-slate-400 rounded cursor-pointer">✕</button>
        </div>
      )}

      {/* Render Headings */}
      {block.type === "heading" && (
        <div>
          {isSelected ? (
            <textarea
              value={block.content}
              onChange={(e) => updateBlockContent(e.target.value)}
              rows={1}
              className="wp-inline-textarea font-sans text-base font-semibold text-slate-800 tracking-tight mt-3 border-b border-indigo-100 w-full bg-transparent focus:outline-none focus:ring-0 resize-none overflow-hidden h-auto"
              placeholder="Nhập nội dung tiêu đề..."
            />
          ) : (
            block.meta?.level === 1 
              ? <h1 className="font-sans text-xl font-bold text-slate-900 tracking-tight mb-2 uppercase border-b border-slate-200 pb-1.5">{block.content}</h1>
              : <h2 className="font-sans text-base font-semibold text-slate-800 tracking-tight mt-3">{block.content}</h2>
          )}
        </div>
      )}

      {/* Render Paragraphs & Bullets */}
      {block.type === "paragraph" && (
        <div className="space-y-1">
          {isSelected ? (
            <textarea
              value={block.content}
              onChange={(e) => updateBlockContent(e.target.value)}
              className="wp-inline-textarea text-xs text-slate-600 leading-relaxed text-justify w-full bg-transparent border-b border-indigo-50 focus:outline-none focus:ring-0 resize-none overflow-hidden h-auto pr-2"
              placeholder="Biên soạn văn bản đoạn tự do..."
            />
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed text-justify">{block.content}</p>
          )}
          {block.meta?.bulletPoints && (
            <ul className="list-disc list-inside pl-4 text-xs text-slate-500 space-y-1 mt-1 font-medium">
              {block.meta.bulletPoints.map((bp, bIdx) => (
                <li key={bIdx} className="leading-relaxed">
                  {isSelected ? (
                    <input
                      type="text"
                      value={bp}
                      onChange={(e) => updateBulletPoint(bIdx, e.target.value)}
                      className="bg-transparent border-0 border-b border-dashed border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 py-0.5 text-xs text-slate-600 inline-block w-[85%]"
                    />
                  ) : bp}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Render Tables */}
      {block.type === "table" && block.tableData && (
        <div className="my-3.5 border border-slate-200 rounded-lg bg-white p-2">
          {isSelected && (
            <div className="mb-2 px-1 flex items-center gap-1 text-xs border-b border-slate-100 pb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">Tên bảng:</span>
              <input
                type="text"
                value={block.content}
                onChange={(e) => updateBlockContent(e.target.value)}
                className="bg-transparent border-0 border-b border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 font-semibold text-slate-800 text-xs py-0.5 p-0 w-full"
                placeholder="Nhập tựa đề bảng..."
              />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  {block.tableData[0].map((cell, cIdx) => (
                    <th key={cIdx} className="p-2 font-bold uppercase text-[10px] border-r border-slate-200 last:border-r-0 text-center">{cell.value}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.tableData.slice(1).map((row, rOffset) => {
                  const rIdx = rOffset + 1;
                  const isLastRow = rIdx === block.tableData!.length - 1;
                  return (
                    <tr key={rIdx} className={cn("border-b border-slate-100 text-slate-600 hover:bg-slate-50/20 last:border-b-0", isLastRow ? "bg-slate-100 text-slate-900 font-bold border-t border-slate-300" : "")}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2 border-r border-slate-200 last:border-r-0 text-center">
                          {cell.formula ? evaluateFormula(cell.formula, block.tableData!) : cell.value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Render Charts */}
      {block.type === "chart" && renderInteractiveChart(block)}

      {/* Render Callouts */}
      {block.type === "callout" && (
        <div className={cn(
          "p-3 rounded-xl border flex gap-3 text-xs leading-relaxed my-2 font-medium",
          block.meta?.calloutType === "success" ? "bg-emerald-50 border-emerald-150 text-emerald-800" :
          block.meta?.calloutType === "warning" ? "bg-amber-50 border-amber-150 text-amber-800" :
          block.meta?.calloutType === "danger" ? "bg-red-50 border-red-150 text-red-800" : "bg-slate-50 border-slate-200 text-slate-700"
        )}>
          <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 animate-ping shadow" style={{ backgroundColor: "currentColor" }} />
          {isSelected ? (
            <textarea
              value={block.content}
              onChange={(e) => updateBlockContent(e.target.value)}
              className="wp-inline-textarea text-xs w-full bg-transparent border-0 focus:outline-none focus:ring-0 resize-none overflow-hidden h-auto font-medium"
              placeholder="Nhập nội dung lưu ý..."
            />
          ) : <div className="flex-1 text-xs">{block.content}</div>}
        </div>
      )}

      {/* Render Slide Blocks */}
      {block.type === "slide" && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 my-2 text-xs space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black text-indigo-650 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-150 select-none">[Slide Thuyết Trình]</span>
            {isSelected ? (
              <input
                type="text"
                value={block.content}
                onChange={(e) => updateBlockContent(e.target.value)}
                className="font-bold text-slate-800 bg-transparent border-0 border-b border-indigo-150 focus:outline-none focus:ring-0 w-full p-0 text-xs py-0.5"
                placeholder="Tiêu đề trang Slide..."
              />
            ) : <span className="font-bold text-slate-800">{block.content}</span>}
          </div>
          {block.meta?.bulletPoints && (
            <div className="space-y-1 pl-3 border-l-2 border-indigo-100">
              {block.meta.bulletPoints.map((bp, bIdx) => (
                <div key={bIdx} className="flex gap-2">
                  <span className="text-indigo-400 text-xs select-none">•</span>
                  {isSelected ? (
                    <input
                      type="text"
                      value={bp}
                      onChange={(e) => updateBulletPoint(bIdx, e.target.value)}
                      className="bg-transparent border-0 border-b border-dashed border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 py-0.5 text-xs text-slate-650 w-[90%] p-0"
                    />
                  ) : <span className="text-slate-600 text-xs">{bp}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Render Page Break Blocks */}
      {block.type === "page-break" && (
        <div className="relative py-4 my-2 select-none print:hidden flex items-center justify-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-dashed border-slate-300" />
          </div>
          <div className="relative flex justify-center text-[10px]">
            <span className="bg-slate-50 px-3 py-1 text-slate-400 font-bold uppercase tracking-widest border border-slate-200 rounded-full flex items-center gap-1">
              ✂️ Ngắt trang vật lý (Page Cut)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
