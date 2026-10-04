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
        text: "Hello! I’m the OPDF AI Assistant. 🚀\n\nI can help you work with PDFs using natural-language commands.\n\nTry a quick action below or type 'help' to see supported commands.",
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
