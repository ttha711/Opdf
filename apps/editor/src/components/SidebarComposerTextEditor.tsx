import React from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AIParsedDocument, DocumentBlock } from "../types";

interface SidebarComposerTextEditorProps {
  selectedBlockId: string;
  selectedBlock: DocumentBlock;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
}

export default function SidebarComposerTextEditor({
  selectedBlockId,
  selectedBlock,
  setCurrentDoc
}: SidebarComposerTextEditorProps) {
  const [autoCleanPaste, setAutoCleanPaste] = React.useState(true);
  const [pasteNotification, setPasteNotification] = React.useState<string | null>(null);

  return (
    <div className="space-y-1.5 text-left">
      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
        {selectedBlock.type === "slide" ? "Tiêu đề Slide" : selectedBlock.type === "table" ? "Tên Bảng Số" : "Nội dung văn bản"}
      </label>
      <textarea
        value={selectedBlock.content}
        onChange={(e) => {
          const val = e.target.value;
          setCurrentDoc(prev => ({
            ...prev,
            blocks: prev.blocks.map(b => b.id === selectedBlockId ? { ...b, content: val } : b)
          }));
        }}
        onPaste={(e) => {
          if (!autoCleanPaste) return;
          
          const clipboardData = e.clipboardData;
          if (!clipboardData) return;

          const html = clipboardData.getData("text/html");
          const plainText = clipboardData.getData("text/plain");

          // Clean Microsoft Word metadata / clutter
          const isFromWord = html.includes("urn:schemas-microsoft-com:office") || html.includes("mso-") || html.includes("generator: microsoft");
          const isFromExcel = html.includes("excel") || html.includes("sheet");
          const isOfflineApp = clipboardData.types.includes("text/rtf") || isFromWord || isFromExcel;

          if (!html || isOfflineApp) {
            e.preventDefault();
            
            const cleanedText = plainText
              .split("\n")
              .map(line => line.trimEnd())
              .filter((line, index, arr) => line !== "" || (index > 0 && arr[index - 1] !== ""))
              .join("\n")
              .trim();

            const target = e.currentTarget;
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || 0;
            const value = target.value;
            const newValue = value.substring(0, start) + cleanedText + value.substring(end);

            setCurrentDoc(prev => ({
              ...prev,
              blocks: prev.blocks.map(b => b.id === selectedBlockId ? { ...b, content: newValue } : b)
            }));

            setPasteNotification("Lọc sạch rác Word/Excel sang dạng raw text!");
            setTimeout(() => setPasteNotification(null), 3000);
          } else {
            e.preventDefault();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            let extractedText = "";
            const traverse = (node: Node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                extractedText += node.nodeValue;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                const tag = el.tagName.toLowerCase();
                if (tag === "p" || tag === "div" || tag === "tr" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "br") {
                  extractedText += "\n";
                }
                for (let i = 0; i < el.childNodes.length; i++) {
                  traverse(el.childNodes[i]);
                }
                if (tag === "p" || tag === "div" || tag === "tr" || tag === "h1" || tag === "h2" || tag === "h3") {
                  extractedText += "\n";
                }
              }
            };
            traverse(doc.body);

            const cleanedText = extractedText
              .split("\n")
              .map(line => line.trim())
              .filter((line, index, arr) => line !== "" || (index > 0 && arr[index - 1] !== ""))
              .join("\n")
              .trim();

            const target = e.currentTarget;
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || 0;
            const value = target.value;
            const newValue = value.substring(0, start) + (cleanedText || plainText) + value.substring(end);

            setCurrentDoc(prev => ({
              ...prev,
              blocks: prev.blocks.map(b => b.id === selectedBlockId ? { ...b, content: newValue } : b)
            }));

            setPasteNotification("Đã lọc rác HTML từ thiết bị ngoại vi!");
            setTimeout(() => setPasteNotification(null), 3000);
          }
        }}
        rows={4}
        placeholder="Nhập chữ hiển thị tại khối..."
        className="w-full bg-slate-50 border border-slate-205 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all resize-y leading-relaxed shadow-inner"
      />
      
      {/* Paste options & notification banner */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center justify-between text-[10px] text-slate-500 select-none font-bold">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800">
            <input
              type="checkbox"
              checked={autoCleanPaste}
              onChange={(e) => setAutoCleanPaste(e.target.checked)}
              className="accent-indigo-600 w-3.5 h-3.5 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Lọc sạch định dạng rác (Word/Excel)</span>
          </label>
        </div>
        
        <AnimatePresence>
          {pasteNotification && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              className="bg-emerald-50 border border-emerald-200 text-emerald-850 px-2 rounded-lg text-[10px] leading-relaxed flex items-center gap-1 py-1"
            >
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>{pasteNotification}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
