import { useState, FormEvent } from "react";
import type { Message, EngineMode } from "./AiAssistantPanel.types";
import type { AgentCommand, AgentCommandResult } from "../agent/agentCommands";
import { checkAndParseCommand, extractBalancedJson } from "./AiAssistantPanel.utils";
import { useAiAssistantSettings } from "./useAiAssistantSettings";
import { useAiAssistantMessages } from "./useAiAssistantMessages";
import { useAiAssistantIframeBridge } from "./useAiAssistantIframeBridge";

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
  } = useAiAssistantSettings();

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
    localStorage.setItem("opdf_ai_mode", engineMode);
    localStorage.setItem("opdf_dify_url", difyUrl);
    localStorage.setItem("opdf_dify_key", difyKey);
    localStorage.setItem("opdf_iframe_url", iframeUrl);
    setShowSettings(false);
    void syncAiConfigToDesktop("dify", difyUrl, difyKey);
    
    // Add assistant feedback message
    let modeText = "Trợ lý Cục bộ (Offline NLP)";
    if (engineMode === "dify") modeText = "Kết nối Dify Chatbot API";
    if (engineMode === "iframe") modeText = `Nhúng Iframe AI-WEB-CHAT (${iframeUrl})`;

    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Đã lưu cấu hình! Chế độ hoạt động hiện tại: **${modeText}**`,
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
      const feedback = `📚 **DANH SÁCH CÂU LỆNH HỖ TRỢ:**\n\n• **Nén tài liệu:** *'nén file'*, *'nén tài liệu'*, *'compress'*\n• **Xoay trang:** *'xoay trái'*, *'xoay phải'*, *'xoay tất cả trang qua phải'*\n• **Xóa trang:** *'xóa trang 2'*, *'xóa trang 1-3'*, *'delete page 5'*\n• **Chạy OCR:** *'chạy ocr'*, *'trích xuất chữ'*, *'ocr'*\n• **Số trang & Đóng dấu:** \n   - *'thêm số trang'*, *'page numbers'*\n   - *'đóng dấu: BẢN QUYỀN'*, *'watermark: Draft'*\n   - *'thêm header: OPDF Web'*, *'thêm footer: Confidential'*\n• **Mã hóa file:** *'mã hóa mật khẩu: 123456'*, *'giải mã mật khẩu: 123456'*\n• **Xem & Cuộn:** *'phóng to'*, *'thu nhỏ'*, *'reset zoom'*, *'chế độ cuộn'*, *'tới trang 3'*\n• **Mở/Đóng/Lưu:** *'mở file'*, *'đóng file'*, *'lưu file'*\n• **Bảng điều khiển:** *'mở dashboard'*, *'mở công cụ word-to-pdf'*`;
      addMessage("assistant", feedback);
      return;
    }

    if (parsed && typeof parsed !== "string") {
      if ("error" in parsed) {
        addMessage("assistant", parsed.error);
        return;
      }
      
      const tempId = addMessage("assistant", `🤖 Đang gửi lệnh thực thi: **${parsed.tool}**...`, {
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
      const unmatchedText = "Tôi không nhận diện được câu lệnh cụ thể của bạn. 😅\n\nHãy thử lại bằng cách sử dụng các gợi ý nhanh bên dưới, hoặc gõ **'trợ giúp'** để xem bảng cú pháp chuẩn.";
      addMessage("assistant", unmatchedText);
    }
  };

  // Process remote query calling Dify API chatbot
  const processDifyQuery = async (queryText: string) => {
    if (!difyKey) {
      addMessage("assistant", "⚠️ **Chưa cấu hình API Key!** Vui lòng bấm vào bánh răng Settings ở góc trên bên phải để nhập Dify API Key.");
      return;
    }

    const tempId = addMessage("assistant", "AI đang suy nghĩ...", { isPending: true });

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
      const response = await fetch(`${difyUrl}/chat-messages`, {
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

      let textResponse = data.answer || "";
      
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
            
            addMessage("assistant", `🤖 Nhận được lệnh gọi hàm tự động từ Dify: **${cmd.tool}**`);
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
      addMessage("assistant", `❌ **Lỗi kết nối Dify API:** ${err.message}\n\nVui lòng kiểm tra lại Endpoint URL, API Key và cấu hình mạng.`);
    }
  };

  // Universal handler for window.opdfAgent execution results
  const handleAgentResult = (result: AgentCommandResult, command: AgentCommand) => {
    let text = "";
    let extraLogs = `Response Status: ${result.status}\nMessage: ${result.message}`;
    
    if (result.status === "completed") {
      text = `✅ **Thực thi hoàn tất!**\nCông cụ **${result.tool || command.tool}** đã chạy thành công.`;
    } 
    else if (result.status === "confirmation_required") {
      text = `⚠️ **YÊU CẦU XÁC NHẬN!**\n\n${result.confirmationPrompt || "Hành động này có thể gây thay đổi lớn hoặc xóa dữ liệu. Bạn có chắc chắn muốn tiếp tục không?"}`;
      addMessage("assistant", text, {
        toolLogs: extraLogs,
        confirmation: command,
      });
      return;
    } 
    else if (result.status === "input_required") {
      text = `ℹ️ **THIẾU THÔNG TIN THAM SỐ!**\n\n${result.message}\n*Các tham số thiếu: ${result.missingArgs?.join(", ") || "n/a"}*`;
    } 
    else if (result.status === "failed") {
      text = `❌ **THỰC THI THẤT BẠI!**\n\nLỗi: *${result.message}*`;
    } 
    else {
      text = `🤖 Trạng thái: **${result.status}**\n${result.message}`;
    }

    addMessage("assistant", text, { toolLogs: extraLogs });
  };

  // Confirm inline action from chat bubble button
  const handleConfirmInline = async (cmd: AgentCommand, confirm: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.confirmation?.tool === cmd.tool ? { ...m, confirmation: undefined } : m))
    );

    if (!confirm) {
      addMessage("user", "Hủy bỏ yêu cầu.");
      addMessage("assistant", `❌ Đã hủy thực thi công cụ **${cmd.tool}**.`);
      return;
    }

    addMessage("user", "Xác nhận thực hiện.");
    const confirmedCommand: AgentCommand = {
      ...cmd,
      confirmed: true,
    };

    const tempId = addMessage("assistant", `🔄 Đang chạy lệnh đã xác nhận: **${cmd.tool}**...`, { isPending: true });
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
      const tempId = addMessage("assistant", `🤖 Phát hiện câu lệnh PDF: **${parsed.tool}**. Đang thực thi...`, {
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
      if (engineMode === "local") {
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
  };
}
