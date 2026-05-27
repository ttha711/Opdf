import React, { useState } from "react";
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  Trash2, 
  LayoutTemplate, 
  Palette, 
  Sparkles, 
  Loader2, 
  Play 
} from "lucide-react";
import { cn } from "../lib/utils";
import { DocumentBlock, AIParsedDocument } from "../types";

interface SlideControlsProps {
  activeSlideIdx: number;
  slidesCount: number;
  setActiveSlideIdx: React.Dispatch<React.SetStateAction<number>>;
  onAddSlide: () => void;
  onDeleteSlide: () => void;
  currentSlide: DocumentBlock | null;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  setIsFullscreenSlide: (val: boolean) => void;
}

export default function SlideControls({
  activeSlideIdx,
  slidesCount,
  setActiveSlideIdx,
  onAddSlide,
  onDeleteSlide,
  currentSlide,
  setCurrentDoc,
  setIsFullscreenSlide
}: SlideControlsProps) {
  const [showBgDropdown, setShowBgDropdown] = useState(false);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const [showAiDesigner, setShowAiDesigner] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isDesigning, setIsDesigning] = useState(false);

  const handleSetBg = (bg: string) => {
    if (currentSlide) {
      setCurrentDoc(prev => ({
        ...prev,
        blocks: prev.blocks.map(b => b.id === currentSlide.id ? { ...b, meta: { ...b.meta, slideBg: bg } } : b)
      }));
    }
    setShowBgDropdown(false);
  };

  const handleSetLayout = (layout: "title" | "bullets" | "two-columns" | "quote") => {
    if (currentSlide) {
      setCurrentDoc(prev => ({
        ...prev,
        blocks: prev.blocks.map(b => b.id === currentSlide.id ? { ...b, meta: { ...b.meta, layout } } : b)
      }));
    }
    setShowLayoutDropdown(false);
  };

  const handleAiRefineSlide = async () => {
    if (!aiPrompt.trim() || !currentSlide) return;

    setIsDesigning(true);
    try {
      const res = await fetch("/api/refine-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideBlock: currentSlide, instruction: aiPrompt })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      setCurrentDoc(prev => ({
        ...prev,
        blocks: prev.blocks.map(b => b.id === currentSlide.id ? { 
          ...b, 
          content: data.content, 
          meta: { ...b.meta, ...data.meta } 
        } : b)
      }));
      setAiPrompt("");
      setShowAiDesigner(false);
    } catch (err) {
      alert("AI thiết kế slide thất bại. Vui lòng thử lại.");
    } finally {
      setIsDesigning(false);
    }
  };

  const bgOptions = [
    { name: "Xám tối", value: "slate", class: "bg-slate-900" },
    { name: "Xanh chàm", value: "indigo", class: "bg-indigo-950" },
    { name: "Tím hoàng gia", value: "purple", class: "bg-purple-950" },
    { name: "Lục bảo tối", value: "emerald", class: "bg-emerald-950" },
    { name: "Hồng đất tối", value: "rose", class: "bg-rose-950" }
  ];

  const layoutOptions = [
    { name: "Slide luận điểm", value: "bullets" },
    { name: "Slide tiêu đề lớn", value: "title" },
    { name: "Hai cột đối chiếu", value: "two-columns" },
    { name: "Trích dẫn nghệ thuật", value: "quote" }
  ];

  return (
    <div className="flex flex-wrap items-center justify-between bg-white border border-slate-200 p-3 rounded-xl shadow-sm gap-3">
      <div className="flex items-center gap-2">
        <button
          disabled={activeSlideIdx === 0}
          onClick={() => setActiveSlideIdx(p => Math.max(0, p - 1))}
          className="bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40 p-1.5 rounded-lg cursor-pointer transition-colors"
          title="Slide trước"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold font-mono text-slate-600 px-2.5 bg-slate-50 border border-slate-200 py-1 rounded-md">
          Slide {activeSlideIdx + 1} / {slidesCount}
        </span>
        <button
          disabled={activeSlideIdx === slidesCount - 1}
          onClick={() => setActiveSlideIdx(p => Math.min(slidesCount - 1, p + 1))}
          className="bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40 p-1.5 rounded-lg cursor-pointer transition-colors"
          title="Slide tiếp theo"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 relative">
        <button onClick={onAddSlide} className="p-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-lg cursor-pointer transition-all" title="Thêm Slide mới">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={onDeleteSlide} className="p-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-650 text-slate-600 rounded-lg cursor-pointer transition-all" title="Xóa Slide hiện tại">
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            onClick={() => { setShowLayoutDropdown(!showLayoutDropdown); setShowBgDropdown(false); setShowAiDesigner(false); }}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer transition-all"
            title="Đổi bố cục slide"
          >
            <LayoutTemplate className="w-4 h-4" />
          </button>
          {showLayoutDropdown && (
            <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-45 w-40">
              <span className="font-bold text-[9px] text-slate-400 uppercase tracking-wider block px-1.5 pb-1">Chọn bố cục:</span>
              {layoutOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSetLayout(opt.value as any)}
                  className={cn(
                    "w-full flex items-center p-1.5 hover:bg-slate-50 rounded text-left cursor-pointer text-xs font-semibold",
                    (currentSlide?.meta?.layout || "bullets") === opt.value ? "text-indigo-600 bg-indigo-50/50 font-bold" : "text-slate-600"
                  )}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => { setShowBgDropdown(!showBgDropdown); setShowLayoutDropdown(false); setShowAiDesigner(false); }}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer transition-all"
            title="Đổi màu nền Slide"
          >
            <Palette className="w-4 h-4" />
          </button>
          {showBgDropdown && (
            <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-45 w-36">
              <span className="font-bold text-[9px] text-slate-400 uppercase tracking-wider block px-1.5 pb-1">Chọn màu nền:</span>
              {bgOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSetBg(opt.value)}
                  className="w-full flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded text-left cursor-pointer"
                >
                  <div className={cn("w-3.5 h-3.5 rounded border border-white/20", opt.class)} />
                  <span className="text-[10px] font-medium text-slate-700">{opt.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Slide Designer */}
        <div className="relative">
          <button
            onClick={() => { setShowAiDesigner(!showAiDesigner); setShowBgDropdown(false); setShowLayoutDropdown(false); }}
            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg cursor-pointer transition-all"
            title="AI Thiết Kế Slide"
          >
            <Sparkles className="w-4 h-4 animate-pulse" />
          </button>
          {showAiDesigner && (
            <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-45 w-72 space-y-2">
              <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block">AI Thiết kế Slide</span>
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ví dụ: Nền chàm, bố cục 2 cột, thêm 2 luận điểm bán hàng"
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
              />
              <button
                onClick={handleAiRefineSlide}
                disabled={isDesigning || !aiPrompt.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isDesigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-yellow-300" />}
                <span>Áp dụng thiết kế AI</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsFullscreenSlide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" /> 
          <span>Trình chiếu</span>
        </button>
      </div>
    </div>
  );
}
