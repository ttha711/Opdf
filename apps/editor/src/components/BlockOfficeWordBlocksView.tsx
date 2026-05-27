import React from "react";
import { cn } from "../lib/utils";
import { DocumentBlock, TableCell, AIParsedDocument } from "../types";
import BlockOfficeWordBlockItem from "./BlockOfficeWordBlockItem";

interface BlockOfficeWordBlocksViewProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  paginateBlocks: (blocks: DocumentBlock[]) => DocumentBlock[][];
  renderInteractiveChart: (block: DocumentBlock) => React.ReactNode;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;
}

export default function BlockOfficeWordBlocksView({
  currentDoc,
  setCurrentDoc,
  selectedBlockId,
  setSelectedBlockId,
  moveBlock,
  duplicateBlock,
  deleteBlock,
  paginateBlocks,
  renderInteractiveChart,
  evaluateFormula
}: BlockOfficeWordBlocksViewProps) {
  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-8 flex items-start justify-center text-slate-800 scrollbar-thin select-text min-h-[500px]">
      <div className="w-full max-w-3xl space-y-5">
        {paginateBlocks(currentDoc.blocks).map((pageBlocks, pIdx, allPages) => (
          <div 
            key={pIdx} 
            className="a4-page a4-page-print w-full min-h-[1050px] bg-white text-slate-800 p-[15mm] md:p-[20mm] rounded-xl shadow-xs relative border border-slate-202 flex flex-col justify-between"
          >
            <div>
              {/* Running header */}
              <header className="flex items-center justify-between border-b border-slate-100 pb-2 mb-6 text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none">
                <span>{currentDoc.title || "Tài liệu hệ thống"}</span>
                <span>Quy chuẩn phân trang Block-Office-A4</span>
              </header>

              {/* Render blocks list */}
              <div className="space-y-5">
                {pageBlocks.map((block) => (
                  <div key={block.id}>
                    <BlockOfficeWordBlockItem
                      block={block}
                      currentDoc={currentDoc}
                      setCurrentDoc={setCurrentDoc}
                      selectedBlockId={selectedBlockId}
                      setSelectedBlockId={setSelectedBlockId}
                      moveBlock={moveBlock}
                      duplicateBlock={duplicateBlock}
                      deleteBlock={deleteBlock}
                      renderInteractiveChart={renderInteractiveChart}
                      evaluateFormula={evaluateFormula}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination footer */}
            <footer className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-8 text-[10px] text-slate-400 font-bold select-none">
              <span>Khổ dọc A4 Chuẩn hóa</span>
              <span>Trang {pIdx + 1} / {allPages.length}</span>
            </footer>
          </div>
        ))}
      </div>
    </div>
  );
}
