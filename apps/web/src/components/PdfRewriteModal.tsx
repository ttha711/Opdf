import { createPortal } from "react-dom";

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function PromptButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 text-left text-xs font-semibold rounded-lg border transition-all cursor-pointer ${active ? "border-indigo-500 bg-indigo-50/50 text-indigo-650" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>
      {label}
    </button>
  );
}

export function RewriteModal({
  rewriteText,
  rewritePrompt,
  setRewritePrompt,
  rewriteResult,
  setRewriteResult,
  isRewriting,
  onRun,
  onSave,
  onClose,
}: {
  rewriteText: string;
  rewritePrompt: string;
  setRewritePrompt: (v: string) => void;
  rewriteResult: string;
  setRewriteResult: (v: string) => void;
  isRewriting: boolean;
  onRun: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200/80 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 animate-in zoom-in-95 pointer-events-auto">
        <div className="flex justify-between items-center bg-slate-50 border-b border-slate-100 px-5 py-4 select-none">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🤖 AI Rewrite - Viết Lại Văn Bản</h3>
          <button className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[380px] overflow-y-auto">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Văn bản gốc:</span>
            <p className="text-xs text-slate-600 font-sans italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">"{rewriteText}"</p>
          </div>

          <div className="space-y-1.5 select-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Chọn phong cách viết:</span>
            <div className="grid grid-cols-2 gap-2">
              <PromptButton label="👔 Trang trọng hơn" active={rewritePrompt.includes("trang trọng")} onClick={() => setRewritePrompt("Viết lại đoạn văn bản này một cách trang trọng, chuyên nghiệp và lịch sự hơn")} />
              <PromptButton label="📝 Ngắn gọn hơn" active={rewritePrompt.includes("ngắn gọn")} onClick={() => setRewritePrompt("Rút gọn đoạn văn bản này một cách ngắn gọn, súc tích và dễ hiểu nhất")} />
              <PromptButton label="✏️ Sửa chính tả & ngữ pháp" active={rewritePrompt.includes("lỗi chính tả")} onClick={() => setRewritePrompt("Sửa các lỗi chính tả, lỗi ngữ pháp và cách hành văn trong đoạn văn này")} />
              <PromptButton label="🤝 Thân thiện hơn" active={rewritePrompt.includes("thân thiện")} onClick={() => setRewritePrompt("Viết lại đoạn văn theo phong cách thân thiện, cởi mở và dễ tiếp cận hơn")} />
            </div>
            <input type="text" value={rewritePrompt} onChange={(e) => setRewritePrompt(e.target.value)} placeholder="Yêu cầu viết lại tùy chỉnh..." className="w-full mt-2 text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          <div className="flex justify-start">
            <button type="button" onClick={onRun} disabled={isRewriting || !rewritePrompt.trim()} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-650 border border-indigo-100 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-40">
              {isRewriting ? (<><Spinner /><span>Đang viết lại...</span></>) : (<><span>✨ Chạy AI Viết lại</span></>)}
            </button>
          </div>

          {rewriteResult && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kết quả đề xuất của AI:</span>
              <textarea value={rewriteResult} onChange={(e) => setRewriteResult(e.target.value)} className="w-full text-xs p-3 bg-slate-950 text-indigo-300 rounded-lg border border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans min-h-[90px] resize-y" />
            </div>
          )}
        </div>

        <div className="bg-slate-50 border-t border-slate-100 px-5 py-3.5 flex justify-end gap-2">
          <button className="bg-white border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={onClose}>Hủy</button>
          <button className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer" onClick={onSave} disabled={!rewriteResult || isRewriting}>Lưu & Thay Thế Chữ</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
