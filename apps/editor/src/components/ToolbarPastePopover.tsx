import React from "react";
import { cn } from "../lib/utils";

interface ToolbarPastePopoverProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activePdfPageIdx: number;
  updatePdfPageHtml: (idx: number, htmlContent: string) => void;
  pageRenderContainerRef: React.RefObject<HTMLDivElement | null>;
}

export default function ToolbarPastePopover({
  isOpen,
  setIsOpen,
  activePdfPageIdx,
  updatePdfPageHtml,
  pageRenderContainerRef
}: ToolbarPastePopoverProps) {
  const [pasteTextInput, setPasteTextInput] = React.useState("");
  const [pasteFormatMode, setPasteFormatMode] = React.useState<"text" | "html">("text");
  const [pasteInsertMode, setPasteInsertMode] = React.useState<"cursor" | "replace" | "append">("cursor");

  if (!isOpen) return null;

  const handlePasteCustom = () => {
    let cleanHtml = "";
    if (pasteFormatMode === "html") {
      cleanHtml = pasteTextInput;
    } else {
      cleanHtml = pasteTextInput
        .split("\n\n")
        .map(p => {
          if (!p.trim()) return "";
          return `<p style="margin-bottom: 0.8em; line-height: 1.6;">${p.replace(/\n/g, "<br/>")}</p>`;
        })
        .join("");
    }

    if (!cleanHtml.trim()) return;

    if (pageRenderContainerRef.current) {
      const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
      if (editorDiv) {
        editorDiv.focus();
        
        switch (pasteInsertMode) {
          case "replace":
            editorDiv.innerHTML = cleanHtml;
            break;
          case "append":
            editorDiv.innerHTML = (editorDiv.innerHTML || "") + cleanHtml;
            break;
          case "cursor":
          default:
            try {
              const success = document.execCommand("insertHTML", false, cleanHtml);
              if (!success) {
                editorDiv.innerHTML += cleanHtml;
              }
            } catch (e) {
              editorDiv.innerHTML += cleanHtml;
            }
            break;
        }
        
        updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
      }
    }

    setPasteTextInput("");
    setIsOpen(false);
  };

  return (
    <div className="absolute top-9 left-0 z-50 bg-white border border-slate-250 p-4 rounded-xl shadow-xl w-64 flex flex-col gap-3 text-left">
      <div className="flex justify-between items-center pb-2 border-b border-slate-105">
        <span className="text-xs font-bold text-slate-705">Dán nội dung ngoài</span>
        <span className="text-[9px] bg-indigo-50 text-indigo-650 px-1.5 py-0.5 rounded font-black">CLIPBOARD</span>
      </div>

      {/* Pasted text value textarea box */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-slate-400">NỘI DUNG VĂN BẢN / CẤU TRÚC</label>
        <textarea 
          placeholder="Dán hoặc nhập toàn bộ nội dung bạn muốn chèn..."
          value={pasteTextInput}
          onChange={(e) => setPasteTextInput(e.target.value)}
          className="w-full h-24 text-xs p-2 bg-slate-50 border border-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-sans"
        />
      </div>

      {/* Formatting Choice (Plain Text vs Rich HTML) */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-slate-400">ĐỊNH DẠNG DÁN</label>
        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => setPasteFormatMode("text")}
            className={cn(
              "text-[10px] font-bold py-1 rounded transition-all cursor-pointer",
              pasteFormatMode === "text" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Văn bản thường
          </button>
          <button
            type="button"
            onClick={() => setPasteFormatMode("html")}
            className={cn(
              "text-[10px] font-bold py-1 rounded transition-all cursor-pointer",
              pasteFormatMode === "html" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Cấu trúc nâng cao
          </button>
        </div>
      </div>

      {/* Where to insert (Cursor, replace page, append page) */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-slate-400">VỊ TRÍ CHÈN</label>
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-lg text-center">
          {[
            { value: "cursor", label: "Con trỏ" },
            { value: "replace", label: "Ghi đè" },
            { value: "append", label: "Cuối trang" }
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPasteInsertMode(opt.value as any)}
              className={cn(
                "text-[9px] font-bold py-1 rounded transition-all cursor-pointer",
                pasteInsertMode === opt.value ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit quick insert button */}
      <button
        type="button"
        onClick={handlePasteCustom}
        disabled={!pasteTextInput.trim()}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs py-2 rounded-lg active:scale-95 transition-transform cursor-pointer"
      >
        Xác nhận Dán ✓
      </button>
    </div>
  );
}
