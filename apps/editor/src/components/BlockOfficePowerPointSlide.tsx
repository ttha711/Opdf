import React, { useEffect } from "react";
import { Presentation, Plus } from "lucide-react";
import { AIParsedDocument, DocumentBlock } from "../types";
import SlideCanvas from "./SlideCanvas";
import SlideThumbnailSidebar from "./SlideThumbnailSidebar";
import SlidePresentationLightbox from "./SlidePresentationLightbox";
import SlideControls from "./SlideControls";

interface BlockOfficePowerPointSlideProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  activeSlideIdx: number;
  setActiveSlideIdx: React.Dispatch<React.SetStateAction<number>>;
  isFullscreenSlide: boolean;
  setIsFullscreenSlide: (val: boolean) => void;
}

export default function BlockOfficePowerPointSlide({
  currentDoc,
  setCurrentDoc,
  activeSlideIdx,
  setActiveSlideIdx,
  isFullscreenSlide,
  setIsFullscreenSlide
}: BlockOfficePowerPointSlideProps) {
  const slides = currentDoc.blocks.filter(b => b.type === "slide");

  const handleAddSlide = () => {
    const newSlide: DocumentBlock = {
      id: `block-slide-${Math.random().toString(36).substring(2, 11)}`,
      type: "slide",
      content: "Tiêu đề Slide Mới",
      meta: {
        slideBg: "slate",
        layout: "bullets",
        bulletPoints: ["Nội dung luận điểm trình bày 1", "Nội dung luận điểm trình bày 2"]
      }
    };
    setCurrentDoc(prev => ({ ...prev, blocks: [...prev.blocks, newSlide] }));
    setActiveSlideIdx(slides.length);
  };

  const handleDeleteSlide = () => {
    if (slides.length <= 1) {
      alert("Tài liệu trình chiếu phải chứa ít nhất 1 slide!");
      return;
    }
    const currentSlide = slides[activeSlideIdx];
    setCurrentDoc(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== currentSlide.id) }));
    setActiveSlideIdx(Math.max(0, activeSlideIdx - 1));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreenSlide) setIsFullscreenSlide(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenSlide, setIsFullscreenSlide]);

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-14 bg-white border border-slate-200 rounded-2xl text-slate-400 font-sans w-full max-w-3xl">
        <Presentation className="w-10 h-10 text-indigo-400 mb-2 animate-bounce" />
        <p className="font-bold text-xs text-slate-700">Chưa có Slide thiết kế nào được dựng.</p>
        <button onClick={handleAddSlide} className="mt-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> Khởi tạo Slide đầu tiên
        </button>
      </div>
    );
  }

  const activeSlide = slides[activeSlideIdx] || slides[0];

  return (
    <div className="w-full max-w-5xl flex gap-4 font-sans select-none items-start">
      <SlideThumbnailSidebar
        slides={slides}
        activeSlideIdx={activeSlideIdx}
        setActiveSlideIdx={setActiveSlideIdx}
        onAddSlide={handleAddSlide}
        onDeleteSlide={handleDeleteSlide}
        currentDoc={currentDoc}
        setCurrentDoc={setCurrentDoc}
      />

      <div className="flex-grow space-y-4 max-w-3xl">
        <SlideControls
          activeSlideIdx={activeSlideIdx}
          slidesCount={slides.length}
          setActiveSlideIdx={setActiveSlideIdx}
          onAddSlide={handleAddSlide}
          onDeleteSlide={handleDeleteSlide}
          currentSlide={activeSlide}
          setCurrentDoc={setCurrentDoc}
          setIsFullscreenSlide={setIsFullscreenSlide}
        />

        <SlideCanvas slide={activeSlide} currentDoc={currentDoc} setCurrentDoc={setCurrentDoc} />
      </div>

      <SlidePresentationLightbox
        isFullscreenSlide={isFullscreenSlide}
        setIsFullscreenSlide={setIsFullscreenSlide}
        currentDoc={currentDoc}
        setCurrentDoc={setCurrentDoc}
        activeSlideIdx={activeSlideIdx}
        setActiveSlideIdx={setActiveSlideIdx}
        slides={slides}
        activeSlide={activeSlide}
      />
    </div>
  );
}
