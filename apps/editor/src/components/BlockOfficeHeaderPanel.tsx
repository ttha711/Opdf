import React from "react";
import { 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  FileCode, 
  Printer, 
  Download, 
  Undo, 
  Redo,
} from "lucide-react";
import { cn } from "../lib/utils";
import { AIParsedDocument } from "../types";

interface BlockOfficeHeaderPanelProps {
  currentDoc: AIParsedDocument;
  activeTab: "word" | "excel" | "powerpoint";
  setActiveTab: React.Dispatch<React.SetStateAction<"word" | "excel" | "powerpoint">>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handlePrint: () => void;
  exportToDOCX: () => void;
  exportToXLSX: () => void;
  exportToPPTX: () => void;
  exportToXML: () => void;
  exportToPDF?: () => void;
}

export default function BlockOfficeHeaderPanel({
  currentDoc,
  activeTab,
  setActiveTab,
  undo,
  redo,
  canUndo,
  canRedo,
  handlePrint,
  exportToDOCX,
  exportToXLSX,
  exportToPPTX,
  exportToXML,
  exportToPDF,
}: BlockOfficeHeaderPanelProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-3 py-1 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10 shadow-xs select-none">
      <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
        {[
          { id: "word", label: "Văn bản Word", icon: FileText },
          { id: "excel", label: "Bảng Excel số liệu", icon: FileSpreadsheet },
          { id: "powerpoint", label: "Slide PowerPoint", icon: Presentation }
        ].map(tb => (
          <button
            key={tb.id}
            onClick={() => setActiveTab(tb.id as any)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer",
              activeTab === tb.id ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-905"
            )}
          >
            <tb.icon className="w-3.5 h-3.5 text-indigo-505" />
            <span>{tb.label}</span>
          </button>
        ))}
      </div>
      
      {/* Undo / Redo Actions */}
      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 print:hidden">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={cn(
            "p-1 rounded transition-all cursor-pointer flex items-center justify-center",
            canUndo ? "text-slate-705 hover:bg-white hover:shadow-xs" : "text-slate-310 cursor-not-allowed"
          )}
          title="Hoàn tác chỉnh sửa (Undo)"
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={cn(
            "p-1 rounded transition-all cursor-pointer flex items-center justify-center",
            canRedo ? "text-slate-705 hover:bg-white hover:shadow-xs" : "text-slate-310 cursor-not-allowed"
          )}
          title="Làm lại thao tác (Redo)"
        >
          <Redo className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Export and action triggers */}
      <div className="flex items-center gap-2 print:hidden">
        <button 
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-205 border border-slate-200 text-xs text-slate-705 font-semibold rounded-md transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-slate-500" />
          <span>In chuẩn A4</span>
        </button>

        <div className="relative group">
          <button className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-md font-semibold transition-colors cursor-pointer shadow-sm">
            <Download className="w-3.5 h-3.5" />
            <span>Xuất file</span>
          </button>
          <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-155 transform translate-y-1 group-hover:translate-y-0 z-45">
            <button onClick={exportToDOCX} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer">
              <FileText className="w-3.5 h-3.5 text-blue-500" /> Xuất tệp Word (.docx)
            </button>
            <button onClick={exportToXLSX} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Xuất tệp Excel (.xlsx)
            </button>
            <button onClick={exportToPPTX} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer border-b border-slate-100">
              <Presentation className="w-3.5 h-3.5 text-amber-500" /> Xuất tệp Slides (.pptx)
            </button>
            <button onClick={exportToXML} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-750 cursor-pointer">
              <FileCode className="w-3.5 h-3.5 text-emerald-505" /> Xuất XML Cấu trúc (.xml)
            </button>
            {exportToPDF && (
              <button onClick={exportToPDF} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-red-50 flex items-center gap-2.5 text-red-700 cursor-pointer border-t border-slate-100">
                <Printer className="w-3.5 h-3.5 text-red-500" /> Xuất PDF (In PDF)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
