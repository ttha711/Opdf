import type { Dispatch, SetStateAction } from "react";
import type { AgentCommand, AgentCommandResult } from "../agent/agentCommands";
import type { Message } from "./AiAssistantPanel.types";
import { extractBalancedJson } from "./AiAssistantPanel.utils";

type AddMessage = (
  sender: "user" | "assistant",
  text: string,
  extra?: Partial<Message>,
) => string;

type MachineBridge = {
  sendQuery: (query: string, context: Record<string, unknown>) => Promise<unknown>;
};

type Params = {
  addMessage: AddMessage;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  difyUrl: string;
  difyKey: string;
  conversationId: string;
  setConversationId: (value: string) => void;
  machineBridge: MachineBridge;
  executeCommand: (command: AgentCommand) => Promise<AgentCommandResult | null>;
  handleAgentResult: (result: AgentCommandResult, command: AgentCommand) => void;
};

function buildDocumentContext() {
  if (!window.opdfAgent) return "";
  try {
    const state = window.opdfAgent.getState();
    if (!state?.hasDocument) {
      return "\n[DOCUMENT CONTEXT: No document is currently open.]\n";
    }
    return `
[DOCUMENT CONTEXT:
- File: "${state.fileName}"
- Total pages: ${state.totalPages}
- Current page: ${state.currentPage}
- Active tool: ${state.activeTool}
- View mode: ${state.viewMode}
- Runtime: ${state.runtime}
]
`;
  } catch (error) {
    console.warn("Failed to get agent state:", error);
    return "";
  }
}

function buildRichQuery(queryText: string) {
  return `[SYSTEM CONTEXT: You are the OPDF PDF Copilot. Help the user work with the PDF currently open in OPDF.
Supported operations include conversion, compression, rotation, page deletion, OCR, page numbers, watermark, header/footer, encryption, zoom and navigation.
Never show raw JSON in conversational text. Only when the user asks to execute an OPDF action, you may emit one JSON tool call at the very end for the host app to consume.]
${buildDocumentContext()}
User: ${queryText}`;
}

function responseText(raw: unknown) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  const value = raw as Record<string, unknown>;
  const text =
    (typeof value.answer === "string" && value.answer) ||
    (typeof value.message === "string" && value.message) ||
    (typeof value.output === "string" && value.output) ||
    "";
  return text.trim();
}

async function maybeExecuteToolCall(
  textResponse: string,
  executeCommand: Params["executeCommand"],
  handleAgentResult: Params["handleAgentResult"],
  addMessage: AddMessage,
) {
  const jsonMatch = extractBalancedJson(textResponse);
  if (!jsonMatch) return false;

  try {
    const parsed = JSON.parse(jsonMatch);
    if (!parsed.tool && !parsed.execute) return false;
    const command: AgentCommand = {
      tool: parsed.tool || parsed.execute,
      args: parsed.args,
      confirmed: parsed.confirmed,
    };
    const result = await executeCommand(command);
    if (result) handleAgentResult(result, command);
    const clean = textResponse.replace(jsonMatch, "").replace(/```json|```/g, "").trim();
    if (clean) addMessage("assistant", clean);
    return true;
  } catch (error) {
    console.warn("Unable to parse AI tool call:", error);
    return false;
  }
}

export function useAiQueryRuntime({
  addMessage,
  setMessages,
  difyUrl,
  difyKey,
  conversationId,
  setConversationId,
  machineBridge,
  executeCommand,
  handleAgentResult,
}: Params) {
  const processDifyQuery = async (queryText: string) => {
    const tempId = addMessage("assistant", "AI is thinking...", { isPending: true });
    try {
      const configuredGateway = (import.meta.env.VITE_OPDF_AI_GATEWAY_URL || "")
        .trim()
        .replace(/\/+$/, "");
      const desktop = Boolean(window.opdf?.getAiAccessToken);
      let gatewayBase = desktop ? configuredGateway : "";
      if (desktop && !gatewayBase) {
        const status = await window.opdf?.getAiDeviceStatus?.();
        gatewayBase = (status?.gatewayBaseUrl || "").replace(/\/+$/, "");
      }
      if (!gatewayBase && !difyKey) {
        throw new Error("AI gateway or Dify API Key is not configured.");
      }

      let response: Response;
      const richQuery = buildRichQuery(queryText);
      if (gatewayBase) {
        const token = await window.opdf?.getAiAccessToken?.();
        response = await fetch(`${gatewayBase}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            query: richQuery,
            user: "opdf-desktop-client",
            conversation_id: conversationId || undefined,
          }),
        });
      } else {
        response = await fetch(`${difyUrl}/chat-messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${difyKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: {},
            query: richQuery,
            response_mode: "blocking",
            user: "opdf-web-client",
            conversation_id: conversationId || undefined,
          }),
        });
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`AI request failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 120)}` : ""}`);
      }

      const data = await response.json() as Record<string, unknown>;
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (typeof data.conversation_id === "string" && data.conversation_id !== conversationId) {
        setConversationId(data.conversation_id);
        localStorage.setItem("opdf_dify_conv_id", data.conversation_id);
      }

      let textResponse = responseText(data);
      textResponse = textResponse.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (textResponse.includes("<think>")) textResponse = textResponse.split("<think>")[0].trim();
      if (await maybeExecuteToolCall(textResponse, executeCommand, handleAgentResult, addMessage)) return;
      addMessage("assistant", textResponse || "AI completed without a text response.");
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      addMessage(
        "assistant",
        `AI connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const processMachineAgentQuery = async (queryText: string) => {
    const tempId = addMessage(
      "assistant",
      "Waiting for your paired machine agent...",
      { isPending: true },
    );
    try {
      const context = window.opdfAgent?.getState?.() ?? {};
      const raw = await machineBridge.sendQuery(queryText, context as Record<string, unknown>);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      const textResponse = responseText(raw) || (raw ? JSON.stringify(raw) : "");
      if (!textResponse) {
        addMessage("assistant", "Machine Agent completed without a text response.");
        return;
      }
      if (await maybeExecuteToolCall(textResponse, executeCommand, handleAgentResult, addMessage)) return;
      addMessage("assistant", textResponse);
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      addMessage(
        "assistant",
        `Machine Agent Bridge error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return { processDifyQuery, processMachineAgentQuery };
}
