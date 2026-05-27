import React from "react";
import { DocumentBlock, AIParsedDocument } from "../types";
import { cn } from "../lib/utils";

interface SlideCanvasProps {
  slide: DocumentBlock;
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  isFullscreen?: boolean;
}

export default function SlideCanvas({
  slide,
  setCurrentDoc,
  isFullscreen = false
}: SlideCanvasProps) {
  if (!slide) return null;

  const bgType = slide.meta?.slideBg || "slate";
  const layout = slide.meta?.layout || "bullets";
  const bulletPoints = slide.meta?.bulletPoints || [];

  const handleUpdateTitle = (val: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === slide.id ? { ...b, content: val } : b)
    }));
  };

  const handleUpdateFirstBullet = (val: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === slide.id) {
          const bps = [...(b.meta?.bulletPoints || [])];
          if (bps.length === 0) bps.push(val);
          else bps[0] = val;
          return { ...b, meta: { ...b.meta, bulletPoints: bps } };
        }
        return b;
      })
    }));
  };

  const handleUpdateBulletIdx = (idx: number, val: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === slide.id) {
          const bps = [...(b.meta?.bulletPoints || [])];
          bps[idx] = val;
          return { ...b, meta: { ...b.meta, bulletPoints: bps } };
        }
        return b;
      })
    }));
  };

  const handleAddBullet = () => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === slide.id) {
          const bps = [...(b.meta?.bulletPoints || []), "Luận điểm mới"];
          return { ...b, meta: { ...b.meta, bulletPoints: bps } };
        }
        return b;
      })
    }));
  };

  const handleDeleteBullet = (idx: number) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === slide.id) {
          const bps = (b.meta?.bulletPoints || []).filter((_, i) => i !== idx);
          return { ...b, meta: { ...b.meta, bulletPoints: bps } };
        }
        return b;
      })
    }));
  };

  const bgClasses = 
    bgType === "indigo" ? "bg-indigo-950 text-white border-indigo-900" :
    bgType === "purple" ? "bg-purple-950 text-white border-purple-900" :
    bgType === "emerald" ? "bg-emerald-950 text-white border-emerald-900" :
    bgType === "rose" ? "bg-rose-950 text-white border-rose-900" :
    "bg-slate-900 text-white border-slate-800";

  // Render a specific bullet item
  const renderBulletItem = (bp: string, bpIdx: number) => {
    if (isFullscreen) {
      return (
        <div key={bpIdx} className="flex items-start gap-3.5 text-base md:text-xl text-slate-200">
          <div className="w-2 h-2 bg-indigo-400 rounded-full mt-2.5 flex-shrink-0 shadow" />
          <span className="leading-relaxed font-medium">{bp}</span>
        </div>
      );
    }
    return (
      <div key={bpIdx} className="flex items-center gap-2 group text-xs text-slate-350">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 shadow" />
        <input
          type="text"
          value={bp}
          onChange={(e) => handleUpdateBulletIdx(bpIdx, e.target.value)}
          className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-white/30 text-xs text-slate-200 focus:outline-none py-0.5"
          placeholder="Nhập luận điểm chính..."
        />
        <button
          type="button"
          onClick={() => handleDeleteBullet(bpIdx)}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-500 font-bold ml-1 cursor-pointer transition-opacity shrink-0"
          title="Xóa luận điểm"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className={cn(
      "w-full rounded-xl flex flex-col justify-between relative overflow-hidden shadow-md transition-all duration-350 border",
      bgClasses,
      isFullscreen ? "p-14 h-full" : "aspect-[16/9] p-8 md:p-11"
    )}>
      {/* Decorative vector background */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 opacity-5 rounded-full blur-xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 opacity-10 rounded-full blur-3xl pointer-events-none" />

      {/* Slide Content depending on layout */}
      <div className="flex-grow flex flex-col justify-center w-full z-10">
        {layout === "title" ? (
          <div className="text-center space-y-4 w-full">
            {isFullscreen ? (
              <>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-white">{slide.content}</h2>
                {bulletPoints.length > 0 && <p className="text-base md:text-xl text-slate-305 max-w-2xl mx-auto">{bulletPoints[0]}</p>}
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={slide.content}
                  onChange={(e) => handleUpdateTitle(e.target.value)}
                  className="w-full bg-transparent text-center border-b border-transparent hover:border-white/10 focus:border-white/30 text-xl md:text-3xl font-extrabold tracking-tight text-white focus:outline-none"
                  placeholder="Nhập Tiêu Đề Slide..."
                />
                <input
                  type="text"
                  value={bulletPoints[0] || ""}
                  onChange={(e) => handleUpdateFirstBullet(e.target.value)}
                  className="w-full max-w-md mx-auto bg-transparent text-center border-b border-transparent hover:border-white/10 focus:border-white/30 text-xs text-slate-350 focus:outline-none py-1"
                  placeholder="Nhập phụ đề nhỏ..."
                />
              </>
            )}
          </div>
        ) : layout === "quote" ? (
          <div className="text-center space-y-3.5 w-full max-w-xl mx-auto px-4">
            <span className="text-2xl md:text-3xl text-indigo-400 font-serif opacity-70 block select-none">“</span>
            {isFullscreen ? (
              <>
                <p className="text-lg md:text-2xl font-medium italic text-slate-100 leading-relaxed">“ {slide.content} ”</p>
                {bulletPoints.length > 0 && <p className="text-sm md:text-base text-indigo-300 font-bold mt-2">— {bulletPoints[0]}</p>}
              </>
            ) : (
              <>
                <textarea
                  value={slide.content}
                  onChange={(e) => handleUpdateTitle(e.target.value)}
                  className="w-full bg-transparent text-center text-sm md:text-base font-medium italic text-slate-200 focus:outline-none resize-none no-scrollbar h-12 border-b border-transparent hover:border-white/10 focus:border-white/30 leading-relaxed"
                  placeholder="Nhập câu trích dẫn..."
                />
                <input
                  type="text"
                  value={bulletPoints[0] || ""}
                  onChange={(e) => handleUpdateFirstBullet(e.target.value)}
                  className="bg-transparent text-center text-[10px] md:text-xs text-indigo-300 font-bold focus:outline-none border-b border-transparent hover:border-white/10 w-full"
                  placeholder="— Tác giả / Nguồn trích dẫn"
                />
              </>
            )}
          </div>
        ) : layout === "two-columns" ? (
          <div className="space-y-4 w-full">
            {isFullscreen ? (
              <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-6">{slide.content}</h2>
            ) : (
              <input
                type="text"
                value={slide.content}
                onChange={(e) => handleUpdateTitle(e.target.value)}
                className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-white/30 text-lg md:text-xl font-bold text-white focus:outline-none"
                placeholder="Tiêu đề slide..."
              />
            )}
            <div className="grid grid-cols-2 gap-5 md:gap-8 pt-2">
              {/* Column Left */}
              <div className="space-y-2 border-l-2 border-indigo-500/20 pl-3">
                {!isFullscreen && <span className="text-[8px] font-bold text-indigo-400 block uppercase tracking-wider mb-1">Cột Trái</span>}
                {bulletPoints.slice(0, Math.ceil(bulletPoints.length / 2)).map((bp, i) => renderBulletItem(bp, i))}
              </div>
              {/* Column Right */}
              <div className="space-y-2 border-l-2 border-emerald-500/20 pl-3">
                {!isFullscreen && <span className="text-[8px] font-bold text-emerald-400 block uppercase tracking-wider mb-1">Cột Phải</span>}
                {bulletPoints.slice(Math.ceil(bulletPoints.length / 2)).map((bp, i) => renderBulletItem(bp, i + Math.ceil(bulletPoints.length / 2)))}
              </div>
            </div>
            {!isFullscreen && (
              <button
                type="button"
                onClick={handleAddBullet}
                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer mt-3"
              >
                + Thêm luận điểm
              </button>
            )}
          </div>
        ) : (
          /* Default: bullets */
          <div className="space-y-3 w-full">
            {!isFullscreen && (
              <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 opacity-90 block">
                BÁO CÁO THUYẾT TRÌNH • #{slide.id.substring(0, 8)}
              </span>
            )}
            {isFullscreen ? (
              <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-6">{slide.content}</h2>
            ) : (
              <input
                type="text"
                value={slide.content}
                onChange={(e) => handleUpdateTitle(e.target.value)}
                className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-white/30 text-lg md:text-xl font-bold text-white focus:outline-none"
                placeholder="Nhập tiêu đề slide..."
              />
            )}
            <div className="space-y-2.5 pt-2 border-l-2 border-indigo-500/20 pl-3.5">
              {bulletPoints.map((bp, i) => renderBulletItem(bp, i))}
              {!isFullscreen && (
                <button
                  type="button"
                  onClick={handleAddBullet}
                  className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer mt-2"
                >
                  + Thêm luận điểm
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Slide footer info */}
      {!isFullscreen && (
        <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-4 text-[8px] text-slate-500 font-bold uppercase tracking-wider font-mono select-none">
          <span>Master Slide Editor</span>
          <span>Slide Layout: {layout}</span>
        </div>
      )}
    </div>
  );
}
