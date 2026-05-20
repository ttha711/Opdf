import React, { useEffect, useRef } from "react";
import type { Message, EngineMode } from "./AiAssistantPanel.types";
import type { AgentCommand } from "../agent/agentCommands";
import aiAvatar from "../assets/ai-avatar.jpg";

// --- MARKDOWN MESSAGE COMPONENT ---
interface MarkdownMessageProps {
  text: string;
}

export function MarkdownMessage({ text }: MarkdownMessageProps) {
  if (!text) return null;

  // Helper to parse inline formatting like bold text and inline code tags
  const formatInline = (str: string) => {
    // Bold **text** parser
    const splitBold = str.split(/\*\*(.*?)\*\*/g);
    return splitBold.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index}>{part}</strong>;
      }
      
      // Inline code `code` parser
      const splitCode = part.split(/`(.*?)`/g);
      return splitCode.map((subPart, subIndex) => {
        if (subIndex % 2 === 1) {
          return <code key={subIndex} className="ai-inline-code">{subPart}</code>;
        }
        return subPart;
      });
    });
  };

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if it's a table row
    if (line.startsWith("|")) {
      inTable = true;
      const cells = line.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      if (line.includes("---")) {
        // Divider line, skip
        continue;
      }
      
      if (tableHeaders.length === 0) {
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      // Table block ended, render it
      if (tableHeaders.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="ai-table-container">
            <table className="ai-markdown-table">
              <thead>
                <tr>
                  {tableHeaders.map((h, idx) => (
                    <th key={idx}>{formatInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{formatInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      // Reset table state
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }

    // Headings
    if (line.startsWith("###")) {
      elements.push(<h4 key={i} className="ai-markdown-h4">{formatInline(line.replace(/^###\s*/, ""))}</h4>);
    } else if (line.startsWith("##")) {
      elements.push(<h2 key={i} className="ai-markdown-h2">{formatInline(line.replace(/^##\s*/, ""))}</h2>);
    } else if (line.startsWith("#")) {
      elements.push(<h2 key={i} className="ai-markdown-h2">{formatInline(line.replace(/^#\s*/, ""))}</h2>);
    }
    // Bullet lists
    else if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
      elements.push(
        <li key={i} className="ai-markdown-li">
          {formatInline(line.replace(/^[-•*]\s*/, ""))}
        </li>
      );
    }
    // Empty spacing lines
    else if (line === "") {
      elements.push(<div key={i} style={{ height: "4px" }} />);
    }
    // Normal paragraph text
    else {
      elements.push(<p key={i} className="ai-markdown-p">{formatInline(line)}</p>);
    }
  }

  // Render remaining table if still active at the end
  if (inTable && tableHeaders.length > 0) {
    elements.push(
      <div key="table-end" className="ai-table-container">
        <table className="ai-markdown-table">
          <thead>
            <tr>
              {tableHeaders.map((h, idx) => (
                <th key={idx}>{formatInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>{formatInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <div className="ai-markdown-body">{elements}</div>;
}

// --- SETTINGS PANEL COMPONENT ---
interface SettingsPanelProps {
  engineMode: EngineMode;
  setEngineMode: (value: EngineMode) => void;
  difyUrl: string;
  setDifyUrl: (value: string) => void;
  difyKey: string;
  setDifyKey: (value: string) => void;
  iframeUrl: string;
  setIframeUrl: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function SettingsPanel({
  engineMode,
  setEngineMode,
  difyUrl,
  setDifyUrl,
  difyKey,
  setDifyKey,
  iframeUrl,
  setIframeUrl,
  onCancel,
  onSave,
}: SettingsPanelProps) {
  return (
    <div className="ai-settings-panel">
      <h4>AI Engine Configuration</h4>
      <div className="form-group">
        <label className="form-label">AI Mode</label>
        <select className="ai-engine-select" value={engineMode} onChange={(e) => setEngineMode(e.target.value as EngineMode)}>
          <option value="local">Local</option>
          <option value="dify">Dify API</option>
          <option value="iframe">Iframe</option>
        </select>
      </div>

      {engineMode === "dify" ? (
        <>
          <div className="form-group">
            <label className="form-label">Dify URL</label>
            <input className="ai-settings-input" value={difyUrl} onChange={(e) => setDifyUrl(e.target.value)} placeholder="https://.../v1" />
          </div>
          <div className="form-group">
            <label className="form-label">Dify API Key</label>
            <input className="ai-settings-input" value={difyKey} onChange={(e) => setDifyKey(e.target.value)} placeholder="app-..." />
          </div>
        </>
      ) : null}

      {engineMode === "iframe" ? (
        <div className="form-group">
          <label className="form-label">Iframe URL</label>
          <input className="ai-settings-input" value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} placeholder="http://localhost:3000" />
        </div>
      ) : null}

      {engineMode === "local" ? (
        <div className="ai-radio-group">
          <div className="ai-radio-option active">
            <strong>Local Agent Bridge</strong>
            <p>Runs through OPDF desktop bridge without external chat endpoint.</p>
          </div>
        </div>
      ) : null}

      <div className="ai-settings-actions">
        <button className="btn-premium btn-premium-secondary" onClick={onCancel} type="button">
          Đóng
        </button>
        <button className="btn-premium btn-premium-primary" onClick={onSave} type="button">
          Áp dụng
        </button>
      </div>
    </div>
  );
}

// --- CHAT MESSAGE BUBBLE COMPONENT ---
interface ChatMessageBubbleProps {
  message: Message;
  onConfirmInline: (cmd: AgentCommand, confirm: boolean) => void;
}

export function ChatMessageBubble({ message, onConfirmInline }: ChatMessageBubbleProps) {
  const { sender, isPending, text, toolLogs, confirmation } = message;
  
  return (
    <div className={`ai-message-bubble-wrapper ${sender}`}>
      <div className="ai-message-avatar">
        {sender === "user" ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5z" />
          </svg>
        ) : (
          <img src={aiAvatar} alt="AI" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
        )}
      </div>
      <div className="ai-message-bubble">
        {isPending ? (
          <div className="ai-typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        ) : (
          <div className="ai-message-text">
            <MarkdownMessage text={text} />
          </div>
        )}

        {toolLogs && (
          <details className="ai-tool-logs">
            <summary>Xem nhật ký gọi Agent Bridge</summary>
            <pre>{toolLogs}</pre>
          </details>
        )}

        {confirmation && (
          <div className="ai-confirmation-box">
            <button 
              className="ai-confirm-btn cancel"
              onClick={() => onConfirmInline(confirmation, false)}
              type="button"
            >
              Hủy
            </button>
            <button 
              className="ai-confirm-btn confirm"
              onClick={() => onConfirmInline(confirmation, true)}
              type="button"
            >
              Xác nhận thực hiện
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- SUGGESTION CHIPS COMPONENT ---
interface SuggestionChipsProps {
  onSuggestionClick: (text: string) => void;
}

export function SuggestionChips({ onSuggestionClick }: SuggestionChipsProps) {
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="ai-suggestions-container" onWheel={handleWheel}>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("nén tài liệu")} type="button">
        🗜️ Nén PDF
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("xoay tất cả trang qua phải")} type="button">
        🔄 Xoay phải tất cả
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("thêm số trang")} type="button">
        🔢 Đánh số trang
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("xóa trang 2")} type="button">
        🗑️ Xóa trang 2
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("chạy ocr")} type="button">
        🔍 Chạy OCR
      </button>
      <button className="ai-suggestion-chip" onClick={() => onSuggestionClick("trợ giúp")} type="button">
        📚 Trợ giúp
      </button>
    </div>
  );
}

// --- CHAT INPUT FORM COMPONENT ---
interface ChatInputFormProps {
  inputValue: string;
  setInputValue: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  engineMode: EngineMode;
}

export function ChatInputForm({ inputValue, setInputValue, onSubmit, engineMode }: ChatInputFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle textarea autogrow inside the component for better encapsulation
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(100, textareaRef.current.scrollHeight)}px`;
    }
  }, [inputValue]);

  return (
    <form className="ai-chat-input-form" onSubmit={onSubmit}>
      <textarea
        ref={textareaRef}
        className="ai-chat-textarea"
        rows={1}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
          }
        }}
        placeholder={engineMode === "local" ? "Gõ lệnh (ví dụ: 'nén file', 'xoay trái')..." : "Trò chuyện với Dify AI..."}
      />
      <button 
        className="ai-chat-send-btn" 
        disabled={!inputValue.trim()} 
        type="submit"
        title="Gửi câu lệnh"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </form>
  );
}



