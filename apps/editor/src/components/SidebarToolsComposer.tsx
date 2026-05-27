import React, { useState } from "react";
import { AIParsedDocument } from "../types";
import { Search, RefreshCw, AlertCircle, Sparkles, HelpCircle } from "lucide-react";

interface SidebarToolsComposerProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
}

export default function SidebarToolsComposer({
  currentDoc,
  setCurrentDoc,
  selectedBlockId,
  setSelectedBlockId
}: SidebarToolsComposerProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useAiSemantic, setUseAiSemantic] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<{ id: string; type: string; snippet: string }[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const escapeRegExp = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const handleSearch = async () => {
    if (!findText.trim()) {
      setResults([]);
      setStatusMessage("Vui lòng nhập từ khoá tìm kiếm.");
      return;
    }

    setIsSearching(true);
    setStatusMessage(null);

    try {
      if (useAiSemantic) {
        // AI Semantic Search
        const res = await fetch("/api/semantic-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: currentDoc.blocks, query: findText })
        });
        const data = await res.json();
        if (data.matchedIds && data.matchedIds.length > 0) {
          const matchedBlocks = currentDoc.blocks
            .filter(b => data.matchedIds.includes(b.id))
            .map(b => {
              const snippet = b.content ? b.content.replace(/<[^>]*>/g, "").substring(0, 60) + "..." : `Khối dữ liệu ${b.type}`;
              return { id: b.id, type: b.type, snippet };
            });
          setResults(matchedBlocks);
          setStatusMessage(`Tìm thấy ${matchedBlocks.length} kết quả bằng AI.`);
        } else {
          setResults([]);
          setStatusMessage("Không tìm thấy kết quả phù hợp bằng AI.");
        }
      } else {
        // Plain text search
        const query = findText.toLowerCase();
        const matched = currentDoc.blocks
          .filter(b => {
            const content = (b.content || "").toLowerCase();
            return content.includes(query);
          })
          .map(b => {
            const snippet = b.content.replace(/<[^>]*>/g, "");
            const idx = snippet.toLowerCase().indexOf(query);
            const start = Math.max(0, idx - 20);
            const end = Math.min(snippet.length, idx + findText.length + 30);
            const text = (start > 0 ? "..." : "") + snippet.substring(start, end) + (end < snippet.length ? "..." : "");
            return { id: b.id, type: b.type, snippet: text };
          });

        setResults(matched);
        setStatusMessage(`Tìm thấy ${matched.length} kết quả phù hợp.`);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Đã xảy ra lỗi khi tìm kiếm.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleReplaceSingle = (blockId: string) => {
    if (!findText) return;

    setCurrentDoc(prev => {
      const updated = prev.blocks.map(b => {
        if (b.id === blockId && b.content) {
          const regex = new RegExp(escapeRegExp(findText), "gi");
          const newContent = b.content.replace(regex, replaceText);
          return { ...b, content: newContent };
        }
        return b;
      });
      return { ...prev, blocks: updated };
    });

    setStatusMessage("Đã thay thế thành công!");
    // Refresh search after replace
    setTimeout(() => {
      handleSearch();
    }, 200);
  };

  const handleReplaceAll = () => {
    if (!findText) return;

    setCurrentDoc(prev => {
      const updated = prev.blocks.map(b => {
        if (b.content) {
          const regex = new RegExp(escapeRegExp(findText), "gi");
          const newContent = b.content.replace(regex, replaceText);
          return { ...b, content: newContent };
        }
        return b;
      });
      return { ...prev, blocks: updated };
    });

    setStatusMessage("Đã thay thế tất cả mọi vị trí!");
    setResults([]);
  };

  return (
    <div className="flex flex-col space-y-4 font-sans text-xs select-none">
      <div className="space-y-1">
        <h4 className="font-bold text-slate-700 uppercase tracking-wider">Tìm kiếm & Thay thế</h4>
        <p className="text-[10px] text-slate-400">Tìm kiếm và cập nhật nhanh nội dung văn bản trong tài liệu</p>
      </div>

      {/* Find input */}
      <div className="space-y-1.5">
        <label className="font-bold text-slate-500">Tìm nội dung:</label>
        <div className="relative">
          <input
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Nhập từ hoặc cụm từ..."
            className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium text-slate-800"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Replace input */}
      <div className="space-y-1.5">
        <label className="font-bold text-slate-500">Thay thế bằng:</label>
        <div className="relative">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Từ thay thế mới..."
            className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium text-slate-800"
          />
          <RefreshCw className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* AI Semantic Toggle */}
      <div className="flex items-center justify-between p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span className="font-bold text-indigo-950">Tìm kiếm AI thông minh</span>
        </div>
        <input
          type="checkbox"
          checked={useAiSemantic}
          onChange={(e) => setUseAiSemantic(e.target.checked)}
          className="w-4 h-4 accent-indigo-600 cursor-pointer"
        />
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5"
        >
          {isSearching ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Tìm kiếm"}
        </button>
        <button
          onClick={handleReplaceAll}
          disabled={!findText || results.length === 0}
          className="py-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer transition-all disabled:opacity-50"
        >
          Thay thế hết
        </button>
      </div>

      {statusMessage && (
        <div className="p-2 bg-slate-100 text-slate-600 rounded-md font-medium text-[10px] flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-slate-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Search results list */}
      {results.length > 0 && (
        <div className="space-y-2">
          <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">
            Danh sách kết quả ({results.length}):
          </span>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 p-1.5 rounded-lg bg-slate-50/50">
            {results.map((res) => (
              <div
                key={res.id}
                onClick={() => setSelectedBlockId(res.id)}
                className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                  selectedBlockId === res.id
                    ? "bg-indigo-50/70 border-indigo-200"
                    : "bg-white border-slate-150 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[9px] uppercase px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded-md">
                    {res.type}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReplaceSingle(res.id);
                    }}
                    className="text-[9px] font-bold text-indigo-650 hover:underline"
                  >
                    Thay thế
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 font-medium line-clamp-2 leading-relaxed">
                  {res.snippet}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
