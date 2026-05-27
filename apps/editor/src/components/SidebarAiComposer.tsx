import React from "react";
import { Sparkles, Loader2, FilePlus, FileUp, Eye, RefreshCw } from "lucide-react";

interface SidebarAiComposerProps {
  promptInput: string;
  setPromptInput: (v: string) => void;
  refinePrompt: string;
  setRefinePrompt: (v: string) => void;
  isGenerating: boolean;
  isRefining: boolean;
  errorMessage: string | null;
  officeImporting: boolean;
  pdfImporting: boolean;
  handleAIGenerate: (customPrompt?: string) => Promise<void> | void;
  handleAIRefine: () => Promise<void> | void;
  handleOfficeFileImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  handlePDFToBlocksImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}

export default function SidebarAiComposer({
  promptInput,
  setPromptInput,
  refinePrompt,
  setRefinePrompt,
  isGenerating,
  isRefining,
  errorMessage,
  officeImporting,
  pdfImporting,
  handleAIGenerate,
  handleAIRefine,
  handleOfficeFileImport,
  handlePDFToBlocksImport
}: SidebarAiComposerProps) {
  return (
    <div className="space-y-4 flex-grow flex flex-col justify-between select-text">
      
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-505 flex items-center gap-1.5">
            <FilePlus className="w-4 h-4 text-indigo-500" />
            <span>Khởi tạo văn bản thô</span>
          </span>
        </div>

        <div className="space-y-3 font-sans">
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Ví dụ: Lập biên bản bàn giao thiết bị phòng máy và dự toán ngân sách..."
            className="w-full bg-slate-50 border border-slate-205 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 min-h-[90px] focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all resize-none leading-relaxed"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAIGenerate())}
          />
          <button
            onClick={() => handleAIGenerate()}
            disabled={isGenerating || !promptInput.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang thiết kế tạo lập...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Thiết kế văn bản AI</span>
              </>
            )}
          </button>

          {/* Advanced Document Reader inputs (Drag and drop manual picker) */}
          <div className="relative font-sans select-none">
            <input
              type="file"
              onChange={handleOfficeFileImport}
              accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.csv,.pdf,.html,.json"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={officeImporting || pdfImporting}
            />
            <button
              disabled={officeImporting || pdfImporting}
              className="w-full bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200 disabled:opacity-50 text-indigo-700 font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {officeImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Đang chuyển cấu trúc tệp...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Nhập tệp Office / Văn bản</span>
                </>
              )}
            </button>
          </div>

          {/* Dedicated Specialized PDF Scanning system */}
          <div className="relative font-sans select-none">
            <input
              type="file"
              onChange={handlePDFToBlocksImport}
              accept="application/pdf"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={officeImporting || pdfImporting}
            />
            <button
              disabled={officeImporting || pdfImporting}
              className="w-full bg-white hover:bg-slate-50 border border-slate-205 disabled:opacity-50 text-slate-700 font-bold text-xs py-2 rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {pdfImporting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                  <span>Giải mã nội dung PDF...</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3 text-slate-500" />
                  <span>Bộ quét phân tích PDF (OCR)</span>
                </>
              )}
            </button>
          </div>

          {errorMessage && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-lg font-medium">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Smart Refine Form */}
      <div className="space-y-3 border-t border-slate-100 pt-5 mt-auto">
        <div className="flex items-center justify-between pb-2 select-none">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-505 flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4 text-emerald-500" />
            <span>Hiệu chỉnh tài chính và hành chính</span>
          </span>
        </div>

        <div className="space-y-3 font-sans">
          <textarea
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            placeholder="Ví dụ: Thêm chi phí dự phòng 15% vào dòng cuối cùng và diễn giải lại phần kết luận..."
            className="w-full bg-slate-50 border border-slate-205 rounded-xl p-3 text-xs text-slate-805 placeholder-slate-400 min-h-[90px] focus:outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all resize-none leading-relaxed"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAIRefine())}
          />
          <button
            onClick={handleAIRefine}
            disabled={isRefining || !refinePrompt.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isRefining ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang cập nhật AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Cập nhật toàn khóa tự động</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
