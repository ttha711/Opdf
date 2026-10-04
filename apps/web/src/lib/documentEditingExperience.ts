export function getDocumentToolLabel(toolId: string): string {
  switch (toolId) {
    case "pdf-to-ms-office":
      return "Edit with AI in MS Office";
    case "pdf-to-word":
      return "Edit with AI in MS Office";
    case "pdf-to-excel":
      return "Edit spreadsheet with AI";
    case "pdf-to-ppt":
      return "Create slides with AI";
    case "pdf-to-txt":
      return "Extract text with AI";
    case "pdf-to-html":
      return "Edit content with AI";
    case "pdf-to-xml":
      return "Extract structured data";
    case "pdf-to-rtf":
      return "Advanced text editing";
    default:
      return "";
  }
}

export function getEditorLaunchTitle(): string {
  return "AI Document Editor";
}

export function getEditorLaunchError(): string {
  return "The browser blocked AI Document Editor. Allow pop-ups to edit content with AI.";
}
