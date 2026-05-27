import React, { useState, useRef } from "react";
import { Plus, Table, Link, Image, Minus, RefreshCw, Globe, Wand2, AlignLeft, CheckSquare } from "lucide-react";
import { DocumentBlock } from "../types";

interface RibbonInsertTabProps {
  insertHtmlAtCursor: (html: string) => void;
  insertNewBlock: (id: string, type: DocumentBlock["type"]) => void;
  selectedBlockId: string | null;
  onMenuToggle?: (open: boolean) => void;
}

/** Generates a configurable HTML table with specified rows/cols */
function buildTableHtml(rows: number, cols: number): string {
  const headers = Array.from({ length: cols }, (_, i) => `Cột ${i + 1}`);
  const headerRow = `<tr>${headers.map(h => `<th style="border:1px solid #d1d5db;padding:6px 10px;background:#f8fafc;font-weight:700;text-align:center;font-size:11px;">${h}</th>`).join("")}</tr>`;
  const bodyRows = Array.from({ length: rows - 1 }, (_, ri) =>
    `<tr>${Array.from({ length: cols }, (_, ci) => `<td style="border:1px solid #e2e8f0;padding:6px 10px;font-size:11px;text-align:center;" contenteditable="true">Hàng ${ri + 1}</td>`).join("")}</tr>`
  ).join("");
  return `<table style="border-collapse:collapse;width:100%;margin:12px 0;"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
}

export default function RibbonInsertTab({
  insertHtmlAtCursor,
  insertNewBlock,
  selectedBlockId,
  onMenuToggle
}: RibbonInsertTabProps) {
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [hoveredCell, setHoveredCell] = useState({ row: 0, col: 0 });
  const imgInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    onMenuToggle?.(showTablePicker);
  }, [showTablePicker, onMenuToggle]);

  const insertTable = (rows: number, cols: number) => {
    insertHtmlAtCursor(buildTableHtml(rows, cols));
    setShowTablePicker(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      const markup = `<img src="${src}" alt="${file.name}" style="max-width:100%;height:auto;display:block;margin:8px auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.12);" />`;
      insertHtmlAtCursor(markup);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const insertImageFromUrl = () => {
    const url = prompt("Nhập URL hình ảnh:", "https://");
    if (!url) return;
    const alt = prompt("Nhập mô tả ảnh:", "Hình ảnh");
    const markup = `<img src="${url}" alt="${alt || "image"}" style="max-width:100%;height:auto;display:block;margin:8px auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.12);" />`;
    insertHtmlAtCursor(markup);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">

      {/* ── Table Picker ─────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTablePicker(v => !v)}
          className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-800 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]"
        >
          <Table className="w-3.5 h-3.5 text-indigo-500" />
          <span>Bảng</span>
          <span className="text-[8px] text-slate-400">▼</span>
        </button>
        {showTablePicker && (
          <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 min-w-[220px]">
            <p className="text-[9px] font-bold uppercase text-slate-400 mb-2">
              Chọn kích thước bảng ({hoveredCell.row} × {hoveredCell.col}):
            </p>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
              {Array.from({ length: 6 }, (_, ri) =>
                Array.from({ length: 8 }, (_, ci) => (
                  <button
                    key={`${ri}-${ci}`}
                    type="button"
                    onMouseEnter={() => setHoveredCell({ row: ri + 1, col: ci + 1 })}
                    onMouseLeave={() => setHoveredCell({ row: 0, col: 0 })}
                    onClick={() => insertTable(ri + 2, ci + 1)}
                    className={`w-5 h-5 border rounded-sm cursor-pointer transition-colors ${
                      ri + 1 <= hoveredCell.row && ci + 1 <= hoveredCell.col
                        ? "bg-indigo-200 border-indigo-400"
                        : "bg-slate-50 border-slate-200 hover:bg-indigo-100"
                    }`}
                  />
                ))
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
              <button type="button" onClick={() => insertTable(3, 3)}
                className="w-full text-left px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">
                🔵 Bảng 3×3 (nhanh)
              </button>
              <button type="button" onClick={() => insertTable(5, 4)}
                className="w-full text-left px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">
                📊 Bảng dữ liệu 5×4
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Image Insert ─────────────────────────────────── */}
      <div className="relative flex items-center gap-1">
        <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <button type="button" onClick={() => imgInputRef.current?.click()}
          className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-800 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
          <Image className="w-3.5 h-3.5 text-indigo-500" />
          <span>Ảnh từ máy</span>
        </button>
        <button type="button" onClick={insertImageFromUrl}
          className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-800 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
          <Globe className="w-3.5 h-3.5 text-indigo-500" />
          <span>Ảnh URL</span>
        </button>
      </div>

      {/* ── Page Break ───────────────────────────────────── */}
      <button type="button"
        onClick={() => {
          const markup = `<div style="border-top:2px dashed #c7d2fe;text-align:center;padding:8px 0;margin:16px 0;page-break-before:always;" contenteditable="false">
            <span style="background:#eef2ff;color:#4338ca;font-size:9px;font-weight:700;padding:2px 12px;border-radius:99px;border:1px solid #c7d2fe;letter-spacing:0.05em;text-transform:uppercase;">Ngắt trang</span>
          </div>`;
          insertHtmlAtCursor(markup);
        }}
        className="px-2.5 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
        <Plus className="w-3.5 h-3.5" />
        <span>Ngắt trang</span>
      </button>

      {/* ── Divider ──────────────────────────────────────── */}
      <button type="button"
        onClick={() => insertHtmlAtCursor(`<hr style="border:none;border-top:2px solid #e2e8f0;margin:16px 0;" />`)}
        className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
        <Minus className="w-3.5 h-3.5 text-slate-400" />
        <span>Đường kẻ</span>
      </button>

      {/* ── Callout Box ──────────────────────────────────── */}
      <button type="button"
        onClick={() => {
          const markup = `<div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:10px 14px;margin:10px 0;font-size:12px;color:#1e40af;font-weight:500;" contenteditable="true">💡 <strong>Ghi chú:</strong> Thêm nội dung vào đây...</div>`;
          insertHtmlAtCursor(markup);
        }}
        className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
        <AlignLeft className="w-3.5 h-3.5 text-blue-500" />
        <span>Hộp ghi chú</span>
      </button>

      {/* ── Checkbox List ────────────────────────────────── */}
      <button type="button"
        onClick={() => {
          const markup = `<ul style="list-style:none;padding-left:0;margin:8px 0;">
            <li style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;"><input type="checkbox" style="width:14px;height:14px;cursor:pointer;accent-color:#4f46e5;"> Mục kiểm tra 1</li>
            <li style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;"><input type="checkbox" style="width:14px;height:14px;cursor:pointer;accent-color:#4f46e5;"> Mục kiểm tra 2</li>
            <li style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;"><input type="checkbox" style="width:14px;height:14px;cursor:pointer;accent-color:#4f46e5;"> Mục kiểm tra 3</li>
          </ul>`;
          insertHtmlAtCursor(markup);
        }}
        className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
        <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
        <span>Danh sách tích</span>
      </button>

      {/* ── Link ─────────────────────────────────────────── */}
      <button type="button"
        onClick={() => {
          const url = prompt("Nhập URL liên kết:", "https://");
          if (!url) return;
          const text = prompt("Văn bản hiển thị:", "Liên kết");
          if (!text) return;
          const markup = `<a href="${url}" target="_blank" style="color:#4f46e5;text-decoration:underline;font-weight:600;">${text}</a>`;
          insertHtmlAtCursor(markup);
        }}
        className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[10px]">
        <Link className="w-3.5 h-3.5 text-indigo-500" />
        <span>Liên kết</span>
      </button>

      {/* ── Add Block after selected ──────────────────────── */}
      {selectedBlockId && (
        <div className="flex gap-1.5 items-center border-l pl-2.5 ml-1 border-slate-200">
          <span className="text-[9px] text-slate-400 font-bold uppercase">Thêm khối:</span>
          <button type="button" onClick={() => insertNewBlock(selectedBlockId, "paragraph")}
            className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[10px] cursor-pointer flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />Đoạn văn
          </button>
          <button type="button" onClick={() => insertNewBlock(selectedBlockId, "heading")}
            className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[10px] cursor-pointer flex items-center gap-1">
            <Wand2 className="w-3 h-3" />Tiêu đề
          </button>
        </div>
      )}
    </div>
  );
}
