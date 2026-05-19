import type { AgentCommand } from "../agent/agentCommands";

export type ParseResult = AgentCommand | "help" | { error: string } | null;

/**
 * Parses a user query string against known natural language command patterns
 * for the offline local PDF processor.
 * 
 * Returns:
 * - "help" if the user is asking for assistance.
 * - An AgentCommand object with tool & args if parsing was fully successful.
 * - An object containing { error: string } if the command matched but parameters were invalid or missing.
 * - null if the query matches no offline command patterns.
 */
export const checkAndParseCommand = (queryText: string): ParseResult => {
  const text = queryText.toLowerCase().trim();

  // 1. HELP / TRỢ GIÚP
  if (text === "help" || text === "trợ giúp" || text === "lệnh" || text === "hướng dẫn") {
    return "help";
  }

  // Check if it's a question or general inquiry rather than a direct command
  const questionWords = ["nào", "gì", "sao", "thế nào", "như thế nào", "đâu", "hỏi", "nhỉ", "không", "chưa", "làm thế nào", "giải thích"];
  const isQuestion = questionWords.some(word => text.includes(word));
  if (isQuestion) {
    return null;
  }

  // 2. COMPRESS
  if (text.includes("nén") || text.includes("compress")) {
    return { tool: "compress-pdf" };
  }

  // 3. OCR
  if (text === "ocr" || text.includes("chạy ocr") || text.includes("trích xuất chữ") || text.includes("nhận diện")) {
    return { tool: "run-ocr" };
  }

  // 4. ROTATE VIEW / ROTATE ALL
  if (text.includes("xoay tất cả") || text.includes("rotate all")) {
    if (text.includes("trái") || text.includes("left")) {
      return { tool: "rotate-all-left" };
    } else {
      return { tool: "rotate-all-right" };
    }
  } 
  if (text.includes("xoay trái") || text.includes("xoay qua trái") || text.includes("rotate left") || text.includes("rotate view left")) {
    return { tool: "rotate-view-left" };
  } 
  if (text.includes("xoay phải") || text.includes("xoay qua phải") || text.includes("rotate right") || text.includes("rotate view right")) {
    return { tool: "rotate-view-right" };
  }

  // 5. DELETE PAGES
  if (text.includes("xóa trang") || text.includes("delete page")) {
    const match = text.match(/(\d+([\s,-]*\d+)*)/);
    if (match) {
      return { tool: "delete-pages", args: { pages: match[0].trim() } };
    } else {
      return { error: "Vui lòng nhập số trang muốn xóa (ví dụ: 'xóa trang 2' hoặc 'xóa trang 1,3-5')." };
    }
  }

  // 6. WATERMARK
  if (text.includes("đóng dấu") || text.includes("watermark")) {
    const parts = queryText.split(/[:\s]+/);
    let watermarkText = "DRAFT";
    const index = parts.findIndex(p => p.toLowerCase().includes("dấu") || p.toLowerCase().includes("watermark"));
    if (index !== -1 && parts[index + 1]) {
      watermarkText = parts.slice(index + 1).join(" ");
    }
    return { tool: "watermark-pdf", args: { text: watermarkText } };
  }

  // 7. PAGE NUMBERS
  if (text.includes("số trang") || text.includes("page number")) {
    return { tool: "page-numbers" };
  }

  // 8. HEADER
  if (text.includes("header") || text.includes("tiêu đề đầu")) {
    const headerText = queryText.replace(/^(thêm|add)\s+(header|tiêu đề đầu trang)[:\s]*/i, "").trim() || "OPDF Header";
    return { tool: "header", args: { text: headerText } };
  }

  // 9. FOOTER
  if (text.includes("footer") || text.includes("tiêu đề cuối")) {
    const footerText = queryText.replace(/^(thêm|add)\s+(footer|tiêu đề cuối trang)[:\s]*/i, "").trim() || "OPDF Footer";
    return { tool: "footer", args: { text: footerText } };
  }

  // 10. BATES
  if (text.includes("bates")) {
    return { tool: "bates" };
  }

  // 11. ENCRYPT / PASSWORD
  if (text.includes("mã hóa") || text.includes("encrypt") || text.includes("đặt mật khẩu")) {
    const match = text.match(/(?:mật khẩu|password|mã hóa|encrypt)\s*[:\s]*(\w+)/i);
    const pass = match ? match[1] : "";
    if (pass) {
      return { tool: "encrypt", args: { password: pass } };
    } else {
      return { error: "Vui lòng nhập kèm mật khẩu (ví dụ: 'mã hóa mật khẩu 123456')." };
    }
  }

  // 12. DECRYPT
  if (text.includes("giải mã") || text.includes("decrypt")) {
    const match = text.match(/(?:mật khẩu|password|giải mã|decrypt)\s*[:\s]*(\w+)/i);
    const pass = match ? match[1] : "";
    if (pass) {
      return { tool: "decrypt", args: { password: pass } };
    } else {
      return { error: "Vui lòng nhập mật khẩu giải mã (ví dụ: 'giải mã mật khẩu 123456')." };
    }
  }

  // 13. ZOOM
  if (text.includes("phóng to") || text.includes("zoom in") || text.includes("zoom")) {
    const match = text.match(/(\d+(?:\.\d+)?%?)/);
    if (match) {
      return { tool: "zoom-in", args: { zoom: match[0] } };
    }
    return { tool: "zoom-in" };
  } 
  if (text.includes("thu nhỏ") || text.includes("zoom out")) {
    return { tool: "zoom-out" };
  } 
  if (text.includes("reset zoom") || text.includes("cỡ chuẩn") || text.includes("cỡ gốc")) {
    return { tool: "reset-zoom" };
  }

  // 14. VIEW MODE
  if (text.includes("chế độ cuộn") || text.includes("cuộn liên tục") || text.includes("continuous")) {
    return { tool: "set-view-mode", args: { mode: "continuous" } };
  } 
  if (text.includes("trang đơn") || text.includes("single page") || text.includes("page mode")) {
    return { tool: "set-view-mode", args: { mode: "page" } };
  }

  // 15. NAVIGATION
  if (text.includes("trang tiếp") || text.includes("trang sau") || text.includes("next page") || text.includes("trang kế")) {
    return { tool: "go-next-page" };
  } 
  if (text.includes("trang trước") || text.includes("prev page") || text.includes("trang cũ")) {
    return { tool: "go-prev-page" };
  } 
  if (text.includes("tới trang") || text.includes("đến trang") || text.includes("go to page")) {
    const match = text.match(/(\d+)/);
    if (match) {
      return { tool: "go-to-page", args: { page: Number(match[0]) } };
    } else {
      return { error: "Vui lòng nhập kèm số trang đích (ví dụ: 'tới trang 3')." };
    }
  }

  // 16. OPEN/CLOSE/SAVE
  if (text.includes("mở file") || text.includes("open file")) {
    return { tool: "open-file" };
  } 
  if (text.includes("đóng file") || text.includes("close document") || text.includes("đóng tài liệu")) {
    return { tool: "close-document" };
  } 
  if (text.includes("tải file") || text.includes("lưu file") || text.includes("save") || text.includes("export")) {
    return { tool: "export-pdf" };
  }

  // 17. DASHBOARD / TOOLS
  if (text.includes("dashboard") || text.includes("bảng điều khiển")) {
    return { tool: "open-tools-dashboard" };
  } 
  if (text.includes("mở công cụ") || text.includes("open tool")) {
    const toolName = text.replace(/^(mở công cụ|open tool)[:\s]*/i, "").trim();
    return { tool: "open-tool-panel", args: { toolId: toolName } };
  }

  return null;
};
