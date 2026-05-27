import React from "react";
import { AIParsedDocument, DocumentBlock } from "../types";

interface BlockOfficeActionStripProps {
  currentDoc: AIParsedDocument;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  insertNewBlock: (afterId: string, type: DocumentBlock["type"]) => void;
}

export default function BlockOfficeActionStrip({
  currentDoc,
  selectedBlockId,
  setSelectedBlockId,
  moveBlock,
  duplicateBlock,
  deleteBlock,
  insertNewBlock
}: BlockOfficeActionStripProps) {
  if (!selectedBlockId) {
    return (
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-1 flex items-center gap-2 text-xs select-none print:hidden shadow-sm shrink-0 font-sans">
        <span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">Mẹo sửa nhanh</span>
        <span className="text-[11px] font-medium leading-normal text-slate-500">Ấn click/chọn dòng tiêu đề, đoạn văn hoặc bảng số bất kì bên dưới để kích hoạt nhanh thanh công cụ sửa đổi thủ công!</span>
      </div>
    );
  }

  const selectedBlock = currentDoc.blocks.find(b => b.id === selectedBlockId);
  if (!selectedBlock) {
    return (
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-1 flex items-center gap-2 text-xs select-none print:hidden shadow-sm shrink-0 font-sans">
        <span className="text-slate-400 font-medium">Không tìm thấy khối đã chọn. Ấn chọn khối bất kỳ.</span>
      </div>
    );
  }

  const blockIndex = currentDoc.blocks.findIndex(b => b.id === selectedBlockId);
  const isFirst = blockIndex === 0;
  const isLast = blockIndex === currentDoc.blocks.length - 1;

  let blockTypeLabel = "Khối văn bản";
  if (selectedBlock.type === "paragraph") {
    blockTypeLabel = "Đoạn văn";
  } else if (selectedBlock.type === "heading") {
    blockTypeLabel = `Tiêu đề H${selectedBlock.meta?.level || 2}`;
  } else if (selectedBlock.type === "callout") {
    blockTypeLabel = "Hộp Lưu ý";
  } else if (selectedBlock.type === "slide") {
    blockTypeLabel = "Trang Slide";
  } else if (selectedBlock.type === "table") {
    blockTypeLabel = "Bảng dữ liệu";
  } else if (selectedBlock.type === "chart") {
    blockTypeLabel = "Biểu đồ";
  }

  return (
    <div className="bg-slate-50 border-b border-slate-200 px-3 py-1 flex flex-wrap items-center gap-1.5 text-xs select-none print:hidden shadow-sm shrink-0 font-sans">
      <div className="flex flex-wrap items-center gap-2 w-full justify-between sm:justify-start">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200">
          <span className="inline-flex items-center justify-center bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono tracking-wider">
            {blockTypeLabel}
          </span>
          <span className="text-slate-550 font-medium text-[11px] hidden md:inline">Khối #{blockIndex + 1}</span>
        </div>

        {/* Move blocks up/down */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => moveBlock(selectedBlockId, "up")}
            disabled={isFirst}
            className="p-0.5 px-2 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 disabled:opacity-40 rounded text-slate-705 font-semibold cursor-pointer flex items-center justify-center gap-1 shadow-xs transition-colors"
            title="Di chuyển khối lên trên"
          >
            <span>▲</span> <span className="hidden sm:inline text-[11px]">Lên</span>
          </button>
          <button
            onClick={() => moveBlock(selectedBlockId, "down")}
            disabled={isLast}
            className="p-0.5 px-2 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 disabled:opacity-40 rounded text-slate-705 font-semibold cursor-pointer flex items-center justify-center gap-1 shadow-xs transition-colors"
            title="Di chuyển khối xuống dưới"
          >
            <span>▼</span> <span className="hidden sm:inline text-[11px]">Xuống</span>
          </button>
        </div>

        {/* Actions: Duplicate, Delete, Add new block */}
        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => duplicateBlock(selectedBlockId)}
            className="p-0.5 px-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-705 hover:text-slate-900 font-semibold rounded cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
            title="Nhân bản khối hiện tại"
          >
            <span className="text-xs">📄</span> <span className="text-[11px]">Nhân bản</span>
          </button>
          <button
            onClick={() => deleteBlock(selectedBlockId)}
            className="p-0.5 px-2 bg-red-50 hover:bg-red-100 border border-red-250 text-red-650 hover:text-red-750 font-semibold rounded cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
            title="Xóa khối này"
          >
            <span className="text-xs">🗑</span> <span className="text-[11px]">Xóa</span>
          </button>
        </div>

        {/* Insert quick blocks after */}
        <div className="w-px h-5 bg-slate-200 hidden lg:block" />

        <div className="flex items-center gap-1">
          <span className="text-slate-400 font-medium mr-1 hidden lg:inline">Chèn thêm mới:</span>
          <button
            onClick={() => insertNewBlock(selectedBlockId, "paragraph")}
            className="p-1 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-655 hover:text-indigo-650 rounded cursor-pointer text-[11px] transition-colors font-medium"
          >
            + Đoạn văn
          </button>
          <button
            onClick={() => insertNewBlock(selectedBlockId, "heading")}
            className="p-1 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-655 hover:text-indigo-650 rounded cursor-pointer text-[11px] transition-colors font-medium"
          >
            + Tiêu đề
          </button>
          <button
            onClick={() => insertNewBlock(selectedBlockId, "callout")}
            className="p-1 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-655 hover:text-indigo-650 rounded cursor-pointer text-[11px] transition-colors font-medium"
          >
            + Lưu ý
          </button>
        </div>

        {/* Escape Selection */}
        <button
          onClick={() => setSelectedBlockId(null)}
          className="p-1 hover:bg-slate-200 text-slate-405 hover:text-slate-650 rounded ml-auto flex items-center justify-center cursor-pointer font-bold text-sm shadow-none"
          title="Bỏ chọn"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
