import React from "react";
import { Eye, Columns, Search, Command, PenTool } from "lucide-react";
import { cn } from "../lib/utils";
import { DocumentBlock, TableCell, AIParsedDocument } from "../types";
import BlockOfficeRibbon from "./BlockOfficeRibbon";
import BlockOfficeWordBlocksView from "./BlockOfficeWordBlocksView";
import TipTapWordEditor from "./TipTapWordEditor";
import { compileBlocksToHtml } from "../lib/blockOfficeUtils";

interface BlockOfficeWordViewProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  
  // Word editable state
  editorHtml: string;
  setEditorHtml: (html: string) => void;
  docMargin: "normal" | "narrow" | "wide";
  setDocMargin: (v: "normal" | "narrow" | "wide") => void;
  docLandscape: boolean;
  setDocLandscape: (v: boolean) => void;
  docTheme: "corporate" | "minimalist" | "warm" | "modern";
  setDocTheme: (v: "corporate" | "minimalist" | "warm" | "modern") => void;
  editorRef: React.RefObject<HTMLDivElement>;
  isUserEditingRef: React.MutableRefObject<boolean>;
  syncTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  executeFormat: (cmd: string, val?: string) => void;
  insertHtmlAtCursor: (html: string) => void;
  handleAiQuickAction: (docPrompt: string) => Promise<void>;
  isRefiningAi: boolean;
  ribbonTab: "home" | "insert" | "layout" | "ai" | "help";
  setRibbonTab: React.Dispatch<React.SetStateAction<"home" | "insert" | "layout" | "ai" | "help">>;
  
  // State methods
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  insertNewBlock: (afterId: string, type: DocumentBlock["type"]) => void;
  paginateBlocks: (blocks: DocumentBlock[]) => DocumentBlock[][];
  renderInteractiveChart: (block: DocumentBlock) => React.ReactNode;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;

  // Dual layout toggler
  wordViewMode: "rich" | "blocks";
  setWordViewMode: (mode: "rich" | "blocks") => void;

  // Keyboard and typing handlers
  onInput: (e: React.FormEvent<HTMLDivElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  showFindReplace: boolean;
  setShowFindReplace: (open: boolean) => void;
  findNext: (query: string) => boolean;
  replaceOne: (findText: string, replaceText: string) => boolean;
  replaceAll: (findText: string, replaceText: string) => number;
  pendingAiPreviewHtml: string | null;
  applyAiPreview: () => void;
  rejectAiPreview: () => void;
}

export default function BlockOfficeWordView({
  currentDoc,
  setCurrentDoc,
  selectedBlockId,
  setSelectedBlockId,
  editorHtml,
  setEditorHtml,
  docMargin,
  setDocMargin,
  docLandscape,
  setDocLandscape,
  docTheme,
  setDocTheme,
  editorRef,
  isUserEditingRef,
  executeFormat,
  insertHtmlAtCursor,
  handleAiQuickAction,
  isRefiningAi,
  ribbonTab,
  setRibbonTab,
  moveBlock,
  duplicateBlock,
  deleteBlock,
  insertNewBlock,
  paginateBlocks,
  renderInteractiveChart,
  evaluateFormula,
  wordViewMode,
  setWordViewMode,
  onInput,
  onBlur,
  onKeyDown,
  showFindReplace,
  setShowFindReplace,
  findNext,
  replaceOne,
  replaceAll,
  pendingAiPreviewHtml,
  applyAiPreview,
  rejectAiPreview
}: BlockOfficeWordViewProps) {
  const [showCommandMenu, setShowCommandMenu] = React.useState(false);
  const [findText, setFindText] = React.useState("");
  const [replaceText, setReplaceText] = React.useState("");
  const [floatingCoords, setFloatingCoords] = React.useState<{ top: number; left: number } | null>(null);
  const [editorMode, setEditorMode] = React.useState<"legacy" | "tiptap">(
    () => (localStorage.getItem("USE_TIPTAP") === "true" ? "tiptap" : "legacy")
  );

  const toggleEditorMode = () => {
    setEditorMode((prev) => {
      const next = prev === "legacy" ? "tiptap" : "legacy";
      localStorage.setItem("USE_TIPTAP", next === "tiptap" ? "true" : "false");
      return next;
    });
  };

  const selectedBlock = currentDoc.blocks.find(b => b.id === selectedBlockId);
  const globalIdx = selectedBlock ? currentDoc.blocks.findIndex(b => b.id === selectedBlockId) : -1;

  const getBlockTypeLabel = (blockType: string) => {
    switch (blockType) {
      case "heading": return `TIÊU ĐỀ H${selectedBlock?.meta?.level || 2}`;
      case "callout": return "Lưu ý";
      case "table": return "Bảng dữ liệu";
      case "chart": return "Biểu đồ";
      case "slide": return "Trang Slide";
      case "page-break": return "Ngắt trang";
      default: return "Đoạn văn";
    }
  };

  React.useEffect(() => {
    const updateCoords = () => {
      if (wordViewMode === "rich" && selectedBlockId && editorRef.current) {
        const blockEl = editorRef.current.querySelector(`[data-block-id="${selectedBlockId}"]`) as HTMLElement | null;
        const parentEl = editorRef.current.parentElement as HTMLElement | null;
        if (blockEl && parentEl) {
          const rect = blockEl.getBoundingClientRect();
          const parentRect = parentEl.getBoundingClientRect();
          const top = rect.top - parentRect.top;
          const left = rect.left - parentRect.left + rect.width / 2;
          setFloatingCoords({ top, left });
        } else {
          setFloatingCoords(null);
        }
      } else {
        setFloatingCoords(null);
      }
    };

    updateCoords();

    // Small delay to allow react and DOM rendering/pagination to settle
    const timeoutId = setTimeout(updateCoords, 60);

    window.addEventListener("resize", updateCoords);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateCoords);
    };
  }, [selectedBlockId, wordViewMode, editorHtml]);

  // Synchronize editor innerHTML safely when editorHtml updates or component is active
  React.useEffect(() => {
    if (wordViewMode === "rich" && editorRef.current && !isUserEditingRef.current) {
      if (editorRef.current.innerHTML !== editorHtml) {
        editorRef.current.innerHTML = editorHtml;
      }
    }
  }, [editorHtml, wordViewMode]);

  React.useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandMenu(prev => !prev);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  return (
    <div className="w-full flex flex-col h-full bg-slate-100/55 scrollbar-thin select-text" id="wp-rich-editor-wrapper">
      
      {/* 1. PERSISTENT FORMATTING RIBBON */}
      <BlockOfficeRibbon
        ribbonTab={ribbonTab}
        setRibbonTab={setRibbonTab}
        executeFormat={executeFormat}
        insertHtmlAtCursor={insertHtmlAtCursor}
        handleAiQuickAction={handleAiQuickAction}
        isRefiningAi={isRefiningAi}
        docMargin={docMargin}
        setDocMargin={setDocMargin}
        docLandscape={docLandscape}
        setDocLandscape={setDocLandscape}
        docTheme={docTheme}
        setDocTheme={setDocTheme}
        insertNewBlock={insertNewBlock}
        selectedBlockId={selectedBlockId}
        wordViewMode={wordViewMode}
        setWordViewMode={setWordViewMode}
        openCommandMenu={() => setShowCommandMenu(true)}
        editorMode={editorMode}
        toggleEditorMode={toggleEditorMode}
      />

      {/* Dynamic Highlight Styles for Selected Block inside WYSIWYG */}
      {selectedBlockId && (
        <style>{`
          [data-block-id="${selectedBlockId}"] {
            outline: 2px solid #4f46e5 !important;
            background-color: rgba(79, 70, 229, 0.02) !important;
            border-radius: 4px;
            padding: 4px;
            transition: all 0.25s ease;
          }
        `}</style>
      )}

      {showFindReplace && (
        <div className="px-5 py-2 bg-white border-b border-slate-200 flex items-center gap-2 print:hidden">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find text"
            className="h-8 px-2 text-xs border border-slate-300 rounded-md w-56"
          />
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with"
            className="h-8 px-2 text-xs border border-slate-300 rounded-md w-56"
          />
          <button type="button" onClick={() => findNext(findText)} className="h-8 px-2.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Find Next</button>
          <button type="button" onClick={() => replaceOne(findText, replaceText)} className="h-8 px-2.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Replace</button>
          <button type="button" onClick={() => replaceAll(findText, replaceText)} className="h-8 px-2.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer">Replace All</button>
          <button type="button" onClick={() => setShowFindReplace(false)} className="h-8 px-2.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Close</button>
        </div>
      )}
      {pendingAiPreviewHtml && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 print:hidden">
          <span className="text-xs text-amber-800 font-semibold">AI preview is ready</span>
          <button type="button" onClick={applyAiPreview} className="h-8 px-2.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">Accept</button>
          <button type="button" onClick={rejectAiPreview} className="h-8 px-2.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Reject</button>
        </div>
      )}
      {showCommandMenu && (
        <div className="fixed inset-0 bg-slate-900/40 z-40 flex items-start justify-center pt-28 print:hidden">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl p-3">
            <div className="text-xs font-semibold text-slate-500 px-1 pb-2">Command Menu</div>
            <div className="grid gap-1">
              <button type="button" onClick={() => { setShowFindReplace(true); setShowCommandMenu(false); }} className="text-left px-3 py-2 rounded-md hover:bg-slate-100 text-sm cursor-pointer">Open Find / Replace</button>
              <button type="button" onClick={() => { setRibbonTab("home"); setShowCommandMenu(false); }} className="text-left px-3 py-2 rounded-md hover:bg-slate-100 text-sm cursor-pointer">Go to Home toolbar</button>
              <button type="button" onClick={() => { setRibbonTab("insert"); setShowCommandMenu(false); }} className="text-left px-3 py-2 rounded-md hover:bg-slate-100 text-sm cursor-pointer">Go to Insert toolbar</button>
              <button type="button" onClick={() => { setRibbonTab("ai"); setShowCommandMenu(false); }} className="text-left px-3 py-2 rounded-md hover:bg-slate-100 text-sm cursor-pointer">Go to AI toolbar</button>
            </div>
            <div className="pt-2">
              <button type="button" onClick={() => setShowCommandMenu(false)} className="h-8 px-2.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. RENDER SWITCHABLE VIEWS */}
      {wordViewMode === "rich" ? (
        editorMode === "tiptap" ? (
          <TipTapWordEditor
            currentDoc={currentDoc}
            onDocChange={(blocks) => {
              setCurrentDoc((prev) => ({ ...prev, blocks }));
            }}
            selectedBlockId={selectedBlockId}
            onBlockSelect={setSelectedBlockId}
          />
        ) : (
        <div className="flex-grow overflow-y-auto px-3 pt-2 pb-4 md:px-5 md:pt-3 flex items-start justify-center text-slate-850 scrollbar-thin select-text min-h-[500px]">
          <div className="relative w-full flex justify-center pt-12 pb-4">
            <div
              ref={editorRef}
              contentEditable={true}
              suppressContentEditableWarning={true}
              onInput={onInput}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const blockEl = target.closest("[data-block-id]");
                if (blockEl) {
                  const blockId = blockEl.getAttribute("data-block-id");
                  if (blockId) {
                    setSelectedBlockId(blockId);
                  }
                } else {
                  setSelectedBlockId(null);
                }
              }}
              className={`transition-all duration-200 bg-white shadow-xl relative border border-slate-200 focus:shadow-2xl hover:shadow-2xl outline-none select-text resize-none leading-relaxed p-[20mm] text-slate-850 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-305
                ${docMargin === "narrow" ? "p-8" : docMargin === "wide" ? "p-[30mm]" : "p-[22mm]"}
                ${docLandscape ? "w-full max-w-4xl min-h-[660px]" : "w-full max-w-3xl min-h-[1050px]"}
                ${docTheme === "modern" ? "font-sans text-slate-800" : docTheme === "warm" ? "font-serif text-amber-955 bg-amber-50/5" : docTheme === "minimalist" ? "font-mono text-neutral-900" : "font-sans text-zinc-900"}
              `}
              style={{
                pageBreakInside: "avoid"
              }}
              title="Bàn gõ soạn thảo văn bản Word Online chuẩn quốc gia"
            />

            {/* FLOATING MENU FOR WYSIWYG BLOCK */}
            {selectedBlockId && floatingCoords && selectedBlock && (
              <div
                className="absolute z-40 bg-white border border-slate-300 shadow-md rounded-lg p-1.5 flex flex-wrap items-center gap-2 select-none print:hidden font-sans text-xs w-max max-w-full"
                style={{
                  top: `${floatingCoords.top - 46}px`,
                  left: `${floatingCoords.left}px`,
                  transform: "translateX(-50%)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="bg-indigo-50 text-indigo-700 font-extrabold uppercase text-[9px] px-2 py-0.5 rounded tracking-wide border border-indigo-150">
                  {getBlockTypeLabel(selectedBlock.type)}
                </span>
                <span className="text-slate-400 font-bold text-[9px]">Khối #{globalIdx + 1}</span>
                <div className="w-px h-4 bg-slate-200" />
                <button
                  type="button"
                  disabled={globalIdx === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(selectedBlockId, "up");
                  }}
                  className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-30 rounded cursor-pointer text-[10px]"
                >
                  ▲ Lên
                </button>
                <button
                  type="button"
                  disabled={globalIdx === currentDoc.blocks.length - 1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(selectedBlockId, "down");
                  }}
                  className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-30 rounded cursor-pointer text-[10px]"
                >
                  ▼ Xuống
                </button>
                <div className="w-px h-4 bg-slate-200" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateBlock(selectedBlockId);
                  }}
                  className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer text-[10px]"
                >
                  📄 Nhân bản
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBlock(selectedBlockId);
                    setSelectedBlockId(null);
                  }}
                  className="px-1.5 py-0.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-red-700 font-bold cursor-pointer text-[10px]"
                >
                  🗑 Xóa
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId(null);
                  }}
                  className="p-1 hover:bg-slate-100 text-slate-400 rounded cursor-pointer text-[10px]"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Left & Right paper margin shadows for absolute immersion */}
            <div className="absolute top-0 bottom-0 left-0 w-4 bg-gradient-to-r from-slate-100/50 to-transparent pointer-events-none select-none z-10" />
            <div className="absolute top-0 bottom-0 right-0 w-4 bg-gradient-to-l from-slate-100/50 to-transparent pointer-events-none select-none z-10" />
          </div>
        </div>
      )
      ) : (
        /* RENDER STRUCTURE BLOCK-BY-BLOCK PRINTED VIEW */
        <BlockOfficeWordBlocksView
          currentDoc={currentDoc}
          setCurrentDoc={setCurrentDoc}
          selectedBlockId={selectedBlockId}
          setSelectedBlockId={setSelectedBlockId}
          moveBlock={moveBlock}
          duplicateBlock={duplicateBlock}
          deleteBlock={deleteBlock}
          paginateBlocks={paginateBlocks}
          renderInteractiveChart={renderInteractiveChart}
          evaluateFormula={evaluateFormula}
        />
      )}
    </div>
  );
}
