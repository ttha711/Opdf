import { useState, type FormEvent } from "react";
import { checkAndParseCommand } from "./AiAssistantPanel.utils";
import { useAiAssistantSettings } from "./useAiAssistantSettings";
import { useAiAssistantMessages } from "./useAiAssistantMessages";
import { useAiAssistantIframeBridge } from "./useAiAssistantIframeBridge";
import { useMachineAgentBridge } from "../hooks/useMachineAgentBridge";
import { useAiCommandRuntime } from "./useAiCommandRuntime";
import { useAiQueryRuntime } from "./useAiQueryRuntime";

export function useAiAssistant() {
  const [inputValue, setInputValue] = useState("");
  const settings = useAiAssistantSettings();
  const machineBridge = useMachineAgentBridge();
  const messageState = useAiAssistantMessages();
  const { addMessage, setMessages } = messageState;

  useAiAssistantIframeBridge();

  const commandRuntime = useAiCommandRuntime({ addMessage, setMessages });
  const queryRuntime = useAiQueryRuntime({
    addMessage,
    setMessages,
    difyUrl: settings.difyUrl,
    difyKey: settings.difyKey,
    conversationId: settings.conversationId,
    setConversationId: settings.setConversationId,
    machineBridge,
    executeCommand: commandRuntime.executeCommand,
    handleAgentResult: commandRuntime.handleAgentResult,
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

    localStorage.setItem("opdf_ai_mode", isServerRuntime ? "agent" : engineMode);
    if (!isServerRuntime) localStorage.setItem("opdf_dify_url", difyUrl);
    if (isServerRuntime || window.opdf?.setAiConfig) localStorage.removeItem("opdf_dify_key");
    else localStorage.setItem("opdf_dify_key", difyKey);
    localStorage.setItem("opdf_iframe_url", iframeUrl);
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

  const handleUserQuery = async (queryText: string) => {
    const parsed = checkAndParseCommand(queryText);
    if (parsed && typeof parsed !== "string" && !("error" in parsed)) {
      const tempId = addMessage(
        "assistant",
        `🤖 Detected PDF command: **${parsed.tool}**. Executing...`,
        {
          toolLogs: `Payload: ${JSON.stringify(parsed, null, 2)}`,
          isPending: true,
        },
      );
      const result = await commandRuntime.executeCommand(parsed);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (result) commandRuntime.handleAgentResult(result, parsed);
      return;
    }

    if (parsed === "help") {
      await commandRuntime.processLocalQuery(queryText);
      return;
    }

    if (settings.engineMode === "agent") {
      await queryRuntime.processMachineAgentQuery(queryText);
    } else if (settings.engineMode === "local") {
      await commandRuntime.processLocalQuery(queryText);
    } else {
      await queryRuntime.processDifyQuery(queryText);
    }
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
    handleConfirmInline: commandRuntime.handleConfirmInline,
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
