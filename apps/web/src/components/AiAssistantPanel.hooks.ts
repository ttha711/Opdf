import { useRef, useState, type FormEvent } from "react";
import type { HarnessCheckpoint } from "../agent/harness";
import { createUiAgentHarness } from "./uiAgentHarness";
import { useAiAssistantSettings } from "./useAiAssistantSettings";
import { useAiAssistantMessages } from "./useAiAssistantMessages";
import { useMachineAgentBridge } from "../hooks/useMachineAgentBridge";
import { useAiCommandRuntime } from "./useAiCommandRuntime";

export function useAiAssistant() {
  const [inputValue, setInputValue] = useState("");
  const settings = useAiAssistantSettings();
  const machineBridge = useMachineAgentBridge();
  const messageState = useAiAssistantMessages();
  const { addMessage, setMessages } = messageState;

  const pending = useRef<HarnessCheckpoint | null>(null);
  const commandRuntime = useAiCommandRuntime({ addMessage, setMessages });
  const harness = createUiAgentHarness({
    machineBridge,
    execute: commandRuntime.executeCommand,
    onProgress: () => {},
  });

  const handleSaveSettings = () => {
    const {
      engineMode,
      difyUrl,
      difyKey,
      iframeUrl,
      isServerRuntime,
      setShowSettings,
      syncAiConfigToDesktop,
    } = settings;

    localStorage.setItem("tpdf_ai_mode", isServerRuntime ? "agent" : engineMode);
    if (!isServerRuntime) localStorage.setItem("tpdf_dify_url", difyUrl);
    if (isServerRuntime || window.tpdf?.setAiConfig) localStorage.removeItem("tpdf_dify_key");
    else localStorage.setItem("tpdf_dify_key", difyKey);
    localStorage.setItem("tpdf_iframe_url", iframeUrl);
    setShowSettings(false);
    if (!isServerRuntime) void syncAiConfigToDesktop(engineMode, difyUrl, difyKey);

    let modeText = isServerRuntime
      ? "Authenticated Machine Agent Bridge"
      : "Local Assistant (Offline NLP)";
    if (!isServerRuntime && engineMode === "dify") modeText = "Dify Chatbot API";
    if (!isServerRuntime && engineMode === "iframe") {
      modeText = `Embedded AI-WEB-CHAT (${iframeUrl})`;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Settings saved. Current mode: **${modeText}**`,
        timestamp: new Date(),
      },
    ]);
  };

  const runHarness = async (goal: string, approval?: "approve" | "reject") => {
    const tempId = addMessage("assistant", "Agent is working...", { isPending: true });
    try {
      const result = await harness.run(goal, pending.current ?? undefined, approval);
      pending.current = result.status === "confirmation_required" ? result.checkpoint : null;
      setMessages((messages) => messages.filter((message) => message.id !== tempId));
      if (result.status === "confirmation_required" && result.checkpoint.pending) {
        addMessage("assistant", result.message, { confirmation: result.checkpoint.pending });
      } else {
        addMessage("assistant", result.message, {
          toolLogs: result.checkpoint.observations.map((entry) =>
            entry.action + ": " + entry.detail + " " + JSON.stringify(entry.result)).join("\\n"),
        });
      }
    } catch (error) {
      pending.current = null;
      setMessages((messages) => messages.filter((message) => message.id !== tempId));
      addMessage("assistant", "Agent error: " + (error instanceof Error ? error.message : String(error)));
    }
  };
  const handleConfirmInline = async (_command: import("../agent/agentCommands").AgentCommand, confirm: boolean) => {
    if (!pending.current) return;
    const checkpoint = pending.current;
    setMessages((messages) => messages.map((message) =>
      message.confirmation ? { ...message, confirmation: undefined } : message,
    ));
    await runHarness(checkpoint.goal, confirm ? "approve" : "reject");
  };
  const handleUserQuery = async (queryText: string) => {
    pending.current = null;
    await runHarness(queryText);
  };

  const submitText = (text: string) => {
    if (!text.trim()) return;
    addMessage("user", text);
    setTimeout(() => { void handleUserQuery(text); }, 400);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const userText = inputValue;
    if (!userText.trim()) return;
    setInputValue("");
    submitText(userText);
  };

  return {
    messages: messageState.messages,
    inputValue,
    setInputValue,
    showSettings: settings.showSettings,
    setShowSettings: settings.setShowSettings,
    engineMode: settings.engineMode,
    setEngineMode: settings.setEngineMode,
    difyUrl: settings.difyUrl,
    setDifyUrl: settings.setDifyUrl,
    difyKey: settings.difyKey,
    setDifyKey: settings.setDifyKey,
    iframeUrl: settings.iframeUrl,
    setIframeUrl: settings.setIframeUrl,
    chatEndRef: messageState.chatEndRef,
    handleSaveSettings,
    handleConfirmInline,
    handleSubmit,
    handleSuggestionClick: submitText,
    isProductionWeb: settings.isServerRuntime,
    machineAgentConnected: machineBridge.connected,
    machineAgentCount: machineBridge.agents.length,
    pairingCode: machineBridge.pairing?.code,
    pairingExpiresAt: machineBridge.pairing?.expiresAt,
    pairingLoading: machineBridge.loading,
    pairingError: machineBridge.error,
    startMachineAgentPairing: machineBridge.startPairing,
  };
}
