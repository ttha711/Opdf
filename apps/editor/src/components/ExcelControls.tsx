import React, { useState } from "react";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Type, Paintbrush, Eraser, Sparkles, Loader2 } from "lucide-react";
import { TableCell, DocumentBlock } from "../types";
import { cn } from "../lib/utils";
import ExcelFormulaHelper from "./ExcelFormulaHelper";

interface ExcelControlsProps {
  selectedCell: { blockId: string; rIdx: number; colIdx: number } | null;
  selectedCellData: TableCell | null;
  formulaValue: string;
  onFormulaChange: (val: string) => void;
  onStyleChange: (styleKey: "bold" | "italic" | "align" | "bgColor" | "color", val: any) => void;
  activeTableBlock: DocumentBlock | null;
}

export default function ExcelControls({
  selectedCell,
  selectedCellData,
  formulaValue,
  onFormulaChange,
  onStyleChange,
  activeTableBlock
}: ExcelControlsProps) {
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const cellName = selectedCell
    ? `${String.fromCharCode(65 + selectedCell.colIdx)}${selectedCell.rIdx + 1}`
    : "--";

  const presetBgColors = [
    { name: "Không màu", value: "" },
    { name: "Đỏ nhạt", value: "#fee2e2" },
    { name: "Vàng nhạt", value: "#fef9c3" },
    { name: "Lục nhạt", value: "#dcfce7" },
    { name: "Lam nhạt", value: "#dbeafe" },
    { name: "Tím nhạt", value: "#f3e8ff" }
  ];

  const presetTextColors = [
    { name: "Mặc định", value: "" },
    { name: "Đỏ", value: "#dc2626" },
    { name: "Lục", value: "#16a34a" },
    { name: "Lam", value: "#2563eb" },
    { name: "Xám", value: "#4b5563" }
  ];

  const handleGenerateAiFormula = async () => {
    if (!aiPrompt.trim() || !activeTableBlock?.tableData) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableData: activeTableBlock.tableData,
          instruction: aiPrompt
        })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.formula) {
        onFormulaChange(data.formula);
      }
      setAiPrompt("");
      setShowAiInput(false);
    } catch (err) {
      alert("AI sinh công thức thất bại. Vui lòng thử lại.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm font-sans">
      {/* 1. Format Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Bold & Italic */}
          <button
            type="button"
            disabled={!selectedCell}
            onClick={() => onStyleChange("bold", !selectedCellData?.bold)}
            className={cn(
              "p-1.5 rounded hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-40",
              selectedCellData?.bold ? "bg-slate-200 text-indigo-700 font-bold" : "text-slate-650"
            )}
            title="Bôi đậm ô"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          
          <button
            type="button"
            disabled={!selectedCell}
            onClick={() => onStyleChange("italic", !selectedCellData?.italic)}
            className={cn(
              "p-1.5 rounded hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-40",
              selectedCellData?.italic ? "bg-slate-200 text-indigo-700" : "text-slate-650"
            )}
            title="In nghiêng ô"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-slate-300 mx-1" />

          {/* Alignments */}
          {(["left", "center", "right"] as const).map(alignment => (
            <button
              key={alignment}
              type="button"
              disabled={!selectedCell}
              onClick={() => onStyleChange("align", alignment)}
              className={cn(
                "p-1.5 rounded hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-40",
                (selectedCellData?.align || "center") === alignment ? "bg-slate-200 text-indigo-700" : "text-slate-650"
              )}
              title={`Căn lề ${alignment === "left" ? "trái" : alignment === "right" ? "phải" : "giữa"}`}
            >
              {alignment === "left" && <AlignLeft className="w-3.5 h-3.5" />}
              {alignment === "center" && <AlignCenter className="w-3.5 h-3.5" />}
              {alignment === "right" && <AlignRight className="w-3.5 h-3.5" />}
            </button>
          ))}

          <div className="w-[1px] h-4 bg-slate-300 mx-1" />

          {/* Background color preset select */}
          <div className="flex items-center gap-1">
            <Paintbrush className="w-3.5 h-3.5 text-slate-400 mr-1" />
            <select
              disabled={!selectedCell}
              value={selectedCellData?.bgColor || ""}
              onChange={(e) => onStyleChange("bgColor", e.target.value)}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
            >
              {presetBgColors.map(c => (
                <option key={c.name} value={c.value}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Text color preset select */}
          <div className="flex items-center gap-1 ml-2">
            <Type className="w-3.5 h-3.5 text-slate-400 mr-1" />
            <select
              disabled={!selectedCell}
              value={selectedCellData?.color || ""}
              onChange={(e) => onStyleChange("color", e.target.value)}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
            >
              {presetTextColors.map(c => (
                <option key={c.name} value={c.value}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="w-[1px] h-4 bg-slate-300 mx-1" />

          {/* Clear formatting button */}
          <button
            type="button"
            disabled={!selectedCell}
            onClick={() => {
              onStyleChange("bold", false);
              onStyleChange("italic", false);
              onStyleChange("bgColor", "");
              onStyleChange("color", "");
            }}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-red-650 transition-colors cursor-pointer disabled:opacity-40"
            title="Xóa định dạng ô"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        </div>

        {selectedCell && (
          <div className="text-[10px] text-indigo-650 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 font-bold flex items-center gap-1">
            <span>Sửa ô: {cellName}</span>
          </div>
        )}
      </div>

      {/* 2. Formula Bar & AI Formula Generator */}
      <div className="flex items-center bg-white border border-slate-200 rounded-lg h-9 shadow-sm relative">
        <div className="bg-slate-100 text-slate-600 font-mono font-bold text-xs px-3.5 h-full flex items-center justify-center border-r border-slate-200 min-w-[50px] select-none rounded-l-lg">
          {cellName}
        </div>
        <div className="text-slate-400 font-serif italic text-sm font-semibold px-2 flex items-center gap-1 select-none">
          <span>fx</span>
        </div>
        <input
          type="text"
          disabled={!selectedCell}
          value={formulaValue}
          onChange={(e) => onFormulaChange(e.target.value)}
          placeholder={selectedCell ? "Nhập giá trị hoặc công thức (ví dụ: =SUM(B2:B3))" : "Chọn một ô để nhập dữ liệu hoặc công thức"}
          className="flex-grow h-full bg-transparent px-2 text-xs focus:outline-none text-slate-800 disabled:bg-slate-50/50 disabled:text-slate-400 font-mono"
        />
        
        {/* AI Formula Generator Button */}
        {selectedCell && (
          <div className="relative border-l border-slate-200 h-full flex items-center justify-center bg-slate-50">
            <button
              onClick={() => setShowAiInput(!showAiInput)}
              className={cn(
                "p-1.5 hover:bg-slate-200 transition-colors text-indigo-650 flex items-center gap-1 cursor-pointer",
                showAiInput ? "bg-slate-200" : ""
              )}
              title="Sinh công thức bằng AI"
            >
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span className="text-[10px] font-bold hidden md:inline">Sinh công thức AI</span>
            </button>
            {showAiInput && (
              <div className="absolute right-0 bottom-10 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 w-72 space-y-2">
                <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block">Yêu cầu AI viết công thức</span>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ví dụ: Tính tổng từ C2 đến C5"
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                />
                <button
                  onClick={handleGenerateAiFormula}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="w-full bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-yellow-300" />}
                  <span>Tạo công thức</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="border-l border-slate-200 px-2 h-full flex items-center justify-center bg-slate-50 rounded-r-lg">
          <ExcelFormulaHelper
            onSelectFormula={onFormulaChange}
            disabled={!selectedCell}
          />
        </div>
      </div>
    </div>
  );
}
