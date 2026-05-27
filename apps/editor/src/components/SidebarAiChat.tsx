import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Bot, User, Loader2, Sparkles, Trash2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SidebarAiChatProps {
  messages: Message[];
  onSendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  onClearChat: () => void;
}

export default function SidebarAiChat({
  messages,
  onSendMessage,
  isSending,
  onClearChat
}: SidebarAiChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    { label: "📝 Tóm tắt tài liệu", text: "Hãy tóm tắt ngắn gọn các ý chính trong tài liệu này dưới dạng danh sách gạch đầu dòng." },
    { label: "🔍 Tìm điểm mâu thuẫn", text: "Kiểm tra xem trong tài liệu có điểm nào mâu thuẫn hoặc chưa hợp lý về mặt logic hay số liệu không?" },
    { label: "💡 Gợi ý nâng cấp", text: "Đề xuất 3 ý tưởng/luận điểm cải thiện để tài liệu này thuyết phục hơn." },
    { label: "📊 Phân tích số liệu", text: "Tóm tắt và phân tích các bảng số liệu hoặc thông tin tài chính có trong tài liệu này." }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    onSendMessage(input.trim());
    setInput("");
  };

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  return (
    <div className="flex flex-col h-full flex-grow select-text font-sans text-xs min-h-[400px]">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3 select-none">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-505 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span>Hỏi đáp với Tài liệu</span>
        </span>
        {messages.length > 0 && (
          <button
            onClick={onClearChat}
            className="p-1 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors cursor-pointer"
            title="Xóa lịch sử chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages Window */}
      <div className="flex-grow overflow-y-auto space-y-3.5 pr-1 max-h-[320px] mb-3 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 select-none space-y-3 py-10">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 animate-bounce">
              <Bot className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-[11px] font-bold text-slate-700">Trợ lý Hỏi đáp Tài liệu</h4>
              <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                Đặt bất kỳ câu hỏi nào về nội dung của tài liệu hiện tại. Trợ lý AI sẽ phân tích và giải đáp cho bạn.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs select-none">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div
                className={`p-2.5 rounded-2xl max-w-[85%] leading-relaxed text-[11px] ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none font-medium"
                    : "bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none font-normal"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-650 shrink-0 shadow-2xs select-none">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))
        )}

        {isSending && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs select-none">
              <Bot className="w-3.5 h-3.5 animate-bounce" />
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl rounded-tl-none flex items-center gap-1.5 font-medium select-none">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Đang suy nghĩ...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts (only when chat starts) */}
      {messages.length === 0 && (
        <div className="space-y-1.5 mb-3.5 select-none">
          <span className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            Gợi ý câu hỏi nhanh:
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(qp.text)}
                className="text-left bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 border border-slate-200 p-2 rounded-lg text-[10px] text-slate-700 leading-snug font-semibold cursor-pointer transition-colors"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="flex gap-1.5 select-none mt-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập câu hỏi về tài liệu..."
          disabled={isSending}
          className="flex-grow bg-slate-50 border border-slate-205 rounded-xl px-3 py-2 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-all font-medium"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white p-2 rounded-xl shadow-xs transition-all flex items-center justify-center shrink-0 w-8.5 h-8.5 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
