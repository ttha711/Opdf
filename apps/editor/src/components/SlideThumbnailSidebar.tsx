import React from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, LayoutTemplate } from "lucide-react";
import { DocumentBlock, AIParsedDocument } from "../types";
import { cn } from "../lib/utils";

interface SlideThumbnailSidebarProps {
  slides: DocumentBlock[];
  activeSlideIdx: number;
  setActiveSlideIdx: (idx: number) => void;
  onAddSlide: () => void;
  onDeleteSlide: () => void;
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
}

export default function SlideThumbnailSidebar({
  slides,
  activeSlideIdx,
  setActiveSlideIdx,
  onAddSlide,
  onDeleteSlide,
  currentDoc,
  setCurrentDoc
}: SlideThumbnailSidebarProps) {
  const handleReorder = (idx: number, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= slides.length) return;

    const currentSlide = slides[idx];
    const targetSlide = slides[targetIdx];

    setCurrentDoc(prev => {
      const blocks = [...prev.blocks];
      const curBlockIdx = blocks.findIndex(b => b.id === currentSlide.id);
      const tarBlockIdx = blocks.findIndex(b => b.id === targetSlide.id);

      if (curBlockIdx > -1 && tarBlockIdx > -1) {
        const temp = blocks[curBlockIdx];
        blocks[curBlockIdx] = blocks[tarBlockIdx];
        blocks[tarBlockIdx] = temp;
      }
      return { ...prev, blocks };
    });
    setActiveSlideIdx(targetIdx);
  };

  const getBgClass = (bgType?: string) => {
    switch (bgType) {
      case "indigo": return "bg-indigo-950/90";
      case "purple": return "bg-purple-950/90";
      case "emerald": return "bg-emerald-950/90";
      case "rose": return "bg-rose-950/90";
      default: return "bg-slate-900/90";
    }
  };

  return (
    <div className="w-48 border-r border-slate-200 bg-slate-50 flex flex-col h-full font-sans shrink-0">
      {/* Sidebar header */}
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh sách Slide</span>
        <button
          onClick={onAddSlide}
          className="p-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md transition-colors cursor-pointer"
          title="Thêm Slide mới"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Thumbnails list */}
      <div className="flex-grow overflow-y-auto p-3 space-y-3.5 no-scrollbar">
        {slides.map((slide, idx) => {
          const isActive = idx === activeSlideIdx;
          const bgClass = getBgClass(slide.meta?.slideBg);
          const layout = slide.meta?.layout || "bullets";

          return (
            <div
              key={slide.id}
              onClick={() => setActiveSlideIdx(idx)}
              className={cn(
                "group relative border rounded-xl overflow-hidden cursor-pointer shadow-3xs hover:shadow-2xs transition-all flex flex-col",
                isActive 
                  ? "border-indigo-650 ring-2 ring-indigo-500/20 bg-indigo-50/20" 
                  : "border-slate-205 hover:border-slate-350 bg-white"
              )}
            >
              {/* Thumbnail header */}
              <div className="px-2 py-1 bg-slate-100/60 border-b border-slate-150 flex items-center justify-between select-none">
                <span className="text-[9px] font-bold text-slate-500 font-mono">#{idx + 1}</span>
                
                {/* Reorder and Delete actions on hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    disabled={idx === 0}
                    onClick={(e) => handleReorder(idx, "up", e)}
                    className="p-0.5 hover:bg-slate-200 disabled:opacity-30 rounded text-slate-500 cursor-pointer"
                    title="Di chuyển lên"
                  >
                    <ArrowUp className="w-2.5 h-2.5" />
                  </button>
                  <button
                    disabled={idx === slides.length - 1}
                    onClick={(e) => handleReorder(idx, "down", e)}
                    className="p-0.5 hover:bg-slate-200 disabled:opacity-30 rounded text-slate-500 cursor-pointer"
                    title="Di chuyển xuống"
                  >
                    <ArrowDown className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (slides.length <= 1) {
                        alert("Không thể xóa slide duy nhất!");
                        return;
                      }
                      setActiveSlideIdx(Math.max(0, idx - 1));
                      setCurrentDoc(prev => ({
                        ...prev,
                        blocks: prev.blocks.filter(b => b.id !== slide.id)
                      }));
                    }}
                    className="p-0.5 hover:bg-red-50 hover:text-red-650 rounded text-slate-500 cursor-pointer"
                    title="Xóa slide"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>

              {/* 16:9 Thumbnail Mockup Preview */}
              <div className="p-1.5 bg-slate-100">
                <div className={cn("aspect-[16/9] w-full rounded-md relative flex flex-col justify-center p-2 text-white border border-white/5 overflow-hidden", bgClass)}>
                  {/* Decorative background shape */}
                  <div className="absolute top-0 right-0 w-8 h-8 bg-white/5 rounded-full blur-xs pointer-events-none" />
                  
                  {/* Abstract layout sketch */}
                  {layout === "title" ? (
                    <div className="text-center space-y-1 w-full scale-[0.6]">
                      <div className="h-2 w-14 bg-white/80 rounded mx-auto" />
                      <div className="h-1 w-8 bg-white/40 rounded mx-auto" />
                    </div>
                  ) : layout === "quote" ? (
                    <div className="text-center space-y-1 w-full scale-[0.6] italic">
                      <div className="h-1.5 w-12 bg-white/70 rounded mx-auto" />
                      <div className="h-1 w-6 bg-indigo-400 rounded mx-auto" />
                    </div>
                  ) : layout === "two-columns" ? (
                    <div className="w-full scale-[0.6] space-y-1.5">
                      <div className="h-1.5 w-16 bg-white/90 rounded" />
                      <div className="grid grid-cols-2 gap-1">
                        <div className="space-y-0.5">
                          <div className="h-0.5 w-full bg-white/50 rounded" />
                          <div className="h-0.5 w-5 bg-white/50 rounded" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="h-0.5 w-full bg-white/50 rounded" />
                          <div className="h-0.5 w-4 bg-white/50 rounded" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* bullets */
                    <div className="w-full scale-[0.6] space-y-1.5">
                      <div className="h-1.5 w-16 bg-white/90 rounded" />
                      <div className="space-y-0.5 pl-1.5 border-l border-white/20">
                        <div className="h-0.5 w-12 bg-white/60 rounded" />
                        <div className="h-0.5 w-16 bg-white/60 rounded" />
                        <div className="h-0.5 w-10 bg-white/60 rounded" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Title label */}
              <div className="p-1 px-2 text-[9px] font-semibold text-slate-700 truncate bg-white select-none">
                {slide.content || "Tiêu đề Slide"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
