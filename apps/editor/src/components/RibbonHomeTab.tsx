import React from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Highlighter,
  Type,
  Subscript,
  Superscript,
  IndentIncrease,
  IndentDecrease,
  Strikethrough,
  Link,
  Eraser,
} from "lucide-react";

interface RibbonHomeTabProps {
  executeFormat: (cmd: string, val?: string) => void;
  onMenuToggle?: (open: boolean) => void;
}

const FONT_FAMILIES = [
  { name: "Arial", value: "Arial, sans-serif" },
  { name: "Calibri", value: "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" },
  { name: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { name: "Courier New", value: "'Courier New', Courier, monospace" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Verdana", value: "Verdana, Geneva, Tahoma, sans-serif" },
  { name: "Inter", value: "Inter, system-ui, sans-serif" },
  { name: "Roboto", value: "Roboto, Arial, sans-serif" },
  { name: "Palatino", value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { name: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
];

const FONT_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];

// Map from pt to execCommand size level (1-7) or inline style
const TEXT_COLORS = [
  "#000000", "#1a1a2e", "#16213e", "#0f3460",
  "#dc2626", "#ea580c", "#d97706", "#16a34a",
  "#2563eb", "#4f46e5", "#9333ea", "#db2777",
  "#4b5563", "#78716c", "#94a3b8", "#ffffff",
];
const BG_COLORS = [
  "transparent",
  "#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8",
  "#ddd6fe", "#fed7aa", "#f5f5f4", "#fecaca",
  "#99f6e4",
];

export default function RibbonHomeTab({ executeFormat, onMenuToggle }: RibbonHomeTabProps) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [fontSizeInput, setFontSizeInput] = React.useState("12");

  React.useEffect(() => {
    onMenuToggle?.(openMenu !== null);
  }, [openMenu, onMenuToggle]);

  const toggleMenu = (name: string) => {
    setOpenMenu(prev => (prev === name ? null : name));
  };

  const applyFontSize = (pt: number | string) => {
    const size = Number(pt);
    if (isNaN(size) || size < 1) return;
    // Use inline style via execCommand insertHTML or wrapSelection
    document.execCommand("fontSize", false, "7");
    const fontElements = document.querySelectorAll('font[size="7"]');
    fontElements.forEach(el => {
      (el as HTMLElement).removeAttribute("size");
      (el as HTMLElement).style.fontSize = `${size}pt`;
    });
    setOpenMenu(null);
  };

  const insertLink = () => {
    const url = window.prompt("Nhập URL liên kết:", "https://");
    if (url) executeFormat("createLink", url);
  };

  return (
    <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap select-none">

      {/* ── Font Family ─────────────────────────────────── */}
      <div className="relative border-r border-slate-150 pr-2 shrink-0">
        <button
          type="button"
          onClick={() => toggleMenu("font")}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold cursor-pointer text-[10px] min-w-[76px]"
          title="Chọn kiểu chữ (Font)"
        >
          <Type className="w-3 h-3 text-slate-500" />
          <span>Kiểu chữ</span>
          <span className="text-[8px] text-slate-400 ml-auto">▼</span>
        </button>
        {openMenu === "font" && (
          <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-50 w-52 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            {FONT_FAMILIES.map(f => (
              <button
                key={f.name}
                type="button"
                onClick={() => { executeFormat("fontName", f.value); setOpenMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 rounded text-xs text-slate-700 cursor-pointer"
                style={{ fontFamily: f.value }}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Font Size ────────────────────────────────────── */}
      <div className="relative border-r border-slate-150 pr-2 shrink-0">
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            value={fontSizeInput}
            min={6}
            max={400}
            onChange={e => setFontSizeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyFontSize(fontSizeInput); }}
            onBlur={() => applyFontSize(fontSizeInput)}
            className="w-10 h-6 px-1 text-center text-[11px] border border-slate-200 rounded bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            title="Cỡ chữ (pt)"
          />
          <button
            type="button"
            onClick={() => toggleMenu("size")}
            className="h-6 w-5 flex items-center justify-center bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[8px] text-slate-400 cursor-pointer"
          >▼</button>
        </div>
        {openMenu === "size" && (
          <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-50 w-20 flex flex-col gap-0.5 max-h-56 overflow-y-auto">
            {FONT_SIZES_PT.map(pt => (
              <button
                key={pt}
                type="button"
                onClick={() => { setFontSizeInput(String(pt)); applyFontSize(pt); }}
                className="w-full text-center px-2 py-1 hover:bg-indigo-50 rounded text-xs text-slate-700 cursor-pointer"
              >
                {pt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Basic Formatting ─────────────────────────────── */}
      <div className="flex items-center gap-1 border-r border-slate-150 pr-2.5 shrink-0">
        <button type="button" onClick={() => executeFormat("bold")}
          className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Bôi đậm (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("italic")}
          className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded text-slate-700 cursor-pointer" title="In nghiêng (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("underline")}
          className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Gạch chân (Ctrl+U)">
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("strikeThrough")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Gạch ngang">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("superscript")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Chỉ số trên">
          <Superscript className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("subscript")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Chỉ số dưới">
          <Subscript className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Colors ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-r border-slate-150 pr-2.5 shrink-0">
        {/* Text Color */}
        <div className="relative">
          <button type="button" onClick={() => toggleMenu("textColor")}
            className="flex items-center gap-0.5 p-1.5 hover:bg-slate-100 rounded cursor-pointer" title="Màu chữ">
            <Type className="w-3.5 h-3.5 text-slate-700" />
            <div className="w-3 h-1 rounded-full bg-red-500 -mt-0.5" />
          </button>
          {openMenu === "textColor" && (
            <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 grid grid-cols-4 gap-1.5 z-50 w-28">
              {TEXT_COLORS.map(clr => (
                <button key={clr} type="button"
                  onClick={() => { executeFormat("foreColor", clr); setOpenMenu(null); }}
                  className="w-5 h-5 rounded border border-slate-200 cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: clr }} />
              ))}
            </div>
          )}
        </div>
        {/* Highlight Color */}
        <div className="relative">
          <button type="button" onClick={() => toggleMenu("bgColor")}
            className="flex items-center gap-0.5 p-1.5 hover:bg-slate-100 rounded cursor-pointer" title="Tô sáng">
            <Highlighter className="w-3.5 h-3.5 text-amber-500" />
          </button>
          {openMenu === "bgColor" && (
            <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 grid grid-cols-5 gap-1.5 z-50 w-32">
              {BG_COLORS.map(clr => (
                <button key={clr} type="button"
                  onClick={() => { executeFormat("hiliteColor", clr === "transparent" ? "inherit" : clr); setOpenMenu(null); }}
                  className="w-5 h-5 rounded border border-slate-200 cursor-pointer hover:scale-110 transition-transform text-[8px] flex items-center justify-center"
                  style={{ backgroundColor: clr === "transparent" ? "#f8fafc" : clr }}>
                  {clr === "transparent" ? "✕" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Alignment ────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-r border-slate-150 pr-2.5 shrink-0">
        <button type="button" onClick={() => executeFormat("justifyLeft")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Căn trái">
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("justifyCenter")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Căn giữa">
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("justifyRight")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Căn phải">
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("justifyFull")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Căn đều">
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Lists & Indent ───────────────────────────────── */}
      <div className="flex items-center gap-1 border-r border-slate-150 pr-2.5 shrink-0">
        <button type="button" onClick={() => executeFormat("insertUnorderedList")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Danh sách chấm">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("insertOrderedList")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Danh sách số">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("indent")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Thụt vào">
          <IndentIncrease className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => executeFormat("outdent")}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer" title="Thụt ra">
          <IndentDecrease className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Line Height ──────────────────────────────────── */}
      <div className="relative border-r border-slate-150 pr-2 shrink-0">
        <button type="button" onClick={() => toggleMenu("lineHeight")}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold cursor-pointer text-[10px]"
          title="Giãn dòng">
          <span>Giãn dòng</span>
          <span className="text-[8px] text-slate-400">▼</span>
        </button>
        {openMenu === "lineHeight" && (
          <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-50 w-28 flex flex-col gap-0.5">
            {[
              { label: "Đơn (1.0)", value: "1.0" },
              { label: "1.15", value: "1.15" },
              { label: "1.5", value: "1.5" },
              { label: "Đôi (2.0)", value: "2.0" },
            ].map(h => (
              <button key={h.value} type="button"
                onClick={() => { executeFormat("lineHeight", h.value); setOpenMenu(null); }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded text-xs text-slate-700 cursor-pointer">
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Link Insert ──────────────────────────────────── */}
      <button type="button" onClick={insertLink}
        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer shrink-0" title="Chèn liên kết">
        <Link className="w-3.5 h-3.5" />
      </button>

      {/* ── Clear Formatting ─────────────────────────────── */}
      <button type="button" onClick={() => executeFormat("removeFormat")}
        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer shrink-0"
        title="Xóa định dạng">
        <Eraser className="w-3 h-3" />
        <span>Xóa định dạng</span>
      </button>
    </div>
  );
}
