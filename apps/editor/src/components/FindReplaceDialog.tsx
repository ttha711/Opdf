import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, ArrowUp, ArrowDown, Replace, CaseSensitive, WholeWord } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onFind: (term: string, options: FindOptions) => FindResult[];
  onReplace: (term: string, replacement: string, options: FindOptions) => number;
  onReplaceAll: (term: string, replacement: string, options: FindOptions) => number;
}

export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
}

export interface FindResult {
  index: number;
  start: number;
  end: number;
  text: string;
}

export default function FindReplaceDialog({ isOpen, onClose, onFind, onReplace, onReplaceAll }: Props) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<FindResult[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFindText("");
      setReplaceText("");
      setResults([]);
      setCurrentIdx(0);
      setStatusMessage(null);
      setTimeout(() => findInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const doFind = useCallback(() => {
    if (!findText.trim()) {
      setResults([]);
      return;
    }
    const opts: FindOptions = { matchCase, wholeWord };
    const found = onFind(findText, opts);
    setResults(found);
    if (found.length === 0) {
      setStatusMessage("Không tìm thấy kết quả");
      setCurrentIdx(0);
    } else {
      setCurrentIdx(0);
      setStatusMessage(`Tìm thấy ${found.length} kết quả`);
    }
  }, [findText, matchCase, wholeWord, onFind]);

  useEffect(() => {
    doFind();
  }, [doFind]);

  const handleReplaceOne = () => {
    if (!findText.trim() || results.length === 0) return;
    const count = onReplace(findText, replaceText, { matchCase, wholeWord });
    setStatusMessage(`Đã thay thế ${count} kết quả`);
    doFind();
  };

  const handleReplaceAll = () => {
    if (!findText.trim()) return;
    const count = onReplaceAll(findText, replaceText, { matchCase, wholeWord });
    setStatusMessage(`Đã thay thế tất cả ${count} kết quả`);
    doFind();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handleReplaceOne();
      } else {
        doFind();
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="absolute top-12 right-4 z-40 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
        >
          <div className="p-3 space-y-2">
            {/* Find Row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  ref={findInputRef}
                  type="text"
                  className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
                  placeholder="Tìm kiếm..."
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {findText && (
                  <button onClick={() => setFindText("")} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5 text-slate-400 text-xs font-mono">
                <span className={results.length > 0 ? "text-indigo-600 font-bold" : ""}>
                  {results.length > 0 ? currentIdx + 1 : 0}
                </span>
                <span>/</span>
                <span>{results.length}</span>
              </div>
              <button
                onClick={doFind}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                title="Tìm tiếp"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Replace Row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200">
                <Replace className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
                  placeholder="Thay bằng..."
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            {/* Options + Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMatchCase(!matchCase)}
                  className={`p-1 rounded text-xs transition-colors ${
                    matchCase ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Phân biệt hoa/thường"
                >
                  <CaseSensitive className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setWholeWord(!wholeWord)}
                  className={`p-1 rounded text-xs transition-colors ${
                    wholeWord ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Từ nguyên vẹn"
                >
                  <WholeWord className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleReplaceOne}
                  disabled={results.length === 0}
                  className="px-2 py-1 text-[10px] font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Thay
                </button>
                <button
                  onClick={handleReplaceAll}
                  disabled={results.length === 0}
                  className="px-2 py-1 text-[10px] font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Thay tất cả
                </button>
                <button
                  onClick={onClose}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {statusMessage && (
              <p className="text-[10px] text-slate-400">{statusMessage}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
