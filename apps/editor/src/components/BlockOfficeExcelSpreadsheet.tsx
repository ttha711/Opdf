import React, { useState } from "react";
import { TableCell, DocumentBlock, AIParsedDocument } from "../types";
import ExcelControls from "./ExcelControls";
import SpreadsheetTable from "./SpreadsheetTable";

interface BlockOfficeExcelSpreadsheetProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  updateCellValue: (blockId: string, rIdx: number, cIdx: number, value: string, formulaStr?: string) => void;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;
}

export default function BlockOfficeExcelSpreadsheet({
  currentDoc,
  setCurrentDoc,
  evaluateFormula
}: BlockOfficeExcelSpreadsheetProps) {
  const [pasteNotification, setPasteNotification] = useState<string | null>(null);
  const [analyzingTableId, setAnalyzingTableId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ blockId: string; rIdx: number; colIdx: number } | null>(null);
  const [formulaValue, setFormulaValue] = useState<string>("");

  const updateCellProperties = (blockId: string, rIdx: number, colIdx: number, updater: (cell: TableCell) => void) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => (b.id === blockId && b.tableData) ? {
        ...b,
        tableData: b.tableData.map((row, ri) => row.map((cell, ci) => {
          if (ri === rIdx && ci === colIdx) {
            const copy = { ...cell };
            updater(copy);
            return copy;
          }
          return cell;
        }))
      } : b)
    }));
  };

  const getSelectedCellData = () => {
    if (!selectedCell) return null;
    return currentDoc.blocks.find(b => b.id === selectedCell.blockId)?.tableData?.[selectedCell.rIdx]?.[selectedCell.colIdx] || null;
  };

  const handleStyleChange = (
    key: "bold" | "italic" | "align" | "bgColor" | "color",
    val: string | boolean
  ) => {
    if (!selectedCell) return;
    updateCellProperties(selectedCell.blockId, selectedCell.rIdx, selectedCell.colIdx, (c) => {
      if (key === "bold" || key === "italic") {
        c[key] = Boolean(val);
        return;
      }
      if (key === "align") {
        c.align = val as "left" | "center" | "right";
        return;
      }
      if (key === "bgColor") {
        c.bgColor = String(val);
        return;
      }
      c.color = String(val);
    });
  };

  const handleFormulaChange = (val: string) => {
    if (!selectedCell) return;
    setFormulaValue(val);
    updateCellProperties(selectedCell.blockId, selectedCell.rIdx, selectedCell.colIdx, (c) => {
      if (val.startsWith("=")) { c.formula = val; c.value = ""; }
      else { c.formula = undefined; c.value = val; }
    });
  };

  const hasTotalRow = (rows: TableCell[][]) => {
    if (rows.length <= 2) return false;
    const last = rows[rows.length - 1];
    const firstVal = (last[0]?.value || "").toLowerCase();
    return firstVal.includes("tổng") || firstVal.includes("total") || firstVal.includes("cộng") || last.some(c => !!c.formula);
  };

  const handleSortTable = (blockId: string, colIdx: number, dir: "asc" | "desc") => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId && b.tableData && b.tableData.length > 2) {
          const rows = b.tableData;
          const header = rows[0];
          const hasTotal = hasTotalRow(rows);
          const dataRows = hasTotal ? rows.slice(1, rows.length - 1) : rows.slice(1);
          const totalRow = hasTotal ? rows[rows.length - 1] : null;

          const sorted = [...dataRows].sort((rowA, rowB) => {
            const valA = rowA[colIdx]?.value || "";
            const valB = rowB[colIdx]?.value || "";
            const numA = parseFloat(valA.replace(/[^0-9.-]/g, ""));
            const numB = parseFloat(valB.replace(/[^0-9.-]/g, ""));

            if (!isNaN(numA) && !isNaN(numB)) {
              return dir === "asc" ? numA - numB : numB - numA;
            }
            return dir === "asc" 
              ? valA.localeCompare(valB, "vi", { sensitivity: "base" })
              : valB.localeCompare(valA, "vi", { sensitivity: "base" });
          });

          return { ...b, tableData: [header, ...sorted, ...(totalRow ? [totalRow] : [])] };
        }
        return b;
      })
    }));
  };

  const handleModifyTableStructure = (id: string, action: "addRow" | "removeRow" | "addCol" | "removeCol") => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id !== id || !b.tableData) return b;
        let data = [...b.tableData];
        if (action === "addRow") data.push(Array(data[0].length).fill(null).map(() => ({ value: "" })));
        else if (action === "removeRow" && data.length > 2) data.pop();
        else if (action === "addCol") data = data.map((r, i) => i === 0 ? [...r, { value: `Cột ${String.fromCharCode(65 + r.length)}` }] : [...r, { value: "" }]);
        else if (action === "removeCol" && data[0].length > 1) data = data.map(r => r.slice(0, -1));
        return { ...b, tableData: data };
      })
    }));
  };

  const handleAiAnalyzeTable = async (tableBlock: DocumentBlock) => {
    if (!tableBlock.tableData) return;
    setAnalyzingTableId(tableBlock.id);
    try {
      const res = await fetch("/api/excel-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableData: tableBlock.tableData, tableName: tableBlock.content })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newCallout: DocumentBlock = { id: `b-c-${Date.now()}`, type: "callout", content: `📊 <b>AI Nhận xét số liệu:</b> ${data.analysis}`, meta: { calloutType: "info" } };
      const newChart: DocumentBlock = { id: `b-ch-${Date.now()}`, type: "chart", content: `Biểu đồ phân tích - ${tableBlock.content || "Bảng số liệu"}`, meta: { chartType: data.chartType || "bar", chartDataKeys: data.chartDataKeys || [] } };

      setCurrentDoc(prev => {
        const idx = prev.blocks.findIndex(b => b.id === tableBlock.id);
        if (idx === -1) return prev;
        const copy = [...prev.blocks];
        copy.splice(idx + 1, 0, newCallout, newChart);
        return { ...prev, blocks: copy };
      });
      alert("AI đã phân tích dữ liệu bảng và tự động chèn Biểu đồ tương ứng thành công!");
    } catch (err) {
      alert("Phân tích AI thất bại, vui lòng thử lại.");
    } finally {
      setAnalyzingTableId(null);
    }
  };

  const tables = currentDoc.blocks.filter(b => b.type === "table" && b.tableData);
  const activeTableBlock = tables.find(t => t.id === selectedCell?.blockId) || (tables.length > 0 ? tables[0] : null);

  return (
    <div className="w-full max-w-4xl space-y-4 select-text font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">Ex</div>
            <div>
              <h4 className="font-bold text-slate-800 text-xs">Công cụ tính toán công thức Excel</h4>
              <p className="text-[10px] text-slate-400">Chọn ô để sửa đổi giá trị, áp dụng công thức tự động hoặc định dạng ô.</p>
            </div>
          </div>
          {pasteNotification && (
            <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold border border-emerald-200">
              {pasteNotification}
            </div>
          )}
        </div>

        <ExcelControls
          selectedCell={selectedCell}
          selectedCellData={getSelectedCellData()}
          formulaValue={formulaValue}
          onFormulaChange={handleFormulaChange}
          onStyleChange={handleStyleChange}
          activeTableBlock={activeTableBlock}
        />

        {tables.length === 0 ? (
          <div className="text-center p-10 text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
            📊 Không có bảng dữ liệu Excel nào được khởi lập. Hãy chèn bảng biểu từ trang Word.
          </div>
        ) : (
          tables.map((block) => (
            <div key={block.id}>
              <SpreadsheetTable
                block={block}
                selectedCell={selectedCell}
                setSelectedCell={setSelectedCell}
                setFormulaValue={setFormulaValue}
                evaluateFormula={evaluateFormula}
                updateCellProperties={updateCellProperties}
                handleSortTable={handleSortTable}
                handleModifyTableStructure={handleModifyTableStructure}
                handleAiAnalyzeTable={handleAiAnalyzeTable}
                analyzingTableId={analyzingTableId}
                setPasteNotification={setPasteNotification}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
