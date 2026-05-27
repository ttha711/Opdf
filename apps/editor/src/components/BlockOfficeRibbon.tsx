import React from "react";
import { Columns, Command, Eye, FileText, HelpCircle, PenTool } from "lucide-react";
import { DocumentBlock } from "../types";
import { cn } from "../lib/utils";
import RibbonHomeTab from "./RibbonHomeTab";
import RibbonInsertTab from "./RibbonInsertTab";
import RibbonLayoutTab from "./RibbonLayoutTab";
import RibbonAiTab from "./RibbonAiTab";

interface BlockOfficeRibbonProps {
  ribbonTab: "home" | "insert" | "layout" | "ai" | "help";
  setRibbonTab: React.Dispatch<React.SetStateAction<"home" | "insert" | "layout" | "ai" | "help">>;
  executeFormat: (cmd: string, val?: string) => void;
  insertHtmlAtCursor: (html: string) => void;
  handleAiQuickAction: (docPrompt: string) => Promise<void>;
  isRefiningAi: boolean;
  docMargin: "normal" | "narrow" | "wide";
  setDocMargin: (margin: "normal" | "narrow" | "wide") => void;
  docLandscape: boolean;
  setDocLandscape: (val: boolean) => void;
  docTheme: "corporate" | "minimalist" | "warm" | "modern";
  setDocTheme: (theme: "corporate" | "minimalist" | "warm" | "modern") => void;
  insertNewBlock: (id: string, type: DocumentBlock["type"]) => void;
  selectedBlockId: string | null;
  wordViewMode: "rich" | "blocks";
  setWordViewMode: (mode: "rich" | "blocks") => void;
  openCommandMenu: () => void;
  editorMode?: "legacy" | "tiptap";
  toggleEditorMode?: () => void;
}

export default function BlockOfficeRibbon({
  ribbonTab,
  setRibbonTab,
  executeFormat,
  insertHtmlAtCursor,
  handleAiQuickAction,
  isRefiningAi,
  docMargin,
  setDocMargin,
  docLandscape,
  setDocLandscape,
  docTheme,
  setDocTheme,
  insertNewBlock,
  selectedBlockId,
  wordViewMode,
  setWordViewMode,
  openCommandMenu,
  editorMode,
  toggleEditorMode
}: BlockOfficeRibbonProps) {
  const [hasOpenMenu, setHasOpenMenu] = React.useState(false);
  const tabs = [
    { id: "home", label: "Trang chủ" },
    { id: "insert", label: "Chèn" },
    { id: "layout", label: "Bố trí" },
    { id: "ai", label: "AI" },
    { id: "help", label: "Trợ giúp" }
  ] as const;

  return (
    <div className="bg-white border-b border-slate-200 shadow-xs shrink-0 print:hidden select-none font-sans sticky top-0 z-20 w-full flex flex-col">
      {/* Row 1: Ribbon Tab Headers & View Switcher */}
      <div className="flex flex-nowrap items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100 overflow-x-auto select-none no-scrollbar justify-between">
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-slate-200/80 p-0.5 rounded-md border border-slate-300/60 items-center whitespace-nowrap">
            <button
              type="button"
              onClick={() => setWordViewMode("rich")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer",
                wordViewMode === "rich" ? "bg-white text-slate-950 shadow-3xs" : "text-slate-550 hover:text-slate-950"
              )}
              title="Chế độ Soạn tự do (Google Docs Style)"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              <span>Soạn thảo</span>
            </button>
            <button
              type="button"
              onClick={() => setWordViewMode("blocks")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer",
                wordViewMode === "blocks" ? "bg-white text-slate-950 shadow-3xs" : "text-slate-550 hover:text-slate-950"
              )}
              title="Chế độ chỉnh sửa khối (A4 Blocks View)"
            >
              <Columns className="w-3.5 h-3.5 text-indigo-600" />
              <span>Khối A4</span>
            </button>
          </div>

          {/* TipTap Toggle (only visible in rich mode) */}
          {wordViewMode === "rich" && toggleEditorMode && (
            <button
              type="button"
              onClick={toggleEditorMode}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer border",
                editorMode === "tiptap"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
              )}
              title={editorMode === "tiptap" ? "Đang dùng TipTap Pro (bấm để quay lại)" : "Dùng TipTap Pro editor"}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>TipTap {editorMode === "tiptap" ? "Pro" : "Off"}</span>
            </button>
          )}

          <div className="h-4 w-px bg-slate-300 mx-1 shrink-0" />

          {/* Ribbon Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRibbonTab(tab.id)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer border border-transparent hover:bg-slate-200/60 whitespace-nowrap",
                  ribbonTab === tab.id ? "bg-indigo-55 text-indigo-700 border-indigo-100 font-bold" : "text-slate-600"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={openCommandMenu}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-705 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          title="Command menu (Ctrl + K)"
        >
          <Command className="w-3.5 h-3.5" />
          <span>Command</span>
        </button>
      </div>

      {/* Row 2: Selected Tab Content */}
      <div className={cn(
        "flex flex-nowrap items-center gap-3 px-4 py-2 bg-white no-scrollbar min-h-[44px]",
        hasOpenMenu ? "overflow-visible z-30" : "overflow-x-auto z-10"
      )}>
        {ribbonTab === "home" && <RibbonHomeTab executeFormat={executeFormat} onMenuToggle={setHasOpenMenu} />}

        {ribbonTab === "insert" && (
          <RibbonInsertTab
            insertHtmlAtCursor={insertHtmlAtCursor}
            insertNewBlock={insertNewBlock}
            selectedBlockId={selectedBlockId}
            onMenuToggle={setHasOpenMenu}
          />
        )}

        {ribbonTab === "layout" && (
          <RibbonLayoutTab
            docMargin={docMargin}
            setDocMargin={setDocMargin}
            docLandscape={docLandscape}
            setDocLandscape={setDocLandscape}
            docTheme={docTheme}
            setDocTheme={setDocTheme}
          />
        )}

        {ribbonTab === "ai" && (
          <RibbonAiTab
            handleAiQuickAction={handleAiQuickAction}
            isRefiningAi={isRefiningAi}
            onMenuToggle={setHasOpenMenu}
          />
        )}

        {ribbonTab === "help" && (
          <div className="flex items-center gap-2 text-xs text-slate-605 font-medium whitespace-nowrap">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>Ctrl+B đậm, Ctrl+I nghiêng, Ctrl+U gạch chân</span>
          </div>
        )}
      </div>
    </div>
  );
}
