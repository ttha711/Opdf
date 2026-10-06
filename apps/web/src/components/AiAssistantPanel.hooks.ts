import { useState, FormEvent } from "react";
import type { Message, EngineMode } from "./AiAssistantPanel.types";
import type { AgentCommand, AgentCommandResult } from "../agent/agentCommands";
import { checkAndParseCommand, extractBalancedJson } from "./AiAssistantPanel.utils";
import { useAiAssistantSettings } from "./useAiAssistantSettings";
import { useAiAssistantMessages } from "./useAiAssistantMessages";
import { useAiAssistantIframeBridge } from "./useAiAssistantIframeBridge";
import { useMachineAgentBridge } from "../hooks/useMachineAgentBridge";

export function useAiAssistant() {
  const [inputValue, setInputValue] = useState("");

  const {
    showSettings,
    setShowSettings,
    engineMode,
    setEngineMode,
    difyUrl,
    setDifyUrl,
    difyKey,
    setDifyKey,
    conversationId,
    setConversationId,
    iframeUrl,
    setIframeUrl,
    syncAiConfigToDesktop,
    isServerRuntime,
  } = useAiAssistantSettings();

  const machineBridge = useMachineAgentBridge();

  const {
    messages,
    setMessages,
    chatEndRef,
    addMessage,
  } = useAiAssistantMessages();

  // Set up bilateral postMessage listener for embedded iframe
  useAiAssistantIframeBridge();

  // Save settings helper
  const handleSaveSettings = () => {
    localStorage.setItem("opdf_ai_mode", isServerRuntime ? "agent" : engineMode);
    if (!isServerRuntime) localStorage.setItem("opdf_dify_url", difyUrl);
    if (isServerRuntime || window.opdf?.setAiConfig) {
      localStorage.removeItem("opdf_dify_key");
    } else {
      localStorage.setItem("opdf_dify_key", difyKey);
    }
    localStorage.setItem("opdf_iframe_url", iframeUrl);
    setShowSettings(false);
    if (!isServerRuntime) void syncAiConfigToDesktop(engineMode, difyUrl, difyKey);
    
    // Add assistant feedback message
    let modeText = isServerRuntime ? "Authenticated Machine Agent Bridge" : "Local Assistant (Offline NLP)";
    if (!isServerRuntime && engineMode === "dify") modeText = "Dify Chatbot API";
    if (!isServerRuntime && engineMode === "iframe") modeText = `Embedded AI-WEB-CHAT (${iframeUrl})`;

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

  // Execute Agent Command and handle response
  const executeCommand = async (command: AgentCommand): Promise<AgentCommandResult | null> => {
    if (!window.opdfAgent) {
      console.error("opdfAgent bridge not found on window.");
      return null;
    }

    // Normalize and alias common chatbot guess tools
    const toolAlias = String(command.tool);
    let normalizedTool: AgentCommand["tool"] = command.tool;
    if (toolAlias === "convert-to-word") normalizedTool = "pdf-to-word";
    else if (toolAlias === "convert-to-excel") normalizedTool = "pdf-to-excel";
    else if (toolAlias === "convert-to-ppt" || toolAlias === "convert-to-powerpoint") normalizedTool = "pdf-to-ppt";
    else if (toolAlias === "convert-to-png") normalizedTool = "pdf-to-png";
    else if (toolAlias === "convert-to-jpeg") normalizedTool = "pdf-to-jpeg";
    else if (toolAlias === "convert-to-text" || toolAlias === "convert-to-txt") normalizedTool = "pdf-to-txt";
    else if (toolAlias === "convert-to-html") normalizedTool = "pdf-to-html";

    const normalizedCommand = {
      ...command,
      tool: normalizedTool
    };

    try {
      const result = await window.opdfAgent.execute(normalizedCommand);
      return result;
    } catch (err) {
      console.error("Error executing command via bridge:", err);
      return {
        status: "failed",
        tool: normalizedCommand.tool,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };

  // Process a local query using offline NLP parser
  const processLocalQuery = async (queryText: string) => {
    const parsed = checkAndParseCommand(queryText);

    if (parsed === "help") {
      const feedback = `📚 **SUPPORTED COMMANDS:**\n\n• **Compress document:** *'nén file'*, *'nén tài liệu'*, *'compress'*\n• **Rotate pages:** *'xoay trái'*, *'xoay phải'*, *'xoay tất cả trang qua phải'*\n• **Delete pages:** *'xóa trang 2'*, *'xóa trang 1-3'*, *'delete page 5'*\n• **Run OCR:** *'chạy ocr'*, *'trích xuất chữ'*, *'ocr'*\n• **Page numbers & watermark:** \n   - *'thêm số trang'*, *'page numbers'*\n   - *'đóng dấu: BẢN QUYỀN'*, *'watermark: Draft'*\n   - *'thêm header: OPDF Web'*, *'thêm footer: Confidential'*\n• **File encryption:** *'mã hóa mật khẩu: 123456'*, *'giải mã mật khẩu: 123456'*\n• **View & navigation:** *'phóng to'*, *'thu nhỏ'*, *'reset zoom'*, *'chế độ cuộn'*, *'tới trang 3'*\n• **Open/Close/Save:** *'mở file'*, *'đóng file'*, *'lưu file'*\n• **Dashboard:** *'mở dashboard'*, *'mở công cụ word-to-pdf'*`;
      addMessage("assistant", feedback);
      return;
    }

    if (parsed && typeof parsed !== "string") {
      if ("error" in parsed) {
        addMessage("assistant", parsed.error);
        return;
      }
      
      const tempId = addMessage("assistant", `🤖 Sending command: **${parsed.tool}**...`, {
        toolLogs: `Payload: ${JSON.stringify(parsed, null, 2)}`,
        isPending: true,
      });

      // Execute command via bridge
      const result = await executeCommand(parsed);

      // Remove typing / temporary message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));

      if (result) {
        handleAgentResult(result, parsed);
      }
    } else {
      // Unrecognized command
      const unmatchedText = "I could not recognize a specific command. Try one of the quick suggestions below, or type **help** to see the supported command syntax.";
      addMessage("assistant", unmatchedText);
    }
  };

  // Process remote query calling Dify API chatbot
  const processDifyQuery = async (queryText: string) => {
    const tempId = addMessage("assistant", "AI is thinking...", { isPending: true });

    let documentStateContext = "";
    if (window.opdfAgent) {
      try {
        const state = window.opdfAgent.getState();
        if (state && state.hasDocument) {
          documentStateContext = `\n[DOCUMENT CONTEXT: Hiện tại, người dùng đang mở file: "${state.fileName}".
- Tổng số trang: ${state.totalPages}
- Trang hiện tại đang xem: ${state.currentPage}
- Công cụ đang kích hoạt: ${state.activeTool}
- Chế độ hiển thị: ${state.viewMode}
- Môi trường chạy: ${state.runtime}
Vui lòng sử dụng thông tin này nếu người dùng yêu cầu xoay trang, xóa trang, zoom, hoặc thực hiện bất kỳ hành động nào trên tài liệu đang mở này.]\n`;
        } else {
          documentStateContext = `\n[DOCUMENT CONTEXT: Hiện tại không có tài liệu nào được mở. Nếu người dùng yêu cầu các thao tác xử lý PDF, hãy nhắc họ mở file trước.]\n`;
        }
      } catch (e) {
        console.warn("Failed to get agent state:", e);
      }
    }

    // Invisible system-context wrapped prompt so the AI chatbot knows it is in OPDF Web Viewer
    const richQuery = 
`[SYSTEM CONTEXT: Bạn đang hỗ trợ trực tiếp bên trong ứng dụng OPDF Web Viewer (hệ thống xử lý tài liệu PDF trực tuyến của Ong & Ong). KHÔNG phải ứng dụng NextJS Project Control cũ nữa. Hãy quên menu công cụ của dự án cũ (Image Generator, Corporate Services, Our Projects...).

Ngay bây giờ, người dùng đang mở trang web OPDF và đang thao tác với tài liệu PDF. Họ có thể thực hiện 57 tính năng xử lý PDF chất lượng cao bao gồm:
- Chuyển đổi định dạng (pdf-to-word, pdf-to-excel, pdf-to-ppt, pdf-to-png, pdf-to-jpeg, pdf-to-txt)
- Nén PDF (compress-pdf)
- Xoay trang (rotate-view-left, rotate-view-right, rotate-all-left, rotate-all-right)
- Xóa trang (delete-pages, tham số ví dụ: "2" hoặc "1-3")
- Trích xuất chữ bằng công cụ OCR (run-ocr)
- Đánh số trang (page-numbers)
- Đóng dấu Watermark (watermark-pdf, ví dụ text: "BẢN QUYỀN")
- Thêm tiêu đề đầu trang/cuối trang (header, footer)
- Mã hóa mật khẩu file (encrypt, decrypt)
- Phóng to/thu nhỏ/reset zoom, cuộn liên tục (zoom-in, zoom-out, reset-zoom, set-view-mode)...
${documentStateContext}
Nhiệm vụ của bạn:
1. Luôn hỗ trợ người dùng với vai trò là Trợ lý OPDF PDF Copilot. Giới thiệu các tính năng PDF của OPDF bằng bảng Markdown hoặc danh sách nếu họ hỏi về công cụ.
2. CHÚ Ý CỰC KỲ QUAN TRỌNG VỀ ĐỊNH DẠNG:
- TUYỆT ĐỐI KHÔNG được in bất kỳ đoạn mã JSON thô nào (dạng {"tool": ...}) ra phần văn bản nói chuyện hay hướng dẫn người dùng. Người dùng cực kỳ ghét và khó chịu khi nhìn thấy các chuỗi JSON thô trong tin nhắn!
- Khi hướng dẫn hay đưa ra ví dụ, chỉ được phép sử dụng ngôn ngữ tự nhiên thông thường (ví dụ: "Tôi có thể giúp bạn: Nén tài liệu này, Xoay trang 2...").
- Bạn CHỈ được phép in mã JSON thực thi duy nhất ở dòng cuối cùng của câu trả lời khi người dùng ra lệnh thực thi thật sự (không bọc trong dấu nháy hay block code), dạng: {"tool": "compress-pdf"}. Hệ thống sẽ tự động bắt lấy dòng JSON cuối cùng này để thực thi ẩn cho người dùng.]

User: ${queryText}`;

    try {
      const configuredGateway = (import.meta.env.VITE_OPDF_AI_GATEWAY_URL || "").trim().replace(/\/+$/, "");
      const isDesktopRuntime = typeof window !== "undefined" && Boolean(window.opdf?.getAiAccessToken);
      let gatewayBase = isDesktopRuntime ? configuredGateway : "";
      if (isDesktopRuntime && !gatewayBase) {
        const status = await window.opdf?.getAiDeviceStatus?.();
        gatewayBase = (status?.gatewayBaseUrl || "").replace(/\/+$/, "");
      }

      if (!gatewayBase && !difyKey) {
        throw new Error("AI gateway or Dify API Key is not configured.");
      }

      let response: Response;
      if (gatewayBase) {
        const deviceToken = await window.opdf?.getAiAccessToken?.();
        response = await fetch(`${gatewayBase}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(deviceToken ? { "Authorization": `Bearer ${deviceToken}` } : {}),
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
            "Authorization": `Bearer ${difyKey}`,
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
        const errorText = await response.text();
        let errMsg = `Dify HTTP Error: ${response.status}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.message || parsed.error) {
            errMsg += ` - ${parsed.message || parsed.error}`;
          }
        } catch {
          if (errorText) errMsg += ` - ${errorText.substring(0, 100)}`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      
      // Remove typing message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));

      // Handle new conversation id
      if (data.conversation_id && data.conversation_id !== conversationId) {
        setConversationId(data.conversation_id);
        localStorage.setItem("opdf_dify_conv_id", data.conversation_id);
      }

      let textResponse = data.answer || data.output || data.message || "";
      
      // Clean up <think>...</think> reasoning block (e.g. for DeepSeek-R1 models)
      textResponse = textResponse.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (textResponse.includes("<think>")) {
        textResponse = textResponse.split("<think>")[0].trim();
      }
      
      // Robust Balanced Brace JSON Command Extractor
      try {
        const jsonMatch = extractBalancedJson(textResponse);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch);
          if (parsed.tool || parsed.execute) {
            const cmd: AgentCommand = {
              tool: parsed.tool || parsed.execute,
              args: parsed.args,
              confirmed: parsed.confirmed,
            };
            
            addMessage("assistant", `🤖 Received an automated tool call from Dify: **${cmd.tool}**`);
            const res = await executeCommand(cmd);
            if (res) handleAgentResult(res, cmd);

            // Clean the JSON string and markdown codeblocks from the Dify text response
            const cleanText = textResponse.replace(jsonMatch, "").replace(/```json|```/g, "").trim();
            if (cleanText) {
              addMessage("assistant", cleanText);
            }
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to parse embedded JSON command:", e);
      }

      addMessage("assistant", textResponse);

    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      addMessage("assistant", `❌ **Dify API connection error:** ${err.message}\n\nCheck the endpoint URL, API key, and network configuration.`);
    }
  };

  const processMachineAgentQuery = async (queryText: string) => {
    const tempId = addMessage("assistant", "Waiting for your paired machine agent...", { isPending: true });
    try {
      const context = window.opdfAgent?.getState?.() ?? {};
      const raw = await machineBridge.sendQuery(queryText, context as Record<string, unknown>);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));

      let textResponse = "";
      if (typeof raw === "string") textResponse = raw;
      else if (raw && typeof raw === "object") {
        const value = raw as Record<string, unknown>;
        textResponse =
          (typeof value.answer === "string" && value.answer) ||
          (typeof value.message === "string" && value.message) ||
          (typeof value.output === "string" && value.output) ||
          JSON.stringify(raw);
      }

      textResponse = textResponse.trim();
      if (!textResponse) {
        addMessage("assistant", "Machine Agent completed without a text response.");
        return;
      }

      const jsonMatch = extractBalancedJson(textResponse);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch);
          if (parsed.tool || parsed.execute) {
            const command: AgentCommand = {
              tool: parsed.tool || parsed.execute,
              args: parsed.args,
              confirmed: parsed.confirmed,
            };
            const result = await executeCommand(command);
            if (result) handleAgentResult(result, command);
            const clean = textResponse.replace(jsonMatch, "").replace(/```json|```/g, "").trim();
            if (clean) addMessage("assistant", clean);
            return;
          }
        } catch (error) {
          console.warn("Unable to parse Machine Agent tool call:", error);
        }
      }

      addMessage("assistant", textResponse);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      addMessage(
        "assistant",
        `Machine Agent Bridge error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Universal handler for window.opdfAgent execution results
  const handleAgentResult = (result: AgentCommandResult, command: AgentCommand) => {
    let text = "";
    let extraLogs = `Response Status: ${result.status}\nMessage: ${result.message}`;
    
    if (result.status === "completed") {
      text = `✅ **Execution completed.**\nTool **${result.tool || command.tool}** completed successfully.`;
    } 
    else if (result.status === "confirmation_required") {
      text = `⚠️ **CONFIRMATION REQUIRED**\n\n${result.confirmationPrompt || "This action may make significant changes or remove data. Do you want to continue?"}`;
      addMessage("assistant", text, {
        toolLogs: extraLogs,
        confirmation: command,
      });
      return;
    } 
    else if (result.status === "input_required") {
      text = `ℹ️ **MISSING INPUT**\n\n${result.message}\n*Missing parameters: ${result.missingArgs?.join(", ") || "n/a"}*`;
    } 
    else if (result.status === "failed") {
      text = `❌ **EXECUTION FAILED**\n\nError: *${result.message}*`;
    } 
    else {
      text = `🤖 Status: **${result.status}**\n${result.message}`;
    }

    addMessage("assistant", text, { toolLogs: extraLogs });
  };

  // Confirm inline action from chat bubble button
  const handleConfirmInline = async (cmd: AgentCommand, confirm: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.confirmation?.tool === cmd.tool ? { ...m, confirmation: undefined } : m))
    );

    if (!confirm) {
      addMessage("user", "Cancel request.");
      addMessage("assistant", `❌ Cancelled tool **${cmd.tool}**.`);
      return;
    }

    addMessage("user", "Confirm action.");
    const confirmedCommand: AgentCommand = {
      ...cmd,
      confirmed: true,
    };

    const tempId = addMessage("assistant", `🔄 Running confirmed command: **${cmd.tool}**...`, { isPending: true });
    const result = await executeCommand(confirmedCommand);
    setMessages((prev) => prev.filter((m) => m.id !== tempId));

    if (result) {
      handleAgentResult(result, confirmedCommand);
    }
  };

  // Hybrid Routing handler: Intercepts PDF specific commands, falls back to selected engine
  const handleUserQuery = async (queryText: string) => {
    const parsed = checkAndParseCommand(queryText);
    
    if (parsed && typeof parsed !== "string" && !("error" in parsed)) {
      // Execute direct PDF command locally
      const tempId = addMessage("assistant", `🤖 Detected PDF command: **${parsed.tool}**. Executing...`, {
        toolLogs: `Payload: ${JSON.stringify(parsed, null, 2)}`,
        isPending: true,
      });

      const result = await executeCommand(parsed);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));

      if (result) {
        handleAgentResult(result, parsed);
      }
    } else if (parsed === "help") {
      processLocalQuery(queryText);
    } else {
      // General question: route to selected engine
      if (engineMode === "agent") {
        processMachineAgentQuery(queryText);
      } else if (engineMode === "local") {
        processLocalQuery(queryText);
      } else {
        processDifyQuery(queryText);
      }
    }
  };

  // Main Submit Handler
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    addMessage("user", userText);
    setInputValue("");

    setTimeout(() => {
      handleUserQuery(userText);
    }, 400);
  };

  // Handle prompt suggestion chip click
  const handleSuggestionClick = (suggestionText: string) => {
    addMessage("user", suggestionText);
    setTimeout(() => {
      handleUserQuery(suggestionText);
    }, 400);
  };

  return {
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
    isProductionWeb: isServerRuntime,
    machineAgentConnected: machineBridge.connected,
    machineAgentCount: machineBridge.agents.length,
    pairingCode: machineBridge.pairing?.code,
    pairingExpiresAt: machineBridge.pairing?.expiresAt,
    pairingLoading: machineBridge.loading,
    pairingError: machineBridge.error,
    startMachineAgentPairing: machineBridge.startPairing,
  };
}
