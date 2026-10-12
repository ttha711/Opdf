import type { AgentToolId } from "../agent/types";
import type { OpdfIconName } from "../components/OpdfIcon";

export type PaletteCommand = {
  id: string;
  title: string;
  group: "Document" | "Editing" | "Review" | "Pages" | "Conversion";
  icon: OpdfIconName;
  keywords?: string;
  requiresDocument?: boolean;
  needsFullAccess?: boolean;
  tool: AgentToolId;
  toolId?: string;
};

export const PALETTE_COMMANDS: PaletteCommand[] = [
  { id: "open", title: "Open PDF", group: "Document", icon: "folder-open", keywords: "file import browse", tool: "open-file" },
  { id: "save", title: "Save PDF", group: "Document", icon: "save", keywords: "write changes", requiresDocument: true, tool: "save-pdf" },
  { id: "edit", title: "Edit PDF content", group: "Editing", icon: "edit", keywords: "change text objects images", requiresDocument: true, tool: "ai-content-editor" },
  { id: "select", title: "Select", group: "Editing", icon: "page", keywords: "pointer cursor", requiresDocument: true, tool: "select-tool" },
  { id: "highlight", title: "Highlight", group: "Review", icon: "highlight", keywords: "markup", requiresDocument: true, tool: "highlight-tool" },
  { id: "note", title: "Add comment", group: "Review", icon: "note", keywords: "sticky note annotation", requiresDocument: true, tool: "note-tool" },
  { id: "shape", title: "Draw rectangle", group: "Review", icon: "rectangle", keywords: "shape box", requiresDocument: true, tool: "shape-tool" },
  { id: "redact", title: "Redaction tool", group: "Review", icon: "redact", keywords: "blackout mask", requiresDocument: true, tool: "redact-tool" },
  { id: "signature", title: "Draw signature", group: "Review", icon: "signature", keywords: "handwritten annotate", requiresDocument: true, tool: "signature-tool" },
  { id: "tools", title: "All tools", group: "Document", icon: "tools", keywords: "dashboard browse catalog", needsFullAccess: true, tool: "open-tools-dashboard" },
  { id: "drawing", title: "Drawing layers and CAD snap", group: "Editing", icon: "page", keywords: "ocg cad layers on off visible hidden vector snap endpoint midpoint measure drawing", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "drawing-workspace" },
  { id: "organize", title: "Organize pages", group: "Pages", icon: "page", keywords: "grid reorder thumbnails drag arrange", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "organize-pages" },
  { id: "rotate", title: "Rotate pages", group: "Pages", icon: "rotate-right", keywords: "turn orientation", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "rotate-pdf" },
  { id: "split", title: "Split PDF", group: "Pages", icon: "split", keywords: "divide", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "split-pdf" },
  { id: "merge", title: "Merge PDFs", group: "Pages", icon: "merge", keywords: "join combine", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "merge-pdf" },
  { id: "extract", title: "Extract pages", group: "Pages", icon: "page", keywords: "copy selected pages", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "extract-pages" },
  { id: "delete", title: "Delete pages", group: "Pages", icon: "trash", keywords: "remove", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "delete-pages" },
  { id: "crop", title: "Crop pages", group: "Pages", icon: "crop", keywords: "trim", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "crop-pdf" },
  { id: "watermark", title: "Add watermark", group: "Editing", icon: "watermark", keywords: "confidential stamp", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "watermark-pdf" },
  { id: "ocr", title: "Run OCR", group: "Conversion", icon: "ocr", keywords: "scan recognize searchable", requiresDocument: true, tool: "run-ocr" },
  { id: "png", title: "PDF to PNG", group: "Conversion", icon: "image", keywords: "export image", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "pdf-to-png" },
  { id: "jpeg", title: "PDF to JPEG", group: "Conversion", icon: "image", keywords: "export image jpg", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "pdf-to-jpeg" },
  { id: "word", title: "PDF to Word", group: "Conversion", icon: "file-text", keywords: "docx office", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "pdf-to-word" },
  { id: "compress", title: "Compress PDF", group: "Document", icon: "compress", keywords: "optimize shrink", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "compress-pdf" },
  { id: "protect", title: "Protect PDF", group: "Document", icon: "lock", keywords: "encrypt password", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "protect-pdf" },
  { id: "unlock", title: "Unlock PDF", group: "Document", icon: "unlock", keywords: "decrypt password", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "unlock-pdf" },
  { id: "health", title: "Document Health", group: "Document", icon: "advanced", keywords: "pdfcraft accessibility pdfa revision inspect", requiresDocument: true, needsFullAccess: true, tool: "open-tool-panel", toolId: "document-health" },
];

export function paletteUnavailableReason(command: PaletteCommand, hasDocument: boolean, isPublic: boolean) {
  if (command.requiresDocument && !hasDocument) return "Open a PDF first";
  if (command.needsFullAccess && isPublic) return "Local or OPDF Server required";
  return null;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
export function filterPaletteCommands(commands: PaletteCommand[], query: string) {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return commands;
  return commands.map((command, index) => {
    const title = normalize(command.title);
    const haystack = normalize([command.title, command.group, command.keywords || "", command.id].join(" "));
    if (!terms.every(term => haystack.includes(term))) return null;
    const score = terms.reduce((sum, term) =>
      sum + (title === term ? 100 : title.startsWith(term) ? 40 : title.includes(term) ? 15 : 1), 0);
    return { command, index, score };
  }).filter((row): row is { command: PaletteCommand; index: number; score: number } => row !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.command);
}
