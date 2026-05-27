import React, { useState } from "react";
import { HelpCircle, ChevronRight, CornerDownLeft } from "lucide-react";
import { cn } from "../lib/utils";

interface FormulaDef {
  name: string;
  syntax: string;
  description: string;
  example: string;
  template: string;
}

const SUPPORTED_FORMULAS: FormulaDef[] = [
  {
    name: "SUM",
    syntax: "=SUM(start:end)",
    description: "Tính tổng tất cả các ô trong vùng được chọn.",
    example: "=SUM(B2:B4)",
    template: "=SUM(B2:B4)"
  },
  {
    name: "AVERAGE",
    syntax: "=AVERAGE(start:end)",
    description: "Tính giá trị trung bình cộng của các ô trong vùng.",
    example: "=AVERAGE(C2:C4)",
    template: "=AVERAGE(C2:C4)"
  },
  {
    name: "COUNT",
    syntax: "=COUNT(start:end)",
    description: "Đếm số lượng ô có chứa giá trị số trong vùng.",
    example: "=COUNT(B2:B4)",
    template: "=COUNT(B2:B4)"
  },
  {
    name: "MAX",
    syntax: "=MAX(start:end)",
    description: "Tìm giá trị lớn nhất trong vùng được chọn.",
    example: "=MAX(B2:B4)",
    template: "=MAX(B2:B4)"
  },
  {
    name: "MIN",
    syntax: "=MIN(start:end)",
    description: "Tìm giá trị nhỏ nhất trong vùng được chọn.",
    example: "=MIN(B2:B4)",
    template: "=MIN(B2:B4)"
  },
  {
    name: "CONCAT",
    syntax: "=CONCAT(cell1, cell2, ...)",
    description: "Ghép nối các chuỗi văn bản từ nhiều ô lại với nhau.",
    example: '=CONCAT(A2, " - ", B2)',
    template: "=CONCAT(A2, B2)"
  },
  {
    name: "UPPER",
    syntax: "=UPPER(cell)",
    description: "Chuyển đổi toàn bộ văn bản trong ô thành chữ IN HOA.",
    example: "=UPPER(A2)",
    template: "=UPPER(A2)"
  },
  {
    name: "LOWER",
    syntax: "=LOWER(cell)",
    description: "Chuyển đổi toàn bộ văn bản trong ô thành chữ in thường.",
    example: "=LOWER(A2)",
    template: "=LOWER(A2)"
  },
  {
    name: "PRODUCT",
    syntax: "=PRODUCT(start:end)",
    description: "Tính tích của tất cả các ô trong vùng được chọn.",
    example: "=PRODUCT(B2:C2)",
    template: "=PRODUCT(B2:C2)"
  }
];

interface ExcelFormulaHelperProps {
  onSelectFormula: (template: string) => void;
  disabled: boolean;
}

export default function ExcelFormulaHelper({
  onSelectFormula,
  disabled
}: ExcelFormulaHelperProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<FormulaDef | null>(null);

  const handleSelect = (formula: FormulaDef) => {
    onSelectFormula(formula.template);
    setIsOpen(false);
  };

  return (
    <div className="relative font-sans">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "p-1.5 rounded hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40",
          isOpen ? "bg-slate-200 text-indigo-700" : "text-slate-500"
        )}
        title="Trợ giúp Công thức fx"
      >
        <HelpCircle className="w-4 h-4" />
        <span className="text-[10px] font-bold hidden sm:inline">Trợ giúp fx</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 w-72 md:w-80 flex flex-col max-h-[360px] overflow-hidden animate-fade-in">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2">
            <span className="text-xs font-bold text-slate-800">Thư viện hàm Excel</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>

          <div className="flex-grow overflow-y-auto flex gap-2 no-scrollbar">
            {/* List formulas */}
            <div className="w-1/3 border-r border-slate-100 pr-1 flex flex-col gap-1 overflow-y-auto">
              {SUPPORTED_FORMULAS.map((formula) => (
                <button
                  key={formula.name}
                  type="button"
                  onClick={() => setSelectedFormula(formula)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-[10px] font-bold transition-all truncate flex items-center justify-between cursor-pointer",
                    selectedFormula?.name === formula.name
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span>{formula.name}</span>
                  <ChevronRight className="w-2.5 h-2.5 opacity-60" />
                </button>
              ))}
            </div>

            {/* Formula details */}
            <div className="w-2/3 pl-1 flex flex-col justify-between h-full">
              {selectedFormula ? (
                <div className="space-y-2 flex-grow overflow-y-auto pr-1">
                  <div>
                    <h5 className="text-[11px] font-bold text-indigo-700 font-mono">{selectedFormula.syntax}</h5>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{selectedFormula.description}</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-150 space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Ví dụ minh họa:</span>
                    <code className="text-[10px] text-slate-700 font-mono block break-all">{selectedFormula.example}</code>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-10 text-slate-400">
                  <HelpCircle className="w-8 h-8 text-slate-300 mb-1" />
                  <span className="text-[10px] font-medium">Chọn một hàm để xem hướng dẫn sử dụng chi tiết.</span>
                </div>
              )}

              {selectedFormula && (
                <button
                  type="button"
                  onClick={() => handleSelect(selectedFormula)}
                  className="w-full mt-2 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-[10px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-3xs shrink-0"
                >
                  <CornerDownLeft className="w-3 h-3" />
                  <span>Chèn công thức</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
