export function getDocumentToolLabel(toolId: string): string {
  switch (toolId) {
    case "pdf-to-ms-office":
      return "Sửa bằng AI sang MS Office";
    case "pdf-to-word":
      return "Sửa bằng AI sang MS Office";
    case "pdf-to-excel":
      return "Sửa bảng bằng AI";
    case "pdf-to-ppt":
      return "Tạo slide bằng AI";
    case "pdf-to-txt":
      return "Lấy chữ bằng AI";
    case "pdf-to-html":
      return "Sửa nội dung bằng AI";
    case "pdf-to-xml":
      return "Lấy cấu trúc dữ liệu";
    case "pdf-to-rtf":
      return "Sửa văn bản nâng cao";
    default:
      return "";
  }
}

export function getEditorLaunchTitle(): string {
  return "AI Document Editor";
}

export function getEditorLaunchError(): string {
  return "Trình duyệt đang chặn mở AI Document Editor. Hãy cho phép popup để sửa nội dung bằng AI.";
}
