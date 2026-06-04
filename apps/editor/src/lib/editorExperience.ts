export type EditorTargetFormat =
  | "word"
  | "excel"
  | "powerpoint"
  | "rtf"
  | "txt"
  | "xml"
  | "html"
  | string
  | undefined;

export const UNIFIED_EDITOR_COPY = {
  appTitle: "AI Document Editor",
  appSubtitle: "Mở tài liệu, sửa bằng AI, rồi xuất Word / Excel / PPT",
  prepareWorkspaceLabel: "Sửa tài liệu bằng AI",
  editWorkspaceLabel: "Soạn mới từ AI",
  prepareViewLabel: "Bản có thể sửa",
  compareViewLabel: "Đối chiếu bản gốc",
  structureViewLabel: "Cấu trúc dữ liệu",
  imageEditViewLabel: "Sửa vùng ảnh AI",
} as const;

export function getEditorHandoffMessage(targetFormat: EditorTargetFormat): string {
  switch (targetFormat) {
    case "ms-office":
      return "Đang chuẩn bị bản MS Office có thể chỉnh sửa. Sửa trực tiếp tại tab này bằng AI rồi xuất Word / Excel / PPT.";
    case "word":
      return "Đang chuẩn bị bản Word có thể chỉnh sửa. Sửa trực tiếp tại tab này bằng AI rồi xuất .docx.";
    case "excel":
      return "Đang chuẩn bị bảng tính có thể chỉnh sửa. AI sẽ giữ cấu trúc dữ liệu để bạn xuất .xlsx.";
    case "powerpoint":
      return "Đang chuẩn bị slide có thể chỉnh sửa. Bạn có thể tinh chỉnh nội dung rồi xuất .pptx.";
    case "rtf":
      return "Đang chuẩn bị bản văn bản có thể chỉnh sửa. Bạn có thể sửa nội dung rồi xuất định dạng phù hợp.";
    case "txt":
      return "Đang nhận diện nội dung văn bản để bạn kiểm tra, sửa và trích xuất.";
    case "xml":
      return "Đang chuẩn bị cấu trúc dữ liệu của tài liệu để bạn kiểm tra và xuất.";
    default:
      return "Đang chuẩn bị tài liệu có thể chỉnh sửa bằng AI.";
  }
}
