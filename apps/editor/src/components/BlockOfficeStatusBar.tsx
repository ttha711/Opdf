import React, { useMemo } from "react";
import { AIParsedDocument } from "../types";
import {
  FileText,
  Grid,
  Presentation,
  Clock,
  FileCode,
  Type,
  Hash,
  BookOpen,
  Table2,
  Sigma,
} from "lucide-react";

interface BlockOfficeStatusBarProps {
  currentDoc: AIParsedDocument;
  activeTab: "word" | "excel" | "powerpoint";
  activeSlideIdx: number;
}

function Divider() {
  return <span className="text-slate-200 select-none">|</span>;
}

function StatItem({
  icon,
  label,
  value,
  title,
}: {
  icon?: React.ReactNode;
  label?: string;
  value: string | number;
  title?: string;
}) {
  return (
    <div className="flex items-center gap-1" title={title}>
      {icon}
      {label && <span className="text-slate-400">{label}</span>}
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

export default function BlockOfficeStatusBar({
  currentDoc,
  activeTab,
  activeSlideIdx,
}: BlockOfficeStatusBarProps) {
  const stats = useMemo(() => {
    let wordCount = 0;
    let charCount = 0;
    let charNoSpaceCount = 0;
    let paragraphCount = 0;
    let tableCount = 0;
    let formulaCount = 0;
    let slideCount = 0;

    currentDoc.blocks.forEach(block => {
      // Word/char count from text blocks
      if (["paragraph", "heading", "callout", "slide"].includes(block.type)) {
        const plainText = block.content.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").trim();
        if (plainText) {
          const words = plainText.split(/\s+/).filter(w => w.length > 0);
          wordCount += words.length;
          charCount += plainText.length;
          charNoSpaceCount += plainText.replace(/\s/g, "").length;
        }
        if (block.meta?.bulletPoints) {
          block.meta.bulletPoints.forEach(bp => {
            const bpWords = bp.split(/\s+/).filter(w => w.length > 0);
            wordCount += bpWords.length;
            charCount += bp.length;
          });
        }
      }

      if (block.type === "paragraph") paragraphCount++;
      if (block.type === "table" || (block.tableData && block.tableData.length > 0)) tableCount++;
      if (block.type === "slide") slideCount++;

      if (block.tableData) {
        block.tableData.forEach(row =>
          row.forEach(cell => {
            if (cell.formula) formulaCount++;
          })
        );
      }
    });

    const pageCount = Math.max(1, Math.ceil(wordCount / 300));
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
      wordCount,
      charCount,
      charNoSpaceCount,
      paragraphCount,
      tableCount,
      formulaCount,
      slideCount,
      pageCount,
      readingMinutes,
    };
  }, [currentDoc]);

  const activeLabel =
    activeTab === "word"
      ? { icon: <FileText className="w-3.5 h-3.5 text-indigo-500" />, label: "Văn bản Word" }
      : activeTab === "excel"
      ? { icon: <Grid className="w-3.5 h-3.5 text-emerald-500" />, label: "Bảng tính Excel" }
      : { icon: <Presentation className="w-3.5 h-3.5 text-orange-500" />, label: "Trình chiếu PowerPoint" };

  return (
    <footer
      className="h-8 border-t border-slate-200 bg-slate-50 px-4 flex items-center justify-between text-[10px] text-slate-500 font-sans select-none shrink-0 w-full sticky bottom-0 z-20 print:hidden"
    >
      {/* ── Left: save indicator + mode ── */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Đã lưu tự động" />
        <span className="font-semibold text-slate-600">Đã lưu</span>
        <Divider />
        <span className="flex items-center gap-1 font-medium">
          {activeLabel.icon}
          {activeLabel.label}
        </span>
        <Divider />
        <span className="text-slate-500 font-medium" title="Tiêu đề tài liệu">
          {currentDoc.title}
        </span>
      </div>

      {/* ── Right: contextual stats ── */}
      <div className="flex items-center gap-3">
        {activeTab === "word" && (
          <>
            <StatItem
              icon={<BookOpen className="w-3 h-3 text-slate-400" />}
              label="Trang:"
              value={stats.pageCount}
              title="Số trang ước tính (300 từ/trang)"
            />
            <Divider />
            <StatItem
              icon={<Type className="w-3 h-3 text-slate-400" />}
              label="Từ:"
              value={stats.wordCount.toLocaleString()}
              title="Số từ"
            />
            <Divider />
            <StatItem
              icon={<Hash className="w-3 h-3 text-slate-400" />}
              label="Ký tự:"
              value={stats.charCount.toLocaleString()}
              title="Số ký tự (bao gồm khoảng trắng)"
            />
            <Divider />
            <StatItem
              icon={<Clock className="w-3 h-3 text-slate-400" />}
              value={`~${stats.readingMinutes} phút đọc`}
              title="Thời gian đọc ước tính (200 từ/phút)"
            />
          </>
        )}

        {activeTab === "excel" && (
          <>
            <StatItem
              icon={<Table2 className="w-3 h-3 text-emerald-500" />}
              label="Bảng:"
              value={stats.tableCount}
              title="Số bảng dữ liệu"
            />
            <Divider />
            <StatItem
              icon={<Sigma className="w-3 h-3 text-emerald-500" />}
              label="Công thức:"
              value={stats.formulaCount}
              title="Số ô có công thức tính toán"
            />
          </>
        )}

        {activeTab === "powerpoint" && (
          <>
            <StatItem
              icon={<Presentation className="w-3 h-3 text-orange-500" />}
              label="Slide:"
              value={
                stats.slideCount > 0
                  ? `${activeSlideIdx + 1} / ${stats.slideCount}`
                  : "0 slide"
              }
              title="Vị trí slide hiện tại / tổng slide"
            />
          </>
        )}

        <Divider />
        <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
          <FileCode className="w-3 h-3" />
          <span>v2.0.0-prod</span>
        </div>
      </div>
    </footer>
  );
}
