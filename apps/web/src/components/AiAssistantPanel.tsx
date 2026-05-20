import type { AiAssistantPanelProps } from "./AiAssistantPanel.types";
import { useAiAssistant } from "./AiAssistantPanel.hooks";
import { SettingsPanel, ChatMessageBubble, SuggestionChips, ChatInputForm } from "./AiAssistantPanel.parts";
import aiAvatar from "../assets/ai-avatar.jpg";

export function AiAssistantPanel({ isOpen, onClose, align = "right", onOpenLiveEditor }: AiAssistantPanelProps) {
  const {
    messages,
    inputValue,
    setInputValue,
    showSettings,
    setShowSettings,
    engineMode,
    setEngineMode,
    difyUrl,
    setDifyUrl,
    difyKey,
    setDifyKey,
    iframeUrl,
    setIframeUrl,
    chatEndRef,
    handleSaveSettings,
    handleConfirmInline,
    handleSubmit,
    handleSuggestionClick,
  } = useAiAssistant();

  if (!isOpen) return null;

  return (
    <div className={`ai-chat-panel glassmorphism align-${align}`}>
      {/* Panel Header */}
      <div className="ai-chat-header">
        <div className="ai-header-title">
          <img src={aiAvatar} alt="AI" style={{ width: "20px", height: "20px", borderRadius: "50%", objectFit: "cover" }} />
          <span>OPDF AI Copilot</span>
          <span className="ai-status-badge pulse" title="OPDF Agent Bridge Connected">Sync</span>
        </div>
        <div className="ai-header-actions">
          {onOpenLiveEditor ? (
            <button className="ai-header-live-editor" onClick={onOpenLiveEditor} title="Open Live HTML Editor" type="button">
              Live Editor
            </button>
          ) : null}
          <button className="ai-header-close" onClick={onClose} title="Hide AI Copilot" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings ? (
        <SettingsPanel 
          engineMode={engineMode}
          setEngineMode={setEngineMode}
          difyUrl={difyUrl}
          setDifyUrl={setDifyUrl}
          difyKey={difyKey}
          setDifyKey={setDifyKey}
          iframeUrl={iframeUrl}
          setIframeUrl={setIframeUrl}
          onCancel={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      ) : engineMode === "iframe" ? (
        /* Iframe Nhúng Client AI-WEB-CHAT */
        <div style={{ flex: 1, width: "100%", height: "100%", overflow: "hidden" }}>
          <iframe
            src={iframeUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            title="AI-WEB-CHAT NextJS Client"
            allow="clipboard-write"
          />
        </div>
      ) : (
        <>
          {/* Messages Container */}
          <div className="ai-messages-container">
            {messages.map((m) => (
              <ChatMessageBubble key={m.id} message={m} onConfirmInline={handleConfirmInline} />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          <SuggestionChips onSuggestionClick={handleSuggestionClick} />
          {onOpenLiveEditor ? (
            <div style={{ padding: "0 12px 8px" }}>
              <button className="ai-header-live-editor" onClick={onOpenLiveEditor} type="button" style={{ width: "100%" }}>
                Mở Live Editor
              </button>
            </div>
          ) : null}

          {/* Form Input */}
          <ChatInputForm
            inputValue={inputValue}
            setInputValue={setInputValue}
            onSubmit={handleSubmit}
            engineMode={engineMode}
          />
        </>
      )}
    </div>
  );
}
