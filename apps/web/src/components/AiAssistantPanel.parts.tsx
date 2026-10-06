import React, { useEffect, useRef } from "react";
import type { Message, EngineMode } from "./AiAssistantPanel.types";
import type { AgentCommand } from "../agent/agentCommands";
import { AiSparkIcon } from "./AiSparkIcon";
import { MarkdownMessage } from "./AiAssistantMarkdown";

interface ChatMessageBubbleProps {
  message: Message;
  onConfirmInline: (cmd: AgentCommand, confirm: boolean) => void;
}

export function ChatMessageBubble({ message, onConfirmInline }: ChatMessageBubbleProps) {
  const { sender, isPending, text, toolLogs, confirmation } = message;
  return (
    <div
      data-opdf-ai-message={sender}
      data-opdf-ai-pending={isPending ? "true" : "false"}
      className={`ai-message-bubble-wrapper ${sender}`}
    >
      <div className="ai-message-avatar">
        {sender === "user" ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5z" />
          </svg>
        ) : (
          <AiSparkIcon size={14} />
        )}
      </div>
      <div className="ai-message-bubble">
        {isPending ? (
          <div className="ai-typing-indicator"><span /><span /><span /></div>
        ) : (
          <div className="ai-message-text"><MarkdownMessage text={text} /></div>
        )}
        {toolLogs ? (
          <details className="ai-tool-logs">
            <summary>View Agent Bridge call log</summary>
            <pre>{toolLogs}</pre>
          </details>
        ) : null}
        {confirmation ? (
          <div className="ai-confirmation-box">
            <button
              className="ai-confirm-btn cancel"
              onClick={() => onConfirmInline(confirmation, false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="ai-confirm-btn confirm"
              onClick={() => onConfirmInline(confirmation, true)}
              type="button"
            >
              Confirm action
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SuggestionChips({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  };

  return (
    <div className="ai-suggestions-container" onWheel={handleWheel}>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("compress document")} type="button">
        🗜️ Compress PDF
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("rotate all pages right")} type="button">
        🔄 Rotate all right
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("add page numbers")} type="button">
        🔢 Add page numbers
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("delete page 2")} type="button">
        🗑️ Delete page 2
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("run OCR")} type="button">
        🔍 Run OCR
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("help")} type="button">
        📚 Help
      </button>
    </div>
  );
}

interface ChatInputFormProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  engineMode: EngineMode;
}

export function ChatInputForm({
  inputValue,
  setInputValue,
  onSubmit,
  engineMode,
}: ChatInputFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(100, textareaRef.current.scrollHeight)}px`;
  }, [inputValue]);

  const placeholder = engineMode === "agent"
    ? "Ask your paired machine agent..."
    : engineMode === "local"
      ? "Type a command (for example: 'compress file', 'rotate left')..."
      : "Chat with AI...";

  return (
    <form className="ai-chat-input-form" onSubmit={onSubmit}>
      <textarea
        data-opdf-ai-input
        ref={textareaRef}
        className="ai-chat-textarea"
        rows={1}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          onSubmit(event);
        }}
        placeholder={placeholder}
      />
      <button
        data-opdf-ai-send
        className="ai-chat-send-btn"
        disabled={!inputValue.trim()}
        type="submit"
        title="Send command"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </form>
  );
}
