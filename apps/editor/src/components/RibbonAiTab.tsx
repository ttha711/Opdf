import React, { useState } from "react";
import {
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Presentation,
  Landmark,
  Languages,
  Wand2,
  SpellCheck,
  BookOpen,
  BarChart3,
  ChevronDown,
} from "lucide-react";

interface RibbonAiTabProps {
  handleAiQuickAction: (docPrompt: string) => Promise<void>;
  isRefiningAi: boolean;
  onMenuToggle?: (open: boolean) => void;
}

const AI_ACTIONS = [
  {
    label: "✨ Chuẩn hóa văn phong",
    prompt: "Sửa lỗi chính tả tiếng Việt, ngữ pháp, tối ưu câu từ rõ ràng, trôi chảy và chuyên nghiệp. Giữ nguyên các thẻ HTML.",
    color: "indigo",
  },
  {
    label: "🇬🇧 Dịch → Tiếng Anh",
    prompt: "Translate the entire selected/document text into English. Preserve HTML tags, write natural and professional English.",
    color: "blue",
  },
  {
    label: "🇻🇳 Dịch → Tiếng Việt",
    prompt: "Dịch toàn bộ nội dung đoạn văn sang Tiếng Việt. Giữ nguyên các thẻ HTML, dịch trôi chảy, tự nhiên, văn phong hành chính/thương mại.",
    color: "green",
  },
  {
    label: "📝 Tóm tắt thành gạch đầu dòng",
    prompt: "Tóm tắt ngắn gọn đoạn văn thành các ý chính dưới dạng danh sách gạch đầu dòng (<ul><li>). Giữ số liệu, tên riêng, ngày tháng.",
    color: "amber",
  },
  {
    label: "📈 Mở rộng & Phân tích",
    prompt: "Phân tích sâu hơn, diễn giải các ý chính và bổ sung 2-3 luận điểm logic để làm rõ nội dung. Trình bày rõ ràng, đoạn văn ngắn.",
    color: "purple",
  },
  {
    label: "🏛️ Văn phong trang trọng",
    prompt: "Chuyển sang văn phong hành chính nhà nước trang trọng, chuẩn mực. Dùng từ ngữ lịch sự, khách quan, đúng ngữ pháp tiếng Việt.",
    color: "slate",
  },
  {
    label: "💬 Văn phong thân thiện",
    prompt: "Chuyển nội dung sang phong cách viết thân thiện, gần gũi, dễ hiểu như đang nói chuyện với người bạn. Tránh từ ngữ cứng nhắc.",
    color: "emerald",
  },
  {
    label: "📊 Tạo bảng từ văn bản",
    prompt: "Chuyển đổi thông tin số liệu trong đoạn văn thành một bảng HTML đẹp có viền, padding và màu tiêu đề xanh nhạt. Cấu trúc rõ ràng theo hàng/cột.",
    color: "blue",
  },
  {
    label: "💡 Giải thích thuật ngữ",
    prompt: "Giải thích các thuật ngữ chuyên ngành, từ viết tắt hoặc khái niệm phức tạp trong đoạn văn. Giải thích ngắn gọn, dễ hiểu dạng chú thích.",
    color: "orange",
  },
  {
    label: "🔍 Kiểm tra mâu thuẫn logic",
    prompt: "Đọc kỹ đoạn văn và phát hiện các điểm mâu thuẫn, thiếu nhất quán về số liệu, thông tin hoặc logic. Liệt kê rõ từng điểm phát hiện được.",
    color: "red",
  },
  {
    label: "🎯 Tối ưu SEO",
    prompt: "Cải thiện đoạn văn để tối ưu hóa SEO: dùng từ khóa tự nhiên, câu ngắn gọn, tiêu đề rõ ràng, thêm keyword density phù hợp. Giữ nguyên HTML tags.",
    color: "teal",
  },
  {
    label: "📜 Trích dẫn học thuật",
    prompt: "Chuyển đổi nội dung sang phong cách học thuật: dùng văn phong trang trọng, thêm câu trích dẫn, ghi chú, và cấu trúc luận văn chuẩn APA.",
    color: "slate",
  },
];

const DOC_TEMPLATES = [
  {
    label: "Báo cáo Doanh thu năm",
    icon: <FileText className="w-3.5 h-3.5 text-indigo-500" />,
    prompt: "Tạo Báo cáo Doanh thu năm hoàn chỉnh gồm: tiêu đề lớn, phân tích tổng quan, bảng số liệu Excel tính tổng và biểu đồ phân tích.",
  },
  {
    label: "Hợp đồng Dịch vụ",
    icon: <Landmark className="w-3.5 h-3.5 text-amber-500" />,
    prompt: "Soạn Hợp đồng dịch vụ chuyên nghiệp: Điều khoản chung, Phạm vi công việc, Quyền lợi nghĩa vụ, bảng danh mục phí dịch vụ.",
  },
  {
    label: "Slide Startup Pitch",
    icon: <Presentation className="w-3.5 h-3.5 text-rose-500" />,
    prompt: "Tạo bộ Slide giới thiệu startup gồm: Slide tiêu đề, Vấn đề & Giải pháp, Mô hình kinh doanh, Đội ngũ, Kế hoạch triển khai.",
  },
  {
    label: "Bảng tính KPI nhân viên",
    icon: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />,
    prompt: "Tạo bảng tính KPI nhân sự: cột Tên, Chỉ tiêu, Kết quả, Tỉ lệ đạt %. Có công thức tính tổng và trung bình tự động.",
  },
  {
    label: "Kế hoạch Dự án CNTT",
    icon: <BarChart3 className="w-3.5 h-3.5 text-blue-500" />,
    prompt: "Tạo kế hoạch dự án CNTT đầy đủ: mô tả, mục tiêu, bảng timeline Gantt đơn giản, phân công nhân sự, bảng ngân sách.",
  },
  {
    label: "Đề xuất Marketing",
    icon: <Wand2 className="w-3.5 h-3.5 text-purple-500" />,
    prompt: "Tạo đề xuất chiến lược marketing đầy đủ: phân tích thị trường, target audience, kênh truyền thông, bảng ngân sách và KPI đo lường.",
  },
  {
    label: "Biên bản Cuộc họp",
    icon: <BookOpen className="w-3.5 h-3.5 text-slate-500" />,
    prompt: "Tạo mẫu biên bản cuộc họp chuyên nghiệp: tiêu đề, thông tin buổi họp, danh sách thành viên, nội dung thảo luận, quyết định và giao việc.",
  },
  {
    label: "Báo giá Dịch vụ",
    icon: <FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" />,
    prompt: "Tạo bảng báo giá dịch vụ chuyên nghiệp: đầu mục dịch vụ, số lượng, đơn giá, thành tiền, thuế VAT 10%, tổng cộng. Có công thức tính tự động.",
  },
];

export default function RibbonAiTab({ handleAiQuickAction, isRefiningAi, onMenuToggle }: RibbonAiTabProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  React.useEffect(() => {
    onMenuToggle?.(showTemplates || showMoreActions);
  }, [showTemplates, showMoreActions, onMenuToggle]);

  const visibleActions = AI_ACTIONS.slice(0, 6);
  const moreActions = AI_ACTIONS.slice(6);

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">

      {/* ── Template Generator ──────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          disabled={isRefiningAi}
          onClick={() => setShowTemplates(v => !v)}
          className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Tạo tài liệu mẫu AI</span>
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
        {showTemplates && (
          <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 w-64 space-y-0.5">
            <span className="font-bold text-[9px] text-slate-400 uppercase tracking-wider block px-2 pb-1.5">
              Chọn mẫu tài liệu:
            </span>
            {DOC_TEMPLATES.map((tpl, i) => (
              <button
                key={i}
                type="button"
                disabled={isRefiningAi}
                onClick={() => { handleAiQuickAction(tpl.prompt); setShowTemplates(false); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-indigo-50 rounded-lg text-left cursor-pointer transition-colors"
              >
                {tpl.icon}
                <span className="text-[10px] font-semibold text-slate-700">{tpl.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Translate buttons ────────────────────────────── */}
      <div className="flex items-center gap-1 border-l border-r border-slate-200 px-2">
        <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <button type="button" disabled={isRefiningAi}
          onClick={() => handleAiQuickAction("Translate the entire document content into English. Preserve HTML structure and all tags. Write professional, natural English.")}
          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 disabled:opacity-60">
          {isRefiningAi && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
          🇬🇧 EN
        </button>
        <button type="button" disabled={isRefiningAi}
          onClick={() => handleAiQuickAction("Dịch toàn bộ nội dung tài liệu sang Tiếng Việt. Giữ nguyên tất cả thẻ HTML. Dịch trôi chảy, tự nhiên, văn phong thương mại.")}
          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 disabled:opacity-60">
          {isRefiningAi && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
          🇻🇳 VI
        </button>
      </div>

      {/* ── Grammar Check ────────────────────────────────── */}
      <button type="button" disabled={isRefiningAi}
        onClick={() => handleAiQuickAction("Kiểm tra và sửa toàn bộ lỗi chính tả, ngữ pháp, dấu câu trong tài liệu. Chuẩn hóa văn phong chuyên nghiệp. Giữ nguyên HTML tags và cấu trúc.")}
        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-60">
        <SpellCheck className="w-3.5 h-3.5" />
        <span>Kiểm tra văn phong</span>
      </button>

      {/* ── Summarize to Slides ──────────────────────────── */}
      <button type="button" disabled={isRefiningAi}
        onClick={() => handleAiQuickAction("Đọc toàn bộ nội dung Word hiện tại và tạo lại tài liệu với ít nhất 5 blocks slide PowerPoint tóm tắt nội dung chính theo từng ý lớn. Giữ nguyên phần văn bản gốc nhưng thêm các slide ở cuối.")}
        className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-60">
        <Presentation className="w-3.5 h-3.5" />
        <span>→ Slide tóm tắt</span>
      </button>

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* ── Quick AI Actions ─────────────────────────────── */}
      <span className="text-[9px] text-slate-400 font-bold uppercase hidden xl:inline">Thao tác nhanh:</span>
      <div className="flex flex-wrap gap-1.5">
        {visibleActions.map((act, i) => (
          <button
            key={i}
            type="button"
            disabled={isRefiningAi}
            onClick={() => handleAiQuickAction(act.prompt)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 text-slate-700 rounded-lg text-[10px] font-semibold cursor-pointer transition-all flex items-center gap-1 disabled:opacity-60"
          >
            {isRefiningAi && <RefreshCw className="w-2.5 h-2.5 animate-spin opacity-50" />}
            {act.label}
          </button>
        ))}
      </div>

      {/* ── More Actions Dropdown ────────────────────────── */}
      <div className="relative">
        <button type="button" onClick={() => setShowMoreActions(v => !v)}
          className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-semibold cursor-pointer flex items-center gap-1">
          Thêm...
          <ChevronDown className="w-3 h-3" />
        </button>
        {showMoreActions && (
          <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 w-52 space-y-0.5">
            {moreActions.map((act, i) => (
              <button key={i} type="button" disabled={isRefiningAi}
                onClick={() => { handleAiQuickAction(act.prompt); setShowMoreActions(false); }}
                className="w-full text-left px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-indigo-50 rounded-lg cursor-pointer">
                {act.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
