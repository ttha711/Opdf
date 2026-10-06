import type { EngineMode } from "./AiAssistantPanel.types";

export interface SettingsPanelProps {
  engineMode: EngineMode;
  setEngineMode: (value: EngineMode) => void;
  difyUrl: string;
  setDifyUrl: (value: string) => void;
  difyKey: string;
  setDifyKey: (value: string) => void;
  iframeUrl: string;
  setIframeUrl: (value: string) => void;
  isProductionWeb: boolean;
  machineAgentConnected: boolean;
  machineAgentCount: number;
  pairingCode?: string;
  pairingExpiresAt?: number;
  pairingLoading: boolean;
  pairingError: string;
  onStartPairing: () => void;
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
  isProductionWeb,
  machineAgentConnected,
  machineAgentCount,
  pairingCode,
  pairingExpiresAt,
  pairingLoading,
  pairingError,
  onStartPairing,
  onCancel,
  onSave,
}: SettingsPanelProps) {
  return (
    <div className="ai-settings-panel">
      <h4>{isProductionWeb ? "Machine Agent Pairing" : "AI Engine Configuration"}</h4>
      {isProductionWeb ? (
        <>
          <div
            className="ai-radio-option active"
            data-opdf-machine-agent-status={machineAgentConnected ? "connected" : "unpaired"}
          >
            <strong>Authenticated Local / Machine Agent Bridge</strong>
            <p>
              {machineAgentConnected
                ? `${machineAgentCount} paired machine agent${machineAgentCount === 1 ? "" : "s"} available for this OPDF account and project.`
                : "Pair your local machine agent to use AI. No public Dify API key is stored in this browser."}
            </p>
          </div>
          {pairingCode ? (
            <div className="ai-pairing-code" data-opdf-pairing-code>
              <span>Pairing code</span>
              <strong>{pairingCode}</strong>
              {pairingExpiresAt ? (
                <small>Expires at {new Date(pairingExpiresAt).toLocaleTimeString()}</small>
              ) : null}
            </div>
          ) : null}
          {pairingError ? <div className="ai-pairing-error">{pairingError}</div> : null}
          <button
            className="btn-premium btn-premium-primary"
            type="button"
            disabled={pairingLoading}
            onClick={onStartPairing}
          >
            {pairingLoading
              ? "Creating pairing code..."
              : machineAgentConnected
                ? "Pair another machine"
                : "Pair machine agent"}
          </button>
        </>
      ) : (
        <DevelopmentEngineSettings
          engineMode={engineMode}
          setEngineMode={setEngineMode}
          difyUrl={difyUrl}
          setDifyUrl={setDifyUrl}
          difyKey={difyKey}
          setDifyKey={setDifyKey}
          iframeUrl={iframeUrl}
          setIframeUrl={setIframeUrl}
        />
      )}
      <div className="ai-settings-actions">
        <button className="btn-premium btn-premium-secondary" onClick={onCancel} type="button">
          Close
        </button>
        {!isProductionWeb ? (
          <button className="btn-premium btn-premium-primary" onClick={onSave} type="button">
            Apply
          </button>
        ) : null}
      </div>
    </div>
  );
}

type DevelopmentProps = Pick<
  SettingsPanelProps,
  "engineMode" | "setEngineMode" | "difyUrl" | "setDifyUrl" |
  "difyKey" | "setDifyKey" | "iframeUrl" | "setIframeUrl"
>;

function DevelopmentEngineSettings({
  engineMode,
  setEngineMode,
  difyUrl,
  setDifyUrl,
  difyKey,
  setDifyKey,
  iframeUrl,
  setIframeUrl,
}: DevelopmentProps) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">AI Mode</label>
        <select
          className="ai-engine-select"
          value={engineMode}
          onChange={(event) => setEngineMode(event.target.value as EngineMode)}
        >
          <option value="local">Local</option>
          <option value="dify">Dify API (legacy development)</option>
          <option value="iframe">Iframe</option>
        </select>
      </div>
      {engineMode === "dify" ? (
        <>
          <div className="form-group">
            <label className="form-label">Dify URL</label>
            <input
              className="ai-settings-input"
              value={difyUrl}
              onChange={(event) => setDifyUrl(event.target.value)}
              placeholder="https://.../v1"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Dify API Key</label>
            <input
              className="ai-settings-input"
              value={difyKey}
              onChange={(event) => setDifyKey(event.target.value)}
              placeholder="app-..."
            />
          </div>
        </>
      ) : null}
      {engineMode === "iframe" ? (
        <div className="form-group">
          <label className="form-label">Iframe URL</label>
          <input
            className="ai-settings-input"
            value={iframeUrl}
            onChange={(event) => setIframeUrl(event.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>
      ) : null}
      {engineMode === "local" ? (
        <div className="ai-radio-group">
          <div className="ai-radio-option active">
            <strong>Local Agent Bridge</strong>
            <p>Runs through the OPDF desktop bridge without exposing an external API key in the renderer.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
