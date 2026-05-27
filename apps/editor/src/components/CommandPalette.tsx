import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, ArrowRight } from "lucide-react";

interface Command {
  id: string;
  label: string;
  category: "edit" | "ai" | "insert" | "export" | "view" | "navigate";
  shortcut?: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ isOpen, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIdx(0);
    listRef.current?.scrollTo(0, 0);
  }, [query]);

  const execute = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      e.preventDefault();
      execute(filtered[selectedIdx]);
    }
  };

  useEffect(() => {
    if (listRef.current && selectedIdx >= 0) {
      const item = listRef.current.children[selectedIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      edit: "Chỉnh sửa",
      ai: "AI",
      insert: "Chèn",
      export: "Xuất tệp",
      view: "Xem",
      navigate: "Điều hướng",
    };
    return map[cat] || cat;
  };

  const categories = [...new Set(filtered.map((c) => c.category))];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                placeholder="Nhập lệnh... (tìm, thay thế, AI, xuất, chèn...)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">
                  Không tìm thấy lệnh phù hợp
                </p>
              ) : (
                categories.map((cat) => {
                  const catCommands = filtered.filter((c) => c.category === cat);
                  if (catCommands.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {categoryLabel(cat)}
                      </div>
                      {catCommands.map((cmd) => {
                        const globalIdx = filtered.indexOf(cmd);
                        const isSelected = globalIdx === selectedIdx;
                        return (
                          <button
                            key={cmd.id}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                              isSelected
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                            onClick={() => execute(cmd)}
                            onMouseEnter={() => setSelectedIdx(globalIdx)}
                          >
                            <span className="flex-1">{cmd.label}</span>
                            {cmd.shortcut && (
                              <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                {cmd.shortcut}
                              </kbd>
                            )}
                            {isSelected && <ArrowRight className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 flex items-center gap-4">
              <span>
                <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded">↑↓</kbd> Điều hướng
              </span>
              <span>
                <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded">↵</kbd> Chọn
              </span>
              <span>
                <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded">Esc</kbd> Đóng
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
