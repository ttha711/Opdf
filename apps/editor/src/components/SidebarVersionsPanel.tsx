import React, { useState } from "react";
import { History, Save, RotateCcw, Trash2, Edit3, Check, X } from "lucide-react";
import { AIParsedDocument, DocumentVersion } from "../types";

interface SidebarVersionsPanelProps {
  currentDoc: AIParsedDocument;
  versions: DocumentVersion[];
  onSaveVersion: (label?: string) => void;
  onRestoreVersion: (id: string) => void;
  onDeleteVersion: (id: string) => void;
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export default function SidebarVersionsPanel({
  currentDoc,
  versions,
  onSaveVersion,
  onRestoreVersion,
  onDeleteVersion,
}: SidebarVersionsPanelProps) {
  const [savingLabel, setSavingLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleSave = () => {
    onSaveVersion(savingLabel.trim() || undefined);
    setSavingLabel("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-amber-500 shrink-0" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Lịch sử Phiên bản</h3>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Lưu trạng thái tài liệu hiện tại để có thể khôi phục sau.
      </p>

      {/* ── Save New Version ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
        <p className="text-[10px] font-semibold text-amber-700">Lưu phiên bản hiện tại:</p>
        <input
          type="text"
          value={savingLabel}
          onChange={e => setSavingLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
          placeholder={`${currentDoc.title} – Phiên bản mới`}
          className="w-full px-2.5 py-1.5 text-[10px] bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 text-slate-700"
        />
        <button
          type="button"
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
        >
          <Save className="w-3 h-3" />
          Lưu phiên bản
        </button>
      </div>

      {/* ── Version List ── */}
      {versions.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-[11px]">Chưa có phiên bản nào được lưu.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
            {versions.length} phiên bản đã lưu:
          </p>
          {versions.map(v => (
            <div
              key={v.id}
              className="bg-white border border-slate-200 rounded-xl p-3 space-y-2"
            >
              {editingId === v.id ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        // Rename handled by parent — just close for now
                        setEditingId(null);
                      }
                    }}
                    className="flex-1 px-2 py-1 text-[10px] border border-indigo-300 rounded focus:outline-none"
                  />
                  <button onClick={() => setEditingId(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                    <Check className="w-3 h-3 text-emerald-500" />
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-700 truncate">{v.label}</p>
                    <p className="text-[9px] text-slate-400">{formatDate(v.createdAt)}</p>
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      {v.snapshot.blocks.length} khối · {v.snapshot.title}
                    </p>
                  </div>
                  <button
                    onClick={() => { setEditingId(v.id); setEditLabel(v.label); }}
                    className="p-1 text-slate-400 hover:text-indigo-500 cursor-pointer shrink-0"
                    title="Đổi tên"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Khôi phục phiên bản "${v.label}"?\nTài liệu hiện tại sẽ bị ghi đè.`)) {
                      onRestoreVersion(v.id);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Khôi phục
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Xóa phiên bản "${v.label}"?`)) {
                      onDeleteVersion(v.id);
                    }
                  }}
                  className="p-1.5 hover:bg-red-50 hover:text-red-500 text-slate-400 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                  title="Xóa phiên bản này"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
