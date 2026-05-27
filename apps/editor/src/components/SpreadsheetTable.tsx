import React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { DocumentBlock, TableCell } from "../types";
import { cn } from "../lib/utils";

interface SpreadsheetTableProps {
  block: DocumentBlock;
  selectedCell: { blockId: string; rIdx: number; colIdx: number } | null;
  setSelectedCell: React.Dispatch<React.SetStateAction<{ blockId: string; rIdx: number; colIdx: number } | null>>;
  setFormulaValue: (val: string) => void;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;
  updateCellProperties: (blockId: string, rIdx: number, colIdx: number, updater: (cell: TableCell) => void) => void;
  handleSortTable: (blockId: string, colIdx: number, dir: "asc" | "desc") => void;
  handleModifyTableStructure: (id: string, action: "addRow" | "removeRow" | "addCol" | "removeCol") => void;
  handleAiAnalyzeTable: (tableBlock: DocumentBlock) => void;
  analyzingTableId: string | null;
  setPasteNotification: (val: string | null) => void;
}

export default function SpreadsheetTable({
  block,
  selectedCell,
  setSelectedCell,
  setFormulaValue,
  evaluateFormula,
  updateCellProperties,
  handleSortTable,
  handleModifyTableStructure,
  handleAiAnalyzeTable,
  analyzingTableId,
  setPasteNotification
}: SpreadsheetTableProps) {
  if (!block.tableData) return null;

  return (
    <div className="space-y-3 pt-1">
      <div className="flex justify-between items-center bg-slate-50 p-2 py-1.5 rounded-lg border border-slate-200">
        <span className="text-xs font-bold text-emerald-700 font-mono">Bảng: {block.content || "Spreadsheet"}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => handleModifyTableStructure(block.id, "addRow")} className="px-2 py-1 text-[9px] font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 cursor-pointer">+ Dòng</button>
          <button onClick={() => handleModifyTableStructure(block.id, "removeRow")} disabled={block.tableData.length <= 2} className="px-2 py-1 text-[9px] font-bold bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 rounded border border-slate-200 cursor-pointer">- Dòng</button>
          <button onClick={() => handleModifyTableStructure(block.id, "addCol")} className="px-2 py-1 text-[9px] font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 cursor-pointer">+ Cột</button>
          <button onClick={() => handleModifyTableStructure(block.id, "removeCol")} disabled={block.tableData[0].length <= 1} className="px-2 py-1 text-[9px] font-bold bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 rounded border border-slate-200 cursor-pointer">- Cột</button>
          <button
            onClick={() => handleAiAnalyzeTable(block)}
            disabled={analyzingTableId !== null}
            className="px-2.5 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-sm"
          >
            {analyzingTableId === block.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-300 animate-pulse" />}
            <span>AI Phân tích & Tạo Biểu đồ</span>
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm max-w-full">
        <table className="w-full text-xs text-slate-700 min-w-[500px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <th className="p-2 border-r border-slate-200 w-8 bg-slate-100 text-center text-[10px] select-none font-bold"></th>
              {block.tableData[0].map((_, cIdx) => (
                <th key={cIdx} className="p-2 border-r border-slate-200 font-bold text-center bg-slate-100 select-none group relative">
                  <div className="flex items-center justify-center gap-2">
                    <span className="uppercase text-slate-850 font-bold">{String.fromCharCode(65 + cIdx)}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleSortTable(block.id, cIdx, "asc")} className="text-[10px] text-slate-400 hover:text-indigo-600 cursor-pointer font-bold" title="Sắp xếp tăng dần">▲</button>
                      <button onClick={() => handleSortTable(block.id, cIdx, "desc")} className="text-[10px] text-slate-400 hover:text-indigo-600 cursor-pointer font-bold" title="Sắp xếp giảm dần">▼</button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
              <td className="p-2 border-r border-slate-200 text-slate-400 font-mono text-center select-none">1</td>
              {block.tableData[0].map((hdr, cIdx) => {
                const isSelected = selectedCell?.blockId === block.id && selectedCell.rIdx === 0 && selectedCell.colIdx === cIdx;
                return (
                  <td key={cIdx} className="p-1 border-r border-slate-200 text-center uppercase tracking-wide">
                    <input
                      type="text"
                      value={hdr.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (isSelected) setFormulaValue(val);
                        updateCellProperties(block.id, 0, cIdx, (c) => { c.value = val; });
                      }}
                      onFocus={() => {
                        setSelectedCell({ blockId: block.id, rIdx: 0, colIdx: cIdx });
                        setFormulaValue(hdr.value);
                      }}
                      className={cn(
                        "w-full bg-transparent text-center focus:outline-none focus:bg-slate-100 font-bold py-1 rounded",
                        hdr.bold ? "font-bold" : "font-semibold",
                        hdr.italic ? "italic" : "",
                        hdr.align === "left" ? "text-left px-2" : hdr.align === "right" ? "text-right px-2" : "text-center",
                        isSelected ? "ring-2 ring-indigo-500 bg-indigo-50/10" : ""
                      )}
                      style={{ backgroundColor: hdr.bgColor || undefined, color: hdr.color || undefined }}
                    />
                  </td>
                );
              })}
            </tr>

            {block.tableData.slice(1).map((row, rOffset) => {
              const rIdx = rOffset + 1;
              const isLast = rIdx === block.tableData!.length - 1;
              const hasTotal = block.tableData!.length > 2 && (
                (block.tableData![block.tableData!.length - 1][0]?.value || "").toLowerCase().includes("tổng") ||
                (block.tableData![block.tableData!.length - 1][0]?.value || "").toLowerCase().includes("total") ||
                (block.tableData![block.tableData!.length - 1][0]?.value || "").toLowerCase().includes("cộng") ||
                block.tableData![block.tableData!.length - 1].some(c => !!c.formula)
              );
              const isTotalRow = hasTotal && isLast;

              return (
                <tr key={rIdx} className={cn("border-b border-slate-200 hover:bg-slate-50 text-slate-700 relative", isTotalRow ? "bg-emerald-50/40 font-bold text-emerald-700 border-t border-emerald-300" : "")}>
                  <td className="p-2 border-r border-slate-200 bg-slate-50 text-slate-400 font-mono text-center select-none">{rIdx + 1}</td>
                  {row.map((cell, colIdx) => {
                    const isSelected = selectedCell?.blockId === block.id && selectedCell.rIdx === rIdx && selectedCell.colIdx === colIdx;
                    const displayValue = isSelected 
                      ? (cell.formula || cell.value) 
                      : (cell.formula ? evaluateFormula(cell.formula, block.tableData!) : cell.value);

                    return (
                      <td key={colIdx} className="p-1 border-r border-slate-200 last:border-r-0 text-center">
                        <input
                          type="text"
                          value={displayValue || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (isSelected) setFormulaValue(val);
                            updateCellProperties(block.id, rIdx, colIdx, (c) => {
                              if (val.startsWith("=")) { c.formula = val; c.value = ""; }
                              else { c.formula = undefined; c.value = val; }
                            });
                          }}
                          onFocus={() => {
                            setSelectedCell({ blockId: block.id, rIdx, colIdx });
                            setFormulaValue(cell.formula || cell.value || "");
                          }}
                          onPaste={(e) => {
                            const clipboardData = e.clipboardData;
                            if (!clipboardData) return;
                            e.preventDefault();
                            const cleanVal = clipboardData.getData("text/plain").replace(/[\r\n\t]+/g, " ").trim();
                            updateCellProperties(block.id, rIdx, colIdx, (c) => { c.value = cleanVal; });
                            setPasteNotification("Đã dán & dọn dẹp dữ liệu Excel!");
                            setTimeout(() => setPasteNotification(null), 3000);
                          }}
                          className={cn(
                            "w-full bg-transparent focus:outline-none focus:bg-slate-100 py-1 rounded text-center text-xs transition-all",
                            cell.bold ? "font-bold" : "font-normal",
                            cell.italic ? "italic" : "",
                            cell.align === "left" ? "text-left px-2" : cell.align === "right" ? "text-right px-2" : "text-center",
                            isSelected ? "ring-2 ring-indigo-500 bg-indigo-50/10" : ""
                          )}
                          style={{ backgroundColor: cell.bgColor || undefined, color: cell.color || undefined }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
