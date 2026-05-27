import React from "react";
import { AIParsedDocument, DocumentBlock } from "../types";

interface SidebarComposerTableControlsProps {
  selectedBlockId: string;
  selectedBlock: DocumentBlock;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
}

export default function SidebarComposerTableControls({
  selectedBlockId,
  selectedBlock,
  setCurrentDoc
}: SidebarComposerTableControlsProps) {
  if (selectedBlock.type !== "table") return null;

  return (
    <div className="space-y-3.5 select-none text-xs text-left">
      <div className="flex justify-between items-center border-b border-slate-100 pb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">Quản lý dòng & cột nhanh</span>
      </div>
      
      <div className="grid grid-cols-2 gap-1.5 font-sans">
        <button
          type="button"
          onClick={() => {
            setCurrentDoc(prev => ({
              ...prev,
              blocks: prev.blocks.map(b => {
                if (b.id !== selectedBlockId || !b.tableData || b.tableData.length === 0) return b;
                const colCount = b.tableData[0].length;
                const newRow = Array.from({ length: colCount }, () => ({ value: "" }));
                const nextTable = [...b.tableData];
                if (nextTable.length > 1) {
                  nextTable.splice(nextTable.length - 1, 0, newRow);
                } else {
                  nextTable.push(newRow);
                }
                return { ...b, tableData: nextTable };
              })
            }));
          }}
          className="py-1.5 border border-emerald-250 bg-emerald-55 hover:bg-emerald-100/70 text-emerald-800 rounded-xl text-[10px] font-bold cursor-pointer transition-colors shadow-3xs text-center"
        >
          + Thêm 1 dòng
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentDoc(prev => ({
              ...prev,
              blocks: prev.blocks.map(b => {
                if (b.id !== selectedBlockId || !b.tableData || b.tableData.length <= 1) return b;
                const nextTable = [...b.tableData];
                if (nextTable.length > 2) {
                  nextTable.splice(nextTable.length - 2, 1);
                } else {
                  nextTable.pop();
                }
                return { ...b, tableData: nextTable };
              })
            }));
          }}
          className="py-1.5 border border-red-200 bg-red-55 hover:bg-red-100/70 text-red-700 rounded-xl text-[10px] font-bold cursor-pointer transition-colors shadow-3xs text-center"
        >
          - Xóa 1 dòng
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentDoc(prev => ({
              ...prev,
              blocks: prev.blocks.map(b => {
                if (b.id !== selectedBlockId || !b.tableData || b.tableData.length === 0) return b;
                const nextTable = b.tableData.map(row => [...row, { value: "" }]);
                return { ...b, tableData: nextTable };
              })
            }));
          }}
          className="py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-105 text-slate-700 rounded-xl text-[10px] font-bold cursor-pointer transition-all text-center shadow-3xs"
        >
          + Thêm 1 cột
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentDoc(prev => ({
              ...prev,
              blocks: prev.blocks.map(b => {
                if (b.id !== selectedBlockId || !b.tableData || b.tableData.length === 0) return b;
                const nextTable = b.tableData.map(row => {
                  const nextRow = [...row];
                  if (nextRow.length > 1) {
                    nextRow.pop();
                  }
                  return nextRow;
                });
                return { ...b, tableData: nextTable };
              })
            }));
          }}
          className="py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-105 text-slate-750 rounded-xl text-[10px] font-bold cursor-pointer transition-all text-center shadow-3xs"
        >
          - Xóa 1 cột
        </button>
      </div>
      <p className="text-[9px] text-slate-400 italic leading-normal font-sans">Lưu ý: Để điều chỉnh số liệu chi tiết hay thiết lập công thức tài chính Excel tự động động bộ, hãy hoán đổi tab Excel số liệu phía trên.</p>
    </div>
  );
}
