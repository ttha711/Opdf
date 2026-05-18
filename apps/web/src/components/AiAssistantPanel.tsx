import type { AiAssistantPanelProps } from "./AiAssistantPanel.types";
import { useAiAssistant } from "./AiAssistantPanel.hooks";
import { SettingsPanel, ChatMessageBubble, SuggestionChips, ChatInputForm } from "./AiAssistantPanel.parts";

export function AiAssistantPanel({ isOpen, onClose }: AiAssistantPanelProps) {
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
    <div className="ai-chat-panel glassmorphism">
      {/* Panel Header */}
      <div className="ai-chat-header">
        <div className="ai-header-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14h-2v-2h2zm0-4h-2V7h2z" />
          </svg>
          <span>OPDF AI Copilot</span>
          <span className="ai-status-badge pulse" title="OPDF Agent Bridge Connected">Sync</span>
        </div>
        <div className="ai-header-actions">
          <button 
            className={`ai-header-btn ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            title="AI Engine Settings"
            type="button"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
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
