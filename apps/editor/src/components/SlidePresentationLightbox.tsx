import React from "react";
import { Presentation, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AIParsedDocument, DocumentBlock } from "../types";
import SlideCanvas from "./SlideCanvas";

interface SlidePresentationLightboxProps {
  isFullscreenSlide: boolean;
  setIsFullscreenSlide: (val: boolean) => void;
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  activeSlideIdx: number;
  setActiveSlideIdx: React.Dispatch<React.SetStateAction<number>> | ((val: number | ((prev: number) => number)) => void);
  slides: DocumentBlock[];
  activeSlide: DocumentBlock;
}

export default function SlidePresentationLightbox({
  isFullscreenSlide,
  setIsFullscreenSlide,
  currentDoc,
  setCurrentDoc,
  activeSlideIdx,
  setActiveSlideIdx,
  slides,
  activeSlide
}: SlidePresentationLightboxProps) {
  return (
    <AnimatePresence>
      {isFullscreenSlide && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-950 z-50 flex flex-col justify-between p-10 select-none font-sans"
        >
          <div className="flex items-center justify-between font-bold text-xs tracking-wider uppercase text-slate-400 z-10">
            <div className="flex items-center gap-2">
              <Presentation className="w-4 h-4 text-indigo-500" />
              <span>{currentDoc.title || "Bản thuyết trình"}</span>
            </div>
            <button 
              onClick={() => setIsFullscreenSlide(false)}
              className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer font-bold text-xs"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Thoát Trình chiếu (Esc)</span>
            </button>
          </div>

          <div className="max-w-4xl mx-auto py-6 z-15 text-white w-full select-text self-center flex-grow flex items-center justify-center">
            <div className="w-full aspect-[16/9] max-h-[70vh]">
              <SlideCanvas slide={activeSlide} currentDoc={currentDoc} setCurrentDoc={setCurrentDoc} isFullscreen={true} />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-900 pt-5 text-white z-10">
            <div className="flex items-center gap-3">
              <button
                disabled={activeSlideIdx === 0}
                onClick={() => {
                  if (typeof setActiveSlideIdx === "function") {
                    // @ts-ignore
                    setActiveSlideIdx(p => Math.max(0, p - 1));
                  }
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white px-3.5 py-2 rounded-xl disabled:opacity-30 cursor-pointer text-xs font-bold transition-all"
              >
                ◄ Lùi lại
              </button>
              <span className="font-mono font-bold text-slate-300 bg-slate-900 px-3 py-1.5 border border-slate-800 rounded-lg text-xs">
                Slide {activeSlideIdx + 1} / {slides.length}
              </span>
              <button
                disabled={activeSlideIdx === slides.length - 1}
                onClick={() => {
                  if (typeof setActiveSlideIdx === "function") {
                    // @ts-ignore
                    setActiveSlideIdx(p => Math.min(slides.length - 1, p + 1));
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl disabled:opacity-30 cursor-pointer text-xs font-bold transition-all"
              >
                Kế tiếp ►
              </button>
            </div>
            <span className="text-slate-600 font-mono text-xs">OFFICE PRESENTATION HUB © 2026</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
