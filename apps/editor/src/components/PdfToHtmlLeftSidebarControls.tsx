import React from "react";
import { Plus, FilePlus, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

interface PdfToHtmlLeftSidebarControlsProps {
  isSidebarCollapsed: boolean;
  handleAddEmptyPage: () => void;
  handleAppendIncomingFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isAppendingFiles: boolean;
  appendProgress: { current: number; total: number };
}

export default function PdfToHtmlLeftSidebarControls({
  isSidebarCollapsed,
  handleAddEmptyPage,
  handleAppendIncomingFiles,
  isAppendingFiles,
  appendProgress
}: PdfToHtmlLeftSidebarControlsProps) {
  return (
    <div className={cn(
      "mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2",
      isSidebarCollapsed ? "items-center" : ""
    )}>
      {!isSidebarCollapsed ? (
        <>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider text-left">Thao tác tài liệu</div>
          
          <div className="grid grid-cols-2 gap-2">
            {/* Button 1: Add manual page */}
            <button
              type="button"
              onClick={handleAddEmptyPage}
              className="flex items-center justify-center gap-1.5 p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-100/30 hover:border-indigo-200 transition-all cursor-pointer active:scale-95 text-center"
              title="Thêm một trang trống vào tài liệu"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>+ Trang trống</span>
            </button>

            {/* Button 2: Append external file */}
            <label className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 hover:border-slate-350 cursor-pointer transition-all active:scale-95 text-center">
              <FilePlus className="w-4 h-4 text-slate-505" />
              <span>+ Chèn file</span>
              <input 
                type="file" 
                multiple 
                accept="application/pdf,image/*,text/plain,text/html" 
                onChange={handleAppendIncomingFiles} 
                className="hidden" 
                disabled={isAppendingFiles}
              />
            </label>
          </div>

          {isAppendingFiles && (
            <div className="p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-lg flex items-center gap-2.5 text-left">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <div className="flex-1">
                <div className="text-[10px] font-bold text-indigo-700">Đang chèn thêm tệp...</div>
                <div className="text-[9px] text-slate-500 font-sans">Tiến trình: {appendProgress.current}/{appendProgress.total} file</div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 w-full pt-2">
          <button
            type="button"
            onClick={handleAddEmptyPage}
            className="p-1.5 bg-indigo-55 hover:bg-indigo-100 rounded-lg text-indigo-600 border border-indigo-100 cursor-pointer transition-colors"
            title="Thêm trang trống"
          >
            <Plus className="w-4 h-4" />
          </button>

          <label className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-202 cursor-pointer transition-colors flex items-center justify-center">
            <FilePlus className="w-4 h-4" />
            <input 
              type="file" 
              multiple 
              accept="application/pdf,image/*,text/plain,text/html" 
              onChange={handleAppendIncomingFiles} 
              className="hidden" 
              disabled={isAppendingFiles}
            />
          </label>
        </div>
      )}
    </div>
  );
}
