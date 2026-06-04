import React from "react";
import {
  FileCode, 
  Layers, 
  Eye, 
  Sliders, 
  Printer, 
  Download,
  FileText,
  FileSpreadsheet,
  Presentation,
  Undo,
  Redo
} from "lucide-react";
import { cn } from "../lib/utils";
import { UNIFIED_EDITOR_COPY } from "../lib/editorExperience";

interface GlobalHeaderProps {
  activeWorkspace: "pdf-to-html" | "block-office";
  setActiveWorkspace: (ws: "pdf-to-html" | "block-office") => void;
  pdfViewerTab: "visual" | "compare" | "xml" | "image_edit";
  setPdfViewerTab: (tab: "visual" | "compare" | "xml" | "image_edit") => void;
  pdfPages: any[];
  exportPDFToWord: () => void;
  handlePrint: () => void;
  setSelectedPdfSelection: (val: null) => void;
  
  // BlockOffice Workspace Props
  activeTab?: "word" | "excel" | "powerpoint";
  setActiveTab?: (tab: "word" | "excel" | "powerpoint") => void;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  exportToDOCX?: () => void;
  exportToXLSX?: () => void;
  exportToPPTX?: () => void;
  exportToXML?: () => void;
  exportToPDF?: () => void;
}

export default function GlobalHeader({
  activeWorkspace,
  setActiveWorkspace,
  pdfViewerTab,
  setPdfViewerTab,
  pdfPages,
  exportPDFToWord,
  handlePrint,
  setSelectedPdfSelection,
  activeTab,
  setActiveTab,
  undo,
  redo,
  canUndo,
  canRedo,
  exportToDOCX,
  exportToXLSX,
  exportToPPTX,
  exportToXML,
  exportToPDF,
}: GlobalHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white px-3 py-1 flex items-center justify-between gap-3 sticky top-0 z-30 shadow-xs h-10 select-none shrink-0 w-full overflow-x-auto no-scrollbar">
      {/* Left section: Logo & workspace toggler */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 bg-indigo-600 shadow-md shadow-indigo-650/15 rounded-lg flex items-center justify-center font-display font-black text-sm text-white">
            Ω
          </div>
          <div className="flex items-center gap-1">
            <h1 className="font-semibold text-sm tracking-tight text-slate-900 hidden sm:inline-block">{UNIFIED_EDITOR_COPY.appTitle}</h1>
            <span className="text-[8px] uppercase tracking-wider font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-1 py-0.2 rounded-md hidden md:inline-block">Pro</span>
          </div>
        </div>

        {/* Unified document flow: keep engines separate, hide the technical split from users. */}
        <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200 items-center">
          <button
            onClick={() => {
              setActiveWorkspace("pdf-to-html");
              setSelectedPdfSelection(null);
            }}
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer",
              activeWorkspace === "pdf-to-html" 
                ? "bg-white text-slate-950 shadow-xs border border-slate-200/50 font-bold" 
                : "text-slate-500 hover:text-slate-950"
            )}
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>{UNIFIED_EDITOR_COPY.prepareWorkspaceLabel}</span>
          </button>
          
          <button
            onClick={() => {
              setActiveWorkspace("block-office");
              setSelectedPdfSelection(null);
            }}
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer",
              activeWorkspace === "block-office" 
                ? "bg-white text-slate-950 shadow-xs border border-slate-200/50 font-bold" 
                : "text-slate-500 hover:text-slate-950"
            )}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>{UNIFIED_EDITOR_COPY.editWorkspaceLabel}</span>
          </button>
        </div>

        {/* DOCUMENT TYPE SELECTORS (Word, Excel, PowerPoint) */}
        {activeWorkspace === "block-office" && activeTab && setActiveTab && (
          <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200 items-center ml-2 shrink-0">
            {[
              { id: "word", label: "Word", icon: FileText, color: "text-blue-500", hoverBg: "hover:bg-blue-50" },
              { id: "excel", label: "Excel", icon: FileSpreadsheet, color: "text-emerald-500", hoverBg: "hover:bg-emerald-50" },
              { id: "powerpoint", label: "Slides", icon: Presentation, color: "text-amber-500", hoverBg: "hover:bg-amber-50" }
            ].map(tb => (
              <button
                key={tb.id}
                onClick={() => setActiveTab(tb.id as any)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer",
                  activeTab === tb.id 
                    ? "bg-white text-slate-950 shadow-xs border border-slate-200/50 font-bold" 
                    : `text-slate-500 hover:text-slate-950 ${tb.hoverBg}`
                )}
                title={tb.id === "word" ? "Văn bản Word" : tb.id === "excel" ? "Bảng Excel số liệu" : "Slide PowerPoint"}
              >
                <tb.icon className={cn("w-3.5 h-3.5", tb.color)} />
                <span className="hidden sm:inline">{tb.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right / Middle Dynamic controls for pdf-to-html */}
      {activeWorkspace === "pdf-to-html" && (
        <div className="flex items-center gap-3 shrink-0">
          {/* View tab controller */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 items-center">
            <button
              onClick={() => setPdfViewerTab("visual")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                pdfViewerTab === "visual" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span>{UNIFIED_EDITOR_COPY.prepareViewLabel}</span>
            </button>
            <button
              onClick={() => setPdfViewerTab("compare")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                pdfViewerTab === "compare" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              <span>{UNIFIED_EDITOR_COPY.compareViewLabel}</span>
            </button>
            <button
              onClick={() => setPdfViewerTab("xml")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                pdfViewerTab === "xml" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-905"
              )}
              title="Xem mã cấu trúc XML ngữ nghĩa"
            >
              <FileCode className="w-3.5 h-3.5 text-emerald-500" />
              <span>{UNIFIED_EDITOR_COPY.structureViewLabel}</span>
            </button>
            <button
              onClick={() => setPdfViewerTab("image_edit")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                pdfViewerTab === "image_edit" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-905"
              )}
              title="Sửa ảnh PDF trực tiếp bằng AI"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-650 animate-pulse" />
              <span>{UNIFIED_EDITOR_COPY.imageEditViewLabel}</span>
            </button>
          </div>

          {/* Actions: Print and download docx */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-semibold rounded-md border border-slate-200 transition-all cursor-pointer"
              title="In tài liệu"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline">In tài liệu</span>
            </button>
            <button
              onClick={exportPDFToWord}
              disabled={pdfPages.filter(p => p.status === "done").length === 0}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-semibold rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              title="Lưu tệp Word"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Word</span>
            </button>
          </div>
        </div>
      )}

      {/* Right / Middle Dynamic controls for block-office */}
      {activeWorkspace === "block-office" && (
        <div className="flex items-center gap-3 shrink-0">
          {/* Undo / Redo Actions */}
          {undo && redo && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
              <button
                onClick={undo}
                disabled={!canUndo}
                className={cn(
                  "p-1 rounded transition-all cursor-pointer flex items-center justify-center",
                  canUndo ? "text-slate-700 hover:bg-white hover:shadow-xs" : "text-slate-300 cursor-not-allowed"
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
                  canRedo ? "text-slate-700 hover:bg-white hover:shadow-xs" : "text-slate-300 cursor-not-allowed"
                )}
                title="Làm lại thao tác (Redo)"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Actions: Print and export */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-semibold rounded-md border border-slate-200 transition-all cursor-pointer"
              title="In chuẩn A4"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline">In chuẩn A4</span>
            </button>

            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-md font-semibold transition-colors cursor-pointer shadow-xs">
                <Download className="w-3.5 h-3.5" />
                <span>Xuất file</span>
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-150 transform translate-y-1 group-hover:translate-y-0 z-45">
                {exportToDOCX && (
                  <button onClick={exportToDOCX} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer">
                    <FileText className="w-3.5 h-3.5 text-blue-500" /> Xuất tệp Word (.docx)
                  </button>
                )}
                {exportToXLSX && (
                  <button onClick={exportToXLSX} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Xuất tệp Excel (.xlsx)
                  </button>
                )}
                {exportToPPTX && (
                  <button onClick={exportToPPTX} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer border-b border-slate-100">
                    <Presentation className="w-3.5 h-3.5 text-amber-500" /> Xuất tệp Slides (.pptx)
                  </button>
                )}
                {exportToXML && (
                  <button onClick={exportToXML} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer">
                    <FileCode className="w-3.5 h-3.5 text-emerald-500" /> Xuất XML Cấu trúc (.xml)
                  </button>
                )}
                {exportToPDF && (
                  <button onClick={exportToPDF} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-red-50 flex items-center gap-2.5 text-red-700 cursor-pointer border-t border-slate-100">
                    <Printer className="w-3.5 h-3.5 text-red-500" /> Xuất PDF (In PDF)
                  </button>
                )}
            </div>
          </div>
        </div>
      </div>
    )}
    </header>
  );
}
