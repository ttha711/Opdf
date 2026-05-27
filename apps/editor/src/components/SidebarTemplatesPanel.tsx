import React, { useState } from "react";
import { LayoutTemplate, ChevronRight, Search } from "lucide-react";
import { AIParsedDocument } from "../types";
import { PRESET_TEMPLATES } from "../data/presetTemplates";

interface SidebarTemplatesPanelProps {
  onLoadTemplate: (doc: AIParsedDocument) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  "Tài liệu mới": "📄",
  "Báo cáo Kinh doanh Quý": "📊",
  "Hợp đồng Dịch vụ Công nghệ": "📋",
  "Kế hoạch Dự án CNTT": "🗓️",
  "Biên bản Cuộc họp": "📝",
  "Bảng đánh giá KPI Nhân viên": "🎯",
  "Đề xuất Chiến lược Marketing": "📣",
  "Báo giá Dịch vụ": "💰",
  "Startup Pitch Deck": "🚀",
  "Phân tích Tài chính Doanh nghiệp": "💹",
};

export default function SidebarTemplatesPanel({ onLoadTemplate }: SidebarTemplatesPanelProps) {
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = PRESET_TEMPLATES.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <LayoutTemplate className="w-4 h-4 text-emerald-500 shrink-0" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Thư viện Mẫu tài liệu</h3>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Chọn mẫu để tạo tài liệu chuyên nghiệp ngay lập tức. Tất cả mẫu có sẵn dữ liệu, bảng tính và slide.
      </p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm kiếm mẫu..."
          className="w-full pl-7 pr-3 py-2 text-[10px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700"
        />
      </div>

      {/* Template List */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-4">Không tìm thấy mẫu phù hợp.</p>
        )}
        {filtered.map(template => {
          const icon = CATEGORY_ICONS[template.title] || "📄";
          const blockCounts = {
            word: template.blocks.filter(b => ["heading", "paragraph", "callout"].includes(b.type)).length,
            table: template.blocks.filter(b => b.type === "table").length,
            slide: template.blocks.filter(b => b.type === "slide").length,
          };

          return (
            <button
              key={template.title}
              type="button"
              onClick={() => {
                if (confirm(`Tải mẫu "${template.title}"?\nTài liệu hiện tại sẽ bị thay thế.`)) {
                  // Deep clone template
                  const cloned: AIParsedDocument = JSON.parse(JSON.stringify(template));
                  // Regenerate IDs to avoid conflicts
                  cloned.blocks = cloned.blocks.map((b, i) => ({
                    ...b,
                    id: `${b.id}_${Date.now()}_${i}`,
                  }));
                  onLoadTemplate(cloned);
                }
              }}
              onMouseEnter={() => setHoveredId(template.title)}
              onMouseLeave={() => setHoveredId(null)}
              className="w-full text-left bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 rounded-xl p-3 transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-700 group-hover:text-emerald-700 truncate">
                      {template.title}
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-emerald-500 shrink-0" />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                    {template.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {blockCounts.word > 0 && (
                      <span className="text-[8px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full font-semibold">
                        {blockCounts.word} văn bản
                      </span>
                    )}
                    {blockCounts.table > 0 && (
                      <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded-full font-semibold">
                        {blockCounts.table} bảng
                      </span>
                    )}
                    {blockCounts.slide > 0 && (
                      <span className="text-[8px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-full font-semibold">
                        {blockCounts.slide} slide
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
