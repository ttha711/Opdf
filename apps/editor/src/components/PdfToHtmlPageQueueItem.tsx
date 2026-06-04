import React from "react";
import { 
  ChevronUp, 
  ChevronDown, 
  Copy, 
  Trash2, 
  Loader2 
} from "lucide-react";
import { PageResult } from "../types";
import { cn } from "../lib/utils";

interface PdfToHtmlPageQueueItemProps {
  key?: React.Key;
  page: PageResult;
  idx: number;
  activePdfPageIdx: number;
  setActivePdfPageIdx: (idx: number) => void;
  setSelectedPdfSelection: (sel: any) => void;
  pdfPages: PageResult[];
  handleMovePage: (idx: number, direction: "up" | "down") => void;
  handleClonePage: (idx: number) => void;
  handleDeletePage: (idx: number) => void;
  convertSinglePage: (idx: number) => void;
}

export default function PdfToHtmlPageQueueItem({
  page,
  idx,
  activePdfPageIdx,
  setActivePdfPageIdx,
  setSelectedPdfSelection,
  pdfPages,
  handleMovePage,
  handleClonePage,
  handleDeletePage,
  convertSinglePage
}: PdfToHtmlPageQueueItemProps) {
  const isActive = activePdfPageIdx === idx;

  return (
    <div
      onClick={() => {
        setActivePdfPageIdx(idx);
        setSelectedPdfSelection(null);
      }}
      className={cn(
        "group p-1.5 rounded-xl border cursor-pointer transition-all flex flex-col bg-white overflow-hidden relative text-left",
        isActive 
          ? "border-indigo-600 shadow-md ring-1 ring-indigo-500/15" 
          : "border-slate-200 hover:border-slate-350 hover:shadow-xs"
      )}
    >
      {/* Paper mockup preview wrapper */}
      <div className="relative w-full aspect-[1/1.414] rounded-lg overflow-hidden bg-slate-50 border border-slate-100 select-none shrink-0">
        <img 
          src={page.imageUrl} 
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" 
          alt={`Trang ${page.pageNumber}`}
          referrerPolicy="no-referrer" 
        />
        {/* Page tag floating on thumbnail */}
        <div className="absolute top-1 left-1 bg-slate-900/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs font-sans">
          P.{page.pageNumber}
        </div>
      </div>

      {/* Info and interactive action row */}
      <div className="flex flex-col gap-1 mt-1.5 px-0.5 w-full">
        <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
          <span className="text-[11px] font-bold text-slate-700 truncate font-sans">Trang {page.pageNumber}</span>
          <div className="flex items-center gap-1 shrink-0">
            {page.status === "done" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
            {page.status === "converting" && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            )}
            {page.status === "error" && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </div>
        </div>

        {/* Tiny Page Actions Row */}
        <div className="flex items-center justify-between border-y border-slate-100 py-1 my-0.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMovePage(idx, "up");
              }}
              disabled={idx === 0}
              className="p-1 hover:bg-slate-100 disabled:opacity-20 disabled:hover:bg-transparent text-slate-500 rounded transition-colors cursor-pointer"
              title="Di chuyển trang lên"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMovePage(idx, "down");
              }}
              disabled={idx === pdfPages.length - 1}
              className="p-1 hover:bg-slate-100 disabled:opacity-20 disabled:hover:bg-transparent text-slate-500 rounded transition-colors cursor-pointer"
              title="Di chuyển trang xuống"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClonePage(idx);
              }}
              className="p-1 hover:bg-indigo-55 text-indigo-600 hover:text-indigo-700 rounded transition-colors cursor-pointer"
              title="Nhân bản trang này"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePage(idx);
              }}
              className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded transition-all cursor-pointer"
              title="Xóa trang này"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Primary dynamic trigger button based on status */}
        <div className="h-6 flex items-center w-full">
          {page.status === "pending" && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                convertSinglePage(idx);
              }}
              className="w-full text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100/50 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 py-0.5 rounded-md font-bold transition-all text-center cursor-pointer font-sans"
            >
              Đọc dữ liệu
            </button>
          )}
          {page.status === "converting" && (
            <span className="text-[9px] text-indigo-605 font-bold bg-indigo-50 border border-indigo-100/50 w-full py-0.5 rounded-md flex items-center justify-center gap-1 font-sans">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Đọc...
            </span>
          )}
          {page.status === "done" && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                convertSinglePage(idx);
              }}
              className="w-full text-[9.5px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 py-0.5 rounded-md flex items-center justify-center gap-1 font-sans cursor-pointer transition-all"
              title="Nhấp để dịch lại trang này bằng AI"
            >
              Đã nạp ✓
            </button>
          )}
          {page.status === "error" && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                convertSinglePage(idx);
              }}
              className="w-full text-[9px] text-red-650 bg-red-50 border border-red-155 px-1 py-0.5 rounded-md hover:bg-red-650 hover:text-white font-semibold transition-all text-center cursor-pointer font-sans"
            >
              Thử lại
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
