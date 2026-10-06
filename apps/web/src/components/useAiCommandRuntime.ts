import type { Dispatch, SetStateAction } from "react";
import type { AgentCommand, AgentCommandResult } from "../agent/agentCommands";
import type { Message } from "./AiAssistantPanel.types";
import { checkAndParseCommand } from "./AiAssistantPanel.utils";

type AddMessage = (
  sender: "user" | "assistant",
  text: string,
  extra?: Partial<Message>,
) => string;

type Params = {
  addMessage: AddMessage;
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

function normalizeTool(command: AgentCommand): AgentCommand {
  const alias = String(command.tool);
  let tool: AgentCommand["tool"] = command.tool;
  if (alias === "convert-to-word") tool = "pdf-to-word";
  else if (alias === "convert-to-excel") tool = "pdf-to-excel";
  else if (alias === "convert-to-ppt" || alias === "convert-to-powerpoint") tool = "pdf-to-ppt";
  else if (alias === "convert-to-png") tool = "pdf-to-png";
  else if (alias === "convert-to-jpeg") tool = "pdf-to-jpeg";
  else if (alias === "convert-to-text" || alias === "convert-to-txt") tool = "pdf-to-txt";
  else if (alias === "convert-to-html") tool = "pdf-to-html";
  return { ...command, tool };
}

export function useAiCommandRuntime({ addMessage, setMessages }: Params) {
  const executeCommand = async (command: AgentCommand): Promise<AgentCommandResult | null> => {
    if (!window.opdfAgent) {
      console.error("opdfAgent bridge not found on window.");
      return null;
    }
    const normalized = normalizeTool(command);
    try {
      return await window.opdfAgent.execute(normalized);
    } catch (error) {
      console.error("Error executing command via bridge:", error);
      return {
        status: "failed",
        tool: normalized.tool,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const handleAgentResult = (result: AgentCommandResult, command: AgentCommand) => {
    const logs = `Response Status: ${result.status}\nMessage: ${result.message}`;
    if (result.status === "confirmation_required") {
      addMessage(
        "assistant",
        `⚠️ **CONFIRMATION REQUIRED**\n\n${result.confirmationPrompt || "This action may make significant changes or remove data. Do you want to continue?"}`,
        { toolLogs: logs, confirmation: command },
      );
      return;
    }

    let text = "";
    if (result.status === "completed") {
      text = `✅ **Execution completed.**\nTool **${result.tool || command.tool}** completed successfully.`;
    } else if (result.status === "input_required") {
      text = `ℹ️ **MISSING INPUT**\n\n${result.message}\n*Missing parameters: ${result.missingArgs?.join(", ") || "n/a"}*`;
    } else if (result.status === "failed") {
      text = `❌ **EXECUTION FAILED**\n\nError: *${result.message}*`;
    } else {
      text = `🤖 Status: **${result.status}**\n${result.message}`;
    }
    addMessage("assistant", text, { toolLogs: logs });
  };

  const processLocalQuery = async (queryText: string) => {
    const parsed = checkAndParseCommand(queryText);
    if (parsed === "help") {
      addMessage(
        "assistant",
        "📚 **SUPPORTED COMMANDS:**\n\n• **Compress document:** *'nén file'*, *'nén tài liệu'*, *'compress'*\n• **Rotate pages:** *'xoay trái'*, *'xoay phải'*, *'xoay tất cả trang qua phải'*\n• **Delete pages:** *'xóa trang 2'*, *'xóa trang 1-3'*, *'delete page 5'*\n• **Run OCR:** *'chạy ocr'*, *'trích xuất chữ'*, *'ocr'*\n• **Page numbers & watermark:** *'thêm số trang'*, *'đóng dấu: BẢN QUYỀN'*\n• **View:** *'phóng to'*, *'thu nhỏ'*, *'tới trang 3'*\n• **Open/Close/Save:** *'mở file'*, *'đóng file'*, *'lưu file'*",
      );
      return;
    }

    if (!parsed || typeof parsed === "string") {
      addMessage(
        "assistant",
        "I could not recognize a specific command. Try one of the quick suggestions below, or type **help** to see the supported command syntax.",
      );
      return;
    }
    if ("error" in parsed) {
      addMessage("assistant", parsed.error);
      return;
    }

    const tempId = addMessage("assistant", `🤖 Sending command: **${parsed.tool}**...`, {
      toolLogs: `Payload: ${JSON.stringify(parsed, null, 2)}`,
      isPending: true,
    });
    const result = await executeCommand(parsed);
    setMessages((prev) => prev.filter((message) => message.id !== tempId));
    if (result) handleAgentResult(result, parsed);
  };

  const handleConfirmInline = async (command: AgentCommand, confirm: boolean) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.confirmation?.tool === command.tool
          ? { ...message, confirmation: undefined }
          : message,
      ),
    );

    if (!confirm) {
      addMessage("user", "Cancel request.");
      addMessage("assistant", `❌ Cancelled tool **${command.tool}**.`);
      return;
    }

    addMessage("user", "Confirm action.");
    const confirmed = { ...command, confirmed: true };
    const tempId = addMessage(
      "assistant",
      `🔄 Running confirmed command: **${command.tool}**...`,
      { isPending: true },
    );
    const result = await executeCommand(confirmed);
    setMessages((prev) => prev.filter((message) => message.id !== tempId));
    if (result) handleAgentResult(result, confirmed);
  };

  return {
    executeCommand,
    handleAgentResult,
    processLocalQuery,
    handleConfirmInline,
  };
}
