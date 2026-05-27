import React from "react";
import { Sliders } from "lucide-react";
import { AIParsedDocument, DocumentBlock, TableCell } from "../types";
import { cn } from "../lib/utils";

interface BlockOfficeDocChartRendererProps {
  block: DocumentBlock;
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;
}

export default function BlockOfficeDocChartRenderer({
  block,
  currentDoc,
  setCurrentDoc,
  evaluateFormula
}: BlockOfficeDocChartRendererProps) {
  const precedingTable = currentDoc.blocks
    .slice(0, currentDoc.blocks.indexOf(block))
    .reverse()
    .find(b => b.type === "table" && b.tableData);

  if (!precedingTable || !precedingTable.tableData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-250 mt-2">
        <Sliders className="w-6 h-6 text-slate-400 mb-2" />
        <span className="text-xs text-slate-500">Tạo bảng dữ liệu Excel phía trên để vẽ đồ thị tự động</span>
      </div>
    );
  }

  const dataRows = precedingTable.tableData.slice(1, precedingTable.tableData.length - 1); // skip total row
  if (dataRows.length === 0) return null;

  const labels = dataRows.map(r => r[0]?.value || "");
  const values = dataRows.map(r => {
    let rawVal = r[r.length - 1]?.value || "";
    if (r[r.length - 1]?.formula) {
      rawVal = evaluateFormula(r[r.length - 1].formula!, precedingTable.tableData!);
    }
    const num = parseFloat(rawVal.replace(/[^0-9.-]/g, ""));
    return isNaN(num) ? 0 : num;
  });

  const maxVal = Math.max(...values, 1);
  const chartType = block.meta?.chartType || "bar";

  return (
    <div className="p-4 bg-slate-50 border border-slate-205 rounded-xl mt-3 select-none text-left">
      <div className="text-[10px] font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center justify-between">
        <span>{block.content} (Dự toán đồ thị)</span>
        <div className="flex gap-1.5">
          {["bar", "line"].map(t => (
            <button 
              key={t}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentDoc(prev => {
                  const b = prev.blocks.find(bk => bk.id === block.id);
                  if (b && b.meta) {
                    b.meta.chartType = t as any;
                  }
                  return { ...prev };
                });
              }}
              className={cn(
                "px-2 py-0.5 rounded text-[9px] font-bold uppercase cursor-pointer", 
                chartType === t ? "bg-indigo-650 text-white" : "bg-slate-202 text-slate-600"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {chartType === "bar" ? (
        <div className="space-y-2 pt-1 font-sans">
          {labels.map((lbl, idx) => {
            const val = values[idx];
            const pct = Math.min(100, Math.max(8, (val / maxVal) * 100));
            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold font-sans">
                  <span className="text-slate-655 truncate max-w-sm">{lbl}</span>
                  <span className="font-mono text-slate-900">{val.toLocaleString("vi-VN")}</span>
                </div>
                <div className="w-full bg-slate-200/50 h-5 rounded-md overflow-hidden flex items-center">
                  <div 
                    style={{ width: `${pct}%` }}
                    className="bg-indigo-650 h-full flex items-center pl-2 transition-all duration-300"
                  >
                    <span className="text-[9px] font-bold text-white">{(pct).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-end justify-between h-36 pt-4 px-4 border-b border-l border-slate-205 mt-2 font-sans">
          {labels.map((lbl, idx) => {
            const val = values[idx];
            const hPct = Math.min(100, Math.max(12, (val / maxVal) * 100));
            return (
              <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group py-1 relative">
                <div 
                  style={{ height: `${hPct}%` }}
                  className="w-4 bg-indigo-600 hover:bg-indigo-550 rounded-t transition-all duration-300 flex justify-center"
                >
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[9px] font-mono p-1 rounded shadow-md pointer-events-none transition-all z-20">
                    {val.toLocaleString("vi-VN")}
                  </div>
                </div>
                <span className="text-[9px] text-slate-404 mt-2 text-center max-w-[50px] truncate font-medium">{lbl}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
