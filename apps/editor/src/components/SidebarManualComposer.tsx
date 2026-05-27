import React from "react";
import { Sliders, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { AIParsedDocument, DocumentBlock } from "../types";
import SidebarComposerTextEditor from "./SidebarComposerTextEditor";
import SidebarComposerTableControls from "./SidebarComposerTableControls";

interface SidebarManualComposerProps {
  selectedBlockId: string;
  selectedBlock: DocumentBlock;
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  changeBlockType: (id: string, type: DocumentBlock["type"]) => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  insertNewBlock: (afterId: string, type: DocumentBlock["type"]) => void;
}

export default function SidebarManualComposer({
  selectedBlockId,
  selectedBlock,
  currentDoc,
  setCurrentDoc,
  changeBlockType,
  moveBlock,
  duplicateBlock,
  deleteBlock,
  insertNewBlock,
}: SidebarManualComposerProps) {
  const [autoCleanPaste, setAutoCleanPaste] = React.useState(true);
  const [pasteNotification, setPasteNotification] = React.useState<string | null>(null);

  const blockIndex = currentDoc.blocks.findIndex(b => b.id === selectedBlockId);
  const isFirst = blockIndex === 0;
  const isLast = blockIndex === currentDoc.blocks.length - 1;

  return (
    <div className="space-y-4 flex-grow flex flex-col font-sans select-text">
      {/* Block Header Info & Type Switcher */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 select-none">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span>Định dạng khối</span>
          <span className="text-slate-500 font-mono">#{selectedBlock.id.substring(0, 6)}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {(["paragraph", "heading", "callout", "slide"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => changeBlockType(selectedBlockId, t)}
              className={cn(
                "px-2 py-1.5 border rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer text-center",
                selectedBlock.type === t
                  ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                  : "bg-white text-slate-605 hover:bg-slate-50 border-slate-205"
              )}
            >
              {t === "paragraph" ? "Đoạn văn" : t === "heading" ? "Tiêu đề" : t === "callout" ? "Hộp Lưu ý" : "Slide"}
            </button>
          ))}
        </div>
      </div>

      {/* Block Position & Manipulation Actions */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 select-none">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Sắp xếp & Thao tác
        </div>
        
        <div className="flex gap-2">
          {/* Move Up/Down */}
          <button
            type="button"
            onClick={() => moveBlock(selectedBlockId, "up")}
            disabled={isFirst}
            className="flex-1 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer text-slate-700 flex items-center justify-center gap-1 shadow-xs transition-colors"
            title="Di chuyển khối lên trên"
          >
            <span>▲</span> <span>Lên</span>
          </button>
          <button
            type="button"
            onClick={() => moveBlock(selectedBlockId, "down")}
            disabled={isLast}
            className="flex-1 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer text-slate-700 flex items-center justify-center gap-1 shadow-xs transition-colors"
            title="Di chuyển khối xuống dưới"
          >
            <span>▼</span> <span>Xuống</span>
          </button>
        </div>

        <div className="flex gap-2">
          {/* Duplicate / Delete */}
          <button
            type="button"
            onClick={() => duplicateBlock(selectedBlockId)}
            className="flex-1 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1 shadow-xs transition-colors"
            title="Nhân bản khối hiện tại"
          >
            <span>📄</span> <span>Nhân bản</span>
          </button>
          <button
            type="button"
            onClick={() => deleteBlock(selectedBlockId)}
            className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-650 font-semibold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1 shadow-xs transition-colors"
            title="Xóa khối này"
          >
            <span>🗑</span> <span>Xóa</span>
          </button>
        </div>
      </div>

      {/* Quick Insert Block After Current */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 select-none">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Chèn khối mới phía sau
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => insertNewBlock(selectedBlockId, "paragraph")}
            className="py-1 px-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer text-center"
          >
            + Đoạn văn
          </button>
          <button
            type="button"
            onClick={() => insertNewBlock(selectedBlockId, "heading")}
            className="py-1 px-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer text-center"
          >
            + Tiêu đề
          </button>
          <button
            type="button"
            onClick={() => insertNewBlock(selectedBlockId, "callout")}
            className="py-1 px-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer text-center"
          >
            + Lưu ý
          </button>
        </div>
      </div>

      {/* Main Text Content Input */}
      {selectedBlock.type !== "page-break" && (
        <SidebarComposerTextEditor
          selectedBlockId={selectedBlockId}
          selectedBlock={selectedBlock}
          setCurrentDoc={setCurrentDoc}
        />
      )}

      {/* Heading Level specific */}
      {selectedBlock.type === "heading" && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Cấp độ Tiêu đề</label>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  setCurrentDoc(prev => ({
                    ...prev,
                    blocks: prev.blocks.map(b => b.id === selectedBlockId ? { ...b, meta: { ...b.meta, level: lvl } } : b)
                  }));
                }}
                className={cn(
                  "flex-1 py-1 px-1 border rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                  (selectedBlock.meta?.level || 2) === lvl
                    ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                Tiêu đề {lvl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Callout specific: style type */}
      {selectedBlock.type === "callout" && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Giao diện thông báo</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(["info", "success", "warning", "danger"] as const).map(ctype => (
              <button
                key={ctype}
                type="button"
                onClick={() => {
                  setCurrentDoc(prev => ({
                    ...prev,
                    blocks: prev.blocks.map(b => b.id === selectedBlockId ? { ...b, meta: { ...b.meta, calloutType: ctype } } : b)
                  }));
                }}
                className={cn(
                  "py-1 border rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center cursor-pointer",
                  (selectedBlock.meta?.calloutType || "info") === ctype
                    ? ctype === "info" ? "bg-sky-550 text-white border-sky-600 shadow-xs"
                      : ctype === "success" ? "bg-emerald-555 text-white border-emerald-600 shadow-xs"
                      : ctype === "warning" ? "bg-amber-505 text-white border-amber-600 shadow-xs"
                      : "bg-red-505 text-white border-red-650 shadow-xs"
                    : "bg-white text-slate-600 border-slate-202 hover:bg-slate-50"
                )}
              >
                {ctype === "info" ? "Thông tin" : ctype === "success" ? "Thành công" : ctype === "warning" ? "Chú ý" : "Nguy hiểm"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slide specific controls */}
      {selectedBlock.type === "slide" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Giao diện Slide</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["indigo", "purple", "emerald", "slate"] as const).map(theme => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => {
                    setCurrentDoc(prev => ({
                      ...prev,
                      blocks: prev.blocks.map(b => b.id === selectedBlockId ? { ...b, meta: { ...b.meta, slideBg: theme } } : b)
                    }));
                  }}
                  className={cn(
                    "py-1 border rounded-lg text-[9px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 uppercase",
                    (selectedBlock.meta?.slideBg || "indigo") === theme
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white text-slate-600 border-slate-205 hover:bg-slate-50"
                  )}
                >
                  <span className={cn(
                    "w-2 h-2 rounded-full inline-block",
                    theme === "indigo" ? "bg-indigo-600" :
                    theme === "purple" ? "bg-fuchsia-600" :
                    theme === "emerald" ? "bg-emerald-602" : "bg-slate-602"
                  )} />
                  <span>{theme === "indigo" ? "Chàm" : theme === "purple" ? "Tím" : theme === "emerald" ? "Lục" : "Xám"}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bullet points structure editor */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center select-none">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Mục Slide ({selectedBlock.meta?.bulletPoints?.length || 0})</label>
              <button
                type="button"
                onClick={() => {
                  setCurrentDoc(prev => ({
                    ...prev,
                    blocks: prev.blocks.map(b => {
                      if (b.id !== selectedBlockId) return b;
                      const bp = [...(b.meta?.bulletPoints || []), "Luận điểm trình bày mới"];
                      return { ...b, meta: { ...b.meta, bulletPoints: bp } };
                    })
                  }));
                }}
                className="text-indigo-650 hover:text-indigo-700 font-bold text-[10px] cursor-pointer"
              >
                + Thêm ý
              </button>
            </div>

            <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
              {(selectedBlock.meta?.bulletPoints || []).map((bp, bIdx) => (
                <div key={bIdx} className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={bp}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCurrentDoc(prev => ({
                        ...prev,
                        blocks: prev.blocks.map(b => {
                          if (b.id !== selectedBlockId) return b;
                          const points = [...(b.meta?.bulletPoints || [])];
                          points[bIdx] = val;
                          return { ...b, meta: { ...b.meta, bulletPoints: points } };
                        })
                      }));
                    }}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-505"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDoc(prev => ({
                        ...prev,
                        blocks: prev.blocks.map(b => {
                          if (b.id !== selectedBlockId) return b;
                          const points = (b.meta?.bulletPoints || []).filter((_, idx) => idx !== bIdx);
                          return { ...b, meta: { ...b.meta, bulletPoints: points } };
                        })
                      }));
                    }}
                    className="p-0.5 hover:bg-slate-100 text-red-500 rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Paragraph specific bullet points manager */}
      {selectedBlock.type === "paragraph" && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center select-none">
            <label className="text-xs font-bold text-slate-705 uppercase tracking-wide">Luận điểm thụt dòng</label>
            <button
              type="button"
              onClick={() => {
                setCurrentDoc(prev => ({
                  ...prev,
                  blocks: prev.blocks.map(b => {
                    if (b.id !== selectedBlockId) return b;
                    const bp = [...(b.meta?.bulletPoints || []), "Ý diễn giải mới"];
                    return { ...b, meta: { ...b.meta, bulletPoints: bp } };
                  })
                }));
              }}
              className="text-indigo-650 hover:text-indigo-700 font-bold text-[10px] cursor-pointer"
            >
              + Thêm ý con
            </button>
          </div>

          <div className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
            {(selectedBlock.meta?.bulletPoints || []).map((bp, bIdx) => (
              <div key={bIdx} className="flex gap-1 items-center">
                <input
                  type="text"
                  value={bp}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCurrentDoc(prev => ({
                      ...prev,
                      blocks: prev.blocks.map(b => {
                        if (b.id !== selectedBlockId) return b;
                        const points = [...(b.meta?.bulletPoints || [])];
                        points[bIdx] = val;
                        return { ...b, meta: { ...b.meta, bulletPoints: points } };
                      })
                    }));
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-505"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCurrentDoc(prev => ({
                      ...prev,
                      blocks: prev.blocks.map(b => {
                        if (b.id !== selectedBlockId) return b;
                        const points = (b.meta?.bulletPoints || []).filter((_, idx) => idx !== bIdx);
                        return { ...b, meta: { ...b.meta, bulletPoints: points } };
                      })
                    }));
                  }}
                  className="p-0.5 hover:bg-slate-100 text-red-500 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table manually add row / column in Sidebar */}
      <SidebarComposerTableControls
        selectedBlockId={selectedBlockId}
        selectedBlock={selectedBlock}
        setCurrentDoc={setCurrentDoc}
      />
    </div>
  );
}
