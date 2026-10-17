import type { AiAssistantPanelProps } from "./AiAssistantPanel.types";
import { useAiAssistant } from "./AiAssistantPanel.hooks";
import { ChatMessageBubble, ChatInputForm } from "./AiAssistantPanel.parts";
import { AiSparkIcon } from "./AiSparkIcon";

export function AiAssistantPanel({ isOpen, onClose, align = "right", docked = false }: AiAssistantPanelProps) {
  const {
    messages, inputValue, setInputValue, chatEndRef, isBusy,
    handleConfirmInline, handleSubmit,
    machineAgentConnected, machineAgentCount,
    pairingCode, pairingExpiresAt, pairingLoading, pairingError, startMachineAgentPairing,
    showSettings, setShowSettings,
  } = useAiAssistant();

  if (!isOpen) return null;
  return (
    <div data-tpdf-panel="ai" className={`ai-chat-panel glassmorphism align-${align}${docked ? " docked" : ""}`}>
      <div className="ai-chat-header">
        <div className="ai-header-title">
          <AiSparkIcon size={18} />
          <span>TPDF Agent</span>
          <span className={`ai-status-badge${machineAgentConnected ? " pulse" : ""}`}>
            {machineAgentConnected ? "Connected" : "Offline"}
          </span>
        </div>
        <div className="ai-header-actions">
          <button type="button" className="ai-header-btn" onClick={() => setShowSettings(!showSettings)} title="Agent connection">⚙</button>
          <button type="button" className="ai-header-close" onClick={onClose} title="Close agent">×</button>
        </div>
      </div>
      {showSettings ? (
        <div className="ai-settings-panel">
          <h4>Machine Agent connection</h4>
          <p>{machineAgentConnected
            ? `${machineAgentCount} machine agent(s) available.`
            : "Pair a machine agent to use model-driven PDF tools. No LLM API key is stored in the browser."}</p>
          {pairingCode ? <div className="ai-pairing-code"><span>Pairing code</span><strong>{pairingCode}</strong>
            {pairingExpiresAt ? <small>Expires: {new Date(pairingExpiresAt).toLocaleTimeString()}</small> : null}
          </div> : null}
          {pairingError ? <div className="ai-pairing-error">{pairingError}</div> : null}
          <button type="button" className="btn-premium btn-premium-primary" disabled={pairingLoading} onClick={() => { void startMachineAgentPairing(); }}>
            {pairingLoading ? "Pairing..." : "Pair machine agent"}
          </button>
        </div>
      ) : null}
      <div className="ai-messages-container">
        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} onConfirmInline={handleConfirmInline} />
        ))}
        <div ref={chatEndRef} />
      </div>
      <ChatInputForm inputValue={inputValue} setInputValue={setInputValue} onSubmit={handleSubmit} engineMode="agent" disabled={isBusy || messages.some((message) => Boolean(message.confirmation))} />
    </div>
  );
}
