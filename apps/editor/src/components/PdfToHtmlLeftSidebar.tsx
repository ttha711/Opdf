import React from "react";
import { 
  FileText, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  FileUp, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  Loader2, 
  ChevronUp, 
  ChevronDown, 
  Copy, 
  Plus, 
  FilePlus 
} from "lucide-react";
import { PageResult } from "../types";
import { cn } from "../lib/utils";
import PdfToHtmlPageQueueItem from "./PdfToHtmlPageQueueItem";
import PdfToHtmlLeftSidebarControls from "./PdfToHtmlLeftSidebarControls";

interface PdfToHtmlLeftSidebarProps {
  pdfPages: PageResult[];
  activePdfPageIdx: number;
  setActivePdfPageIdx: (idx: number) => void;
  pdfFile: File | null;
  pdfImporting: boolean;
  pdfProgress: { current: number; total: number };
  pdfTranslateState: "idle" | "running" | "paused";
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isAppendingFiles: boolean;
  appendProgress: { current: number; total: number };
  
  handleClosePDF: () => void;
  handlePDFUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAppendIncomingFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  convertSinglePage: (idx: number) => void;
  convertAllPages: () => void;
  stopAllPages: () => void;
  cancelAllPages: () => void;
  setSelectedPdfSelection: (sel: any) => void;
  
  handleMovePage: (idx: number, direction: "up" | "down") => void;
  handleClonePage: (idx: number) => void;
  handleDeletePage: (idx: number) => void;
  handleAddEmptyPage: () => void;
  translateToVietnamese?: boolean;
  setTranslateToVietnamese?: (val: boolean) => void;
  useTailwindLayout?: boolean;
  setUseTailwindLayout?: (val: boolean) => void;
}

export default function PdfToHtmlLeftSidebar({
  pdfPages,
  activePdfPageIdx,
  setActivePdfPageIdx,
  pdfFile,
  pdfImporting,
  pdfProgress,
  pdfTranslateState,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isAppendingFiles,
  appendProgress,
  handleClosePDF,
  handlePDFUpload,
  handleAppendIncomingFiles,
  convertSinglePage,
  convertAllPages,
  stopAllPages,
  cancelAllPages,
  setSelectedPdfSelection,
  handleMovePage,
  handleClonePage,
  handleDeletePage,
  handleAddEmptyPage,
  translateToVietnamese,
  setTranslateToVietnamese,
  useTailwindLayout,
  setUseTailwindLayout,
}: PdfToHtmlLeftSidebarProps) {
  return (
    <aside className={cn(
      "bg-white border-r border-slate-200 flex flex-col justify-between overflow-y-auto shrink-0 transition-all duration-300 h-full select-none",
      isSidebarCollapsed ? "w-full lg:w-[68px] p-2" : "w-full lg:w-76 p-5"
    )}>
      <div className="space-y-4">
        <div className={cn(
          "flex items-center justify-between pb-2 border-b border-slate-100",
          isSidebarCollapsed ? "flex-col gap-2" : "flex-row"
        )}>
          {!isSidebarCollapsed && (
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span>Trang tài liệu</span>
            </span>
          )}
          {pdfPages.length > 0 && (
            <button
              onClick={handleClosePDF}
              className={cn(
                "flex items-center gap-1 px-1.5 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg font-semibold transition-all cursor-pointer",
                isSidebarCollapsed ? "p-1 bg-red-50 text-red-655" : ""
              )}
              title="Hủy/Đóng tệp tài liệu này"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {!isSidebarCollapsed && <span className="text-[10px]">Hủy tệp</span>}
            </button>
          )}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors cursor-pointer"
            title={isSidebarCollapsed ? "Mở rộng thanh bên" : "Thu nhỏ thanh bên"}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
          {!isSidebarCollapsed && (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">Trực quan</span>
          )}
        </div>

        {/* Clean Upload Dropzone */}
        {pdfPages.length === 0 && (
          isSidebarCollapsed ? (
            <label className={cn(
              "flex flex-col items-center justify-center p-2 border border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-white rounded-xl text-center group cursor-pointer transition-all",
              pdfImporting ? "opacity-60 pointer-events-none" : ""
            )}>
              <FileUp className="w-5 h-5 text-slate-400 group-hover:text-indigo-505 transition-colors" />
              <input type="file" accept="application/pdf" className="hidden" onChange={handlePDFUpload} disabled={pdfImporting} />
            </label>
          ) : (
            <label className={cn(
              "flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-white rounded-xl text-center group cursor-pointer transition-all",
              pdfImporting ? "opacity-60 pointer-events-none" : ""
            )}>
              <FileUp className="w-8 h-8 text-slate-400 group-hover:text-indigo-505 transition-colors mb-2" />
              <span className="text-xs font-semibold text-slate-700">
                {pdfImporting ? `Đang nạp file (${pdfProgress.current}/${pdfProgress.total})...` : "Chọn file tài liệu PDF"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Hệ thống bóc tách tự động</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={handlePDFUpload} disabled={pdfImporting} />
            </label>
          )
        )}

        {/* Converted Pages Queue List */}
        {pdfPages.length > 0 && (
          <div className="space-y-3">
            {!isSidebarCollapsed ? (
              <>
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400">
                  <span>Trang khả dụng:</span>
                  <div className="flex gap-1">
                    {pdfTranslateState === "idle" || pdfTranslateState === "paused" ? (
                      <button 
                        onClick={convertAllPages}
                        className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-medium cursor-pointer"
                      >
                        {pdfTranslateState === "paused" ? "Tiếp tục" : "Bắt đầu chuyển đổi"}
                      </button>
                    ) : (
                      <button 
                        onClick={stopAllPages}
                        className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-md hover:bg-amber-600 hover:text-white transition-all text-[10px] font-medium cursor-pointer"
                      >
                        Dừng
                      </button>
                    )}
                    {(pdfTranslateState === "paused" || pdfTranslateState === "running") && (
                      <button 
                        onClick={cancelAllPages}
                        className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-md hover:bg-red-655 hover:text-white transition-all text-[10px] font-medium cursor-pointer"
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </div>

                {/* Toggles for Translation and Layout Options */}
                <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 space-y-2.5 text-xs text-slate-600 select-none">
                  <label className="flex items-center gap-2.5 cursor-pointer font-medium hover:text-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(translateToVietnamese)}
                      onChange={(e) => setTranslateToVietnamese?.(e.target.checked)}
                      className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Dịch sang Tiếng Việt</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer font-medium hover:text-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(useTailwindLayout)}
                      onChange={(e) => setUseTailwindLayout?.(e.target.checked)}
                      className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Bố cục đẹp (Tailwind)</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 max-h-[45vh] overflow-y-auto pr-1">
                  {pdfPages.map((page, idx) => (
                    <PdfToHtmlPageQueueItem
                      key={page.pageNumber}
                      page={page}
                      idx={idx}
                      activePdfPageIdx={activePdfPageIdx}
                      setActivePdfPageIdx={setActivePdfPageIdx}
                      setSelectedPdfSelection={setSelectedPdfSelection}
                      pdfPages={pdfPages}
                      handleMovePage={handleMovePage}
                      handleClonePage={handleClonePage}
                      handleDeletePage={handleDeletePage}
                      convertSinglePage={convertSinglePage}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center w-full">
                <div className="flex flex-col gap-2 items-center justify-center py-2 border-b border-slate-100 w-full mb-3">
                  {pdfTranslateState === "idle" || pdfTranslateState === "paused" ? (
                    <button 
                      onClick={convertAllPages}
                      className="p-1.5 bg-indigo-55 text-indigo-605 hover:bg-indigo-600 hover:text-white rounded-lg transition-all border border-indigo-100 cursor-pointer animate-none"
                      title={pdfTranslateState === "paused" ? "Tiếp tục" : "Chuyển đổi tất cả"}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button 
                      onClick={stopAllPages}
                      className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white rounded-lg transition-all border border-amber-100 cursor-pointer"
                      title="Dừng"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    </button>
                  )}
                  {(pdfTranslateState === "paused" || pdfTranslateState === "running") && (
                    <button 
                      onClick={cancelAllPages}
                      className="p-1.5 bg-red-50 text-red-650 hover:bg-red-600 hover:text-white rounded-lg transition-all border border-red-100 cursor-pointer mt-1"
                      title="Hủy"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2 max-h-[42vh] overflow-y-auto w-full py-1">
                  {pdfPages.map((page, idx) => {
                    const isActive = activePdfPageIdx === idx;
                    let statusBg = "bg-slate-50 hover:bg-slate-150 text-slate-700 border-slate-205";
                    if (isActive) {
                      statusBg = "bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-500/15";
                    } else if (page.status === "done") {
                      statusBg = "bg-emerald-50 text-emerald-700 border-emerald-105 hover:bg-emerald-100";
                    } else if (page.status === "converting") {
                      statusBg = "bg-indigo-50 text-indigo-700 border-indigo-105 hover:bg-indigo-100";
                    } else if (page.status === "error") {
                      statusBg = "bg-red-50 text-red-700 border-red-105 hover:bg-red-100";
                    }
                    
                    return (
                      <button
                        key={page.pageNumber}
                        onClick={() => {
                          setActivePdfPageIdx(idx);
                          setSelectedPdfSelection(null);
                        }}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all cursor-pointer relative",
                          statusBg
                        )}
                        title={`Trang ${page.pageNumber} (${page.status === "done" ? "Đã nạp" : page.status === "converting" ? "Đang đọc" : page.status === "error" ? "Lỗi" : "Chờ đồng bộ"})`}
                      >
                        {page.status === "converting" ? (
                          <Loader2 className="w-3 h-3 animate-spin absolute" />
                        ) : (
                          <span>{page.pageNumber}</span>
                        )}
                        
                        {!isActive && page.status === "done" && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 border border-white" />
                        )}
                        {!isActive && page.status === "error" && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 border border-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* THE PAGE CONTROLS AND FILE APPENDING BUTTONS CONTAINER */}
            <PdfToHtmlLeftSidebarControls
              isSidebarCollapsed={isSidebarCollapsed}
              handleAddEmptyPage={handleAddEmptyPage}
              handleAppendIncomingFiles={handleAppendIncomingFiles}
              isAppendingFiles={isAppendingFiles}
              appendProgress={appendProgress}
            />

          </div>
        )}
      </div>

      {/* Minimal Support footer */}
      <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400">
        {isSidebarCollapsed ? (
          <span className="block text-center font-bold text-indigo-505">AI</span>
        ) : (
          <span>Chạy trên nền tảng Gemini 3.5 Flash</span>
        )}
      </div>
    </aside>
  );
}
