import React from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  CheckSquare, 
  Loader2,
  Layers,
  Languages
} from "lucide-react";
import { cn } from "../lib/utils";

interface PdfToHtmlRightSidebarProps {
  selectedPdfSelection: {
    html: string;
    text: string;
    range: Range | null;
  } | null;
  pdfSelectionPrompt: string;
  setPdfSelectionPrompt: (val: string) => void;
  pdfSelectionEditing: boolean;
  isRightSidebarCollapsed: boolean;
  setIsRightSidebarCollapsed: (collapsed: boolean) => void;
  applyAISelectionEdit: () => void;
  applyAISelectionTranslate: () => void;

  // AI Image Layer Edit props
  pdfViewerTab?: "visual" | "compare" | "xml" | "image_edit";
  imageCropBox?: { x: number; y: number; w: number; h: number } | null;
  croppedImageBase64?: string | null;
  setCroppedImageBase64?: (val: string | null) => void;
  imageEditPrompt?: string;
  setImageEditPrompt?: (val: string) => void;
  isImageEditing?: boolean;
  applyImageRegionEdit?: () => void;
}

export default function PdfToHtmlRightSidebar({
  selectedPdfSelection,
  pdfSelectionPrompt,
  setPdfSelectionPrompt,
  pdfSelectionEditing,
  isRightSidebarCollapsed,
  setIsRightSidebarCollapsed,
  applyAISelectionEdit,
  applyAISelectionTranslate,

  // Destructured Image Edit props
  pdfViewerTab,
  imageCropBox,
  croppedImageBase64,
  setCroppedImageBase64,
  imageEditPrompt,
  setImageEditPrompt,
  isImageEditing,
  applyImageRegionEdit
}: PdfToHtmlRightSidebarProps) {
  return (
    <aside className={cn(
      "bg-white p-5 flex flex-col justify-between overflow-y-auto h-full shrink-0 border-l border-slate-200 transition-all duration-300",
      isRightSidebarCollapsed ? "w-full lg:w-[68px] p-2" : "w-full lg:w-76 p-5"
    )}>
      <div className="space-y-4 font-sans">
        <div className={cn(
          "flex items-center justify-between pb-2 border-b border-slate-100",
          isRightSidebarCollapsed ? "flex-col gap-2" : "flex-row"
        )}>
          <button
            onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors cursor-pointer"
            title={isRightSidebarCollapsed ? "Mở rộng thanh trợ lý" : "Thu nhỏ thanh trợ lý"}
          >
            {isRightSidebarCollapsed ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {!isRightSidebarCollapsed && (
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 select-none">
              <Sparkles className="w-4 h-4 text-indigo-505 animate-pulse" />
              <span>Biên tập tinh chỉnh khu vực</span>
            </span>
          )}
          {!isRightSidebarCollapsed && (
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          )}
        </div>

        {/* Prompt options based on active tab / selection */}
        {pdfViewerTab === "image_edit" ? (
          isRightSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-4 py-8">
              {croppedImageBase64 ? (
                <button
                  onClick={() => setIsRightSidebarCollapsed(false)}
                  className="relative group p-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-105 transition-all cursor-pointer flex flex-col items-center gap-1 text-center"
                  title="Đã trích xuất vùng ảnh! Nhấp để mở rộng."
                >
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-650 animate-ping" />
                  <Sparkles className="w-5 h-5 text-indigo-600 animate-bounce" />
                  <span className="text-[8px] text-indigo-600 font-bold uppercase tracking-wider">Có ảnh</span>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1.5 opacity-60">
                  <CheckSquare className="w-5 h-5 text-slate-400 animate-pulse" />
                  <span className="text-[8px] text-slate-400 font-bold uppercase text-center tracking-wider leading-tight">Chờ chọn</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {croppedImageBase64 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-indigo-600">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Lớp Ảnh Đã Chọn (Layer)</span>
                  </div>
                  
                  <div className="bg-white p-2 rounded border border-slate-200 flex items-center justify-center max-h-36 overflow-hidden">
                    <img src={croppedImageBase64} className="max-h-28 object-contain rounded" alt="Cropped layer" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Prompt nhanh gợi ý:</span>
                    {[
                      { label: "✏️ Đổi chữ thành nội dung mới", prompt: "Thay đổi chữ trong ảnh này thành: 'Nội dung mới'" },
                      { label: "❌ Xoá chữ hoàn toàn", prompt: "Xoá chữ này đi và tô màu nền tệp phù hợp lên trên đó để xoá hẳn" },
                      { label: "✨ Làm mịn và sắc nét chữ", prompt: "Giữ nguyên chữ này nhưng vẽ lại nét cho mịn, sắc nét và chuyên nghiệp hơn" }
                    ].map((suggest, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => setImageEditPrompt && setImageEditPrompt(suggest.prompt)}
                        className="w-full text-left bg-white hover:bg-slate-100 border border-slate-200 p-2 rounded text-[10px] text-slate-700 leading-snug font-medium cursor-pointer"
                      >
                        {suggest.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-xl text-center space-y-2 select-none py-8 animate-none">
                  <Layers className="w-6 h-6 text-slate-350 mx-auto" />
                  <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Chưa có lớp ảnh nào!
                  </p>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Hãy di chuột khoanh chọn một vùng chữ/hình ảnh trên trang PDF để cắt lớp xử lý.
                  </p>
                </div>
              )}

              {/* Action input inside sidebar when image is cropped */}
              <div className="pt-3 border-t border-slate-100 space-y-3 font-sans">
                <textarea
                  value={imageEditPrompt}
                  onChange={(e) => setImageEditPrompt && setImageEditPrompt(e.target.value)}
                  placeholder={croppedImageBase64 ? "ví dụ: Thay đổi chữ trong ảnh thành 'Lịch Công Tác'..." : "Kéo chuột vẽ chọn vùng trước..."}
                  disabled={!croppedImageBase64}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 min-h-[90px] select-text resize-none"
                />
                <button
                  onClick={applyImageRegionEdit}
                  disabled={isImageEditing || !imageEditPrompt?.trim() || !croppedImageBase64}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isImageEditing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang vẽ lại lớp...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Vẽ lại & Đè lên PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        ) : (
          isRightSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-4 py-8">
              {selectedPdfSelection ? (
                <>
                  <button
                    onClick={() => setIsRightSidebarCollapsed(false)}
                    className="relative group p-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-all cursor-pointer flex flex-col items-center gap-1 text-center"
                    title="Có văn bản đang bôi chọn! Nhấp để mở rộng và tùy chỉnh."
                  >
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-650 animate-ping" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-660" />
                    <Sparkles className="w-5 h-5 text-indigo-555 animate-bounce" />
                    <span className="text-[8px] text-indigo-600 font-bold uppercase tracking-wider scale-90">Có text</span>
                  </button>
                  <button
                    type="button"
                    onClick={applyAISelectionTranslate}
                    disabled={pdfSelectionEditing || !selectedPdfSelection}
                    className="relative group p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer flex flex-col items-center gap-1 text-center disabled:cursor-not-allowed disabled:opacity-70"
                    title={selectedPdfSelection ? "Dịch nhanh và thay thế ngay" : "Chọn văn bản trước để dịch nhanh"}
                  >
                    {pdfSelectionEditing ? (
                      <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                    ) : (
                      <Languages className="w-5 h-5 text-slate-700" />
                    )}
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider scale-90">
                      Dịch
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-1.5 opacity-60">
                    <CheckSquare className="w-5 h-5 text-slate-400" />
                    <span className="text-[8px] text-slate-400 font-bold uppercase text-center tracking-wider leading-tight">Chờ quét</span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="relative group p-2 rounded-xl border border-slate-200 bg-white cursor-not-allowed flex flex-col items-center gap-1 text-center opacity-70"
                    title="Chọn văn bản trước để dịch nhanh"
                  >
                    <Languages className="w-5 h-5 text-slate-400" />
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider scale-90">Dịch</span>
                  </button>
                </>
              )}
            </div>
          ) : selectedPdfSelection ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-indigo-600">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Đã chọn văn bản</span>
              </div>
              
              <div className="bg-white p-2 text-slate-550 rounded border border-slate-200/60 max-h-24 overflow-y-auto select-text font-mono text-[9px] leading-relaxed">
                "{selectedPdfSelection.text.slice(0, 200)}{selectedPdfSelection.text.length > 200 ? "..." : ""}"
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-bold text-slate-400 block">Chọn tác vụ xử lý:</span>
                <button
                  type="button"
                  onClick={applyAISelectionTranslate}
                  disabled={pdfSelectionEditing || !selectedPdfSelection}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-800"
                >
                  {pdfSelectionEditing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang dịch</span>
                    </>
                  ) : (
                    <>
                      <Languages className="w-3.5 h-3.5" />
                      <span>Dịch nhanh và thay thế</span>
                    </>
                  )}
                </button>
                {[
                  { label: "💡 Chuyển in đậm & chữ đỏ", prompt: "Format this specific selection: make the typography bolder, and set style='color: #e11d48;'" },
                  { label: "📝 Dịch văn bản sang tiếng Anh", prompt: "Translate this selection text accurately into formal office business English" },
                  { label: "🇻🇳 Dịch văn bản sang tiếng Việt", prompt: "Dịch đoạn văn bản được chọn sang Tiếng Việt một cách chuẩn xác, giữ nguyên cấu trúc và các thẻ định dạng HTML" },
                  { label: "📊 Chuyển thành bảng dữ liệu", prompt: "Chuyển đổi thông tin số liệu trong vùng được chọn thành một bảng HTML có style chuyên nghiệp" },
                  { label: "🔍 Viết lại trơn tru học thuật", prompt: "Improve this text phrasing: make it more formal, elegant, concise, and business-ready in Vietnamese." }
                ].map((suggest, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => setPdfSelectionPrompt(suggest.prompt)}
                    className="w-full text-left bg-white hover:bg-slate-150 border border-slate-200 p-2 rounded text-[10px] text-slate-705 leading-snug font-medium cursor-pointer"
                  >
                    {suggest.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-xl text-center space-y-3 select-none py-8">
              <CheckSquare className="w-5 h-5 text-slate-400 mx-auto" />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Hãy lựa chọn quét bôi đen một đoạn bên màn hiển thị văn bản để kích hoạt menu sửa nhanh.
              </p>
              <button
                type="button"
                disabled
                className="w-full bg-slate-900/60 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-not-allowed border border-slate-800/60 opacity-70"
                title="Chọn văn bản trước để dịch nhanh và thay thế"
              >
                <Languages className="w-3.5 h-3.5" />
                <span>Dịch nhanh và thay thế</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Prompt submission action wrapper for text selection mode */}
      {pdfViewerTab !== "image_edit" && !isRightSidebarCollapsed && (
        <div className="pt-3 border-t border-slate-100 space-y-3 font-sans">
          <textarea
            value={pdfSelectionPrompt}
            onChange={(e) => setPdfSelectionPrompt(e.target.value)}
            placeholder={selectedPdfSelection ? "ví dụ: Hãy in đậm, chỉnh phông chữ to hơn một chút..." : "Hãy bôi chuột chọn khối chữ trước..."}
            disabled={!selectedPdfSelection}
            className="w-full bg-slate-50 border border-slate-205 p-3 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 min-h-[90px] select-text resize-none"
          />
          <button
            onClick={applyAISelectionEdit}
            disabled={pdfSelectionEditing || !pdfSelectionPrompt.trim() || !selectedPdfSelection}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {pdfSelectionEditing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Xác nhận cập nhật</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
