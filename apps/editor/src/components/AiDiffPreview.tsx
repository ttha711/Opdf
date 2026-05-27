import React, { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";
import * as diff from "diff";

interface DiffChange {
  type: "insertion" | "deletion" | "modification";
  before: string;
  after: string;
  description: string;
}

interface Props {
  isOpen: boolean;
  original: string;
  modified: string;
  changes?: DiffChange[];
  onAccept: () => void;
  onAcceptChange?: (index: number) => void;
  onReject: () => void;
}

export default function AiDiffPreview({
  isOpen,
  original,
  modified,
  changes: providedChanges,
  onAccept,
  onReject,
}: Props) {
  const computedChanges = useMemo(() => {
    if (providedChanges) return providedChanges;

    // Compute diff using jsdiff
    const diffs = diff.diffWords(original, modified);
    const changes: DiffChange[] = [];
    let before = "";
    let after = "";

    for (const d of diffs) {
      if (d.added) {
        after += d.value;
      } else if (d.removed) {
        before += d.value;
      } else {
        if (before || after) {
          changes.push({
            type: after ? (before ? "modification" : "insertion") : "deletion",
            before: before.trim(),
            after: after.trim(),
            description: after ? `Đổi "${before.trim().substring(0, 30)}" → "${after.trim().substring(0, 30)}"` : `Xóa "${before.trim().substring(0, 30)}"`,
          });
          before = "";
          after = "";
        }
      }
    }

    if (before || after) {
      changes.push({
        type: after ? (before ? "modification" : "insertion") : "deletion",
        before: before.trim(),
        after: after.trim(),
        description: after ? `Đổi "${before.trim().substring(0, 30)}" → "${after.trim().substring(0, 30)}"` : `Xóa "${before.trim().substring(0, 30)}"`,
      });
    }

    return changes;
  }, [original, modified, providedChanges]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="bg-white border border-indigo-200 rounded-xl shadow-lg p-4 mx-4 mb-3"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-indigo-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            AI đã đề xuất thay đổi
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onReject}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Từ chối
            </button>
            <button
              onClick={onAccept}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Chấp nhận tất cả
            </button>
          </div>
        </div>

        {computedChanges.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">Không có thay đổi nào để hiển thị.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {computedChanges.map((change, i) => (
              <div
                key={i}
                className={`border rounded-lg p-2.5 text-xs ${
                  change.type === "insertion"
                    ? "border-emerald-200 bg-emerald-50"
                    : change.type === "deletion"
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      change.type === "insertion"
                        ? "bg-emerald-200 text-emerald-800"
                        : change.type === "deletion"
                        ? "bg-red-200 text-red-800"
                        : "bg-amber-200 text-amber-800"
                    }`}
                  >
                    {change.type === "insertion" ? "Thêm" : change.type === "deletion" ? "Xóa" : "Sửa"}
                  </span>
                  <span className="text-slate-500">{change.description}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {change.before && (
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium">Trước:</span>
                      <p className="text-red-700 bg-red-100/50 p-1.5 rounded mt-0.5 line-through">{change.before}</p>
                    </div>
                  )}
                  {change.after && (
                    <div className={!change.before ? "col-span-2" : ""}>
                      <span className="text-[10px] text-slate-400 font-medium">Sau:</span>
                      <p className="text-emerald-700 bg-emerald-100/50 p-1.5 rounded mt-0.5">{change.after}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
