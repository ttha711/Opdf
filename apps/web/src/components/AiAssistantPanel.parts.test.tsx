import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./AiAssistantPanel.parts";

describe("AI production settings", () => {
  it("shows machine pairing and hides public Dify credentials", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        engineMode="agent"
        setEngineMode={vi.fn()}
        difyUrl="https://api.dify.ai/v1"
        setDifyUrl={vi.fn()}
        difyKey="app-should-not-render"
        setDifyKey={vi.fn()}
        iframeUrl=""
        setIframeUrl={vi.fn()}
        isProductionWeb
        machineAgentConnected={false}
        machineAgentCount={0}
        pairingCode="ABCDEF1234"
        pairingExpiresAt={Date.now() + 60_000}
        pairingLoading={false}
        pairingError=""
        onStartPairing={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(html).toContain("Machine Agent Pairing");
    expect(html).toContain("ABCDEF1234");
    expect(html).toContain("Pair machine agent");
    expect(html).not.toContain("Dify API Key");
    expect(html).not.toContain("app-should-not-render");
  });
});
