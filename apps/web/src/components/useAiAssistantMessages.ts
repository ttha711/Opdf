import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "./AiAssistantPanel.types";

export function useAiAssistantMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "assistant",
        text: "Xin chào! Tôi là Trợ lý AI của OPDF. 🚀\n\nTôi có thể giúp bạn thao tác nhanh tài liệu PDF bằng câu lệnh tự nhiên .\n\nHãy thử các nút gợi ý nhanh bên dưới hoặc gõ 'trợ giúp' để xem danh sách câu lệnh!",
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper to append a message
  const addMessage = useCallback((sender: "user" | "assistant", text: string, extra?: Partial<Message>) => {
    const newMessage: Message = {
      id: Math.random().toString(),
      sender,
      text,
      timestamp: new Date(),
      ...extra,
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  return {
    messages,
    setMessages,
    chatEndRef,
    addMessage,
  };
}
