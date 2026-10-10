// Canonical catalogue for OPDF's custom tool dashboard. Engines remain in
// EmbedPDF/PDFium, pdf-lib and the configured OPDF Server/Desktop bridge.
// A catalogue entry does not imply that its runtime dependency is available.
import type { OpdfIconName } from "../components/OpdfIcon";

export type ToolCategory = "from_pdf" | "to_pdf" | "merge_split" | "edit_review";
export type ToolCapability = "pdf-to-office" | "office-to-pdf" | "compress" | "encrypt" | "digital-signature" | "pdf-a";

export interface ToolCatalogEntry {
  id: string;
  name: string;
  icon: OpdfIconName;
  color: string;
  bgColor: string;
  borderColor: string;
  category: ToolCategory;
  requiresDocument?: boolean;
  capability?: ToolCapability;
}

export const ALL_TOOLS_CATALOG = [
  { id: "pdf-to-word", name: "PDF to Word", icon: "file-text", color: "#1b6ec2", bgColor: "#e7f1ff", borderColor: "#b8d9ff", category: "from_pdf", requiresDocument: true, capability: "pdf-to-office" },
  { id: "pdf-to-excel", name: "PDF to Excel", icon: "file-text", color: "#198754", bgColor: "#e8f7ee", borderColor: "#b7e4c7", category: "from_pdf", requiresDocument: true, capability: "pdf-to-office" },
  { id: "pdf-to-ppt", name: "PDF to PowerPoint", icon: "file-text", color: "#d9480f", bgColor: "#fff4e6", borderColor: "#ffd8a8", category: "from_pdf", requiresDocument: true, capability: "pdf-to-office" },
  { id: "pdf-to-png", name: "PDF to PNG", icon: "image", color: "#7048e8", bgColor: "#f3f0ff", borderColor: "#d0bfff", category: "from_pdf" },
  { id: "pdf-to-jpeg", name: "PDF to JPEG", icon: "image", color: "#862e9c", bgColor: "#f8f0fc", borderColor: "#e5dbff", category: "from_pdf" },
  { id: "pdf-to-txt", name: getDocumentToolLabel("pdf-to-txt"), icon: "file-text", color: "#f59f00", bgColor: "#fff9db", borderColor: "#ffe066", category: "from_pdf" },
  { id: "pdf-to-xml", name: getDocumentToolLabel("pdf-to-xml"), icon: "file-text", color: "#0ca678", bgColor: "#e6fcf5", borderColor: "#96f2d7", category: "from_pdf" },
  { id: "image-to-pdf", name: "Image to PDF", icon: "image", color: "#7048e8", bgColor: "#f3f0ff", borderColor: "#d0bfff", category: "to_pdf" },
  { id: "txt-to-pdf", name: "TXT to PDF", icon: "file-text", color: "#f59f00", bgColor: "#fff9db", borderColor: "#ffe066", category: "to_pdf" },
  { id: "word-to-pdf", name: "Word to PDF", icon: "file-text", color: "#1b6ec2", bgColor: "#e7f1ff", borderColor: "#b8d9ff", category: "to_pdf", capability: "office-to-pdf" },
  { id: "excel-to-pdf", name: "Excel to PDF", icon: "file-text", color: "#198754", bgColor: "#e8f7ee", borderColor: "#b7e4c7", category: "to_pdf", capability: "office-to-pdf" },
  { id: "ppt-to-pdf", name: "PowerPoint to PDF", icon: "file-text", color: "#d9480f", bgColor: "#fff4e6", borderColor: "#ffd8a8", category: "to_pdf", capability: "office-to-pdf" },
  { id: "compress-pdf", name: "Compress PDF", icon: "compress", color: "#e03131", bgColor: "#fff5f5", borderColor: "#ffc9c9", category: "merge_split", capability: "compress" },
  { id: "merge-pdf", name: "Merge PDF", icon: "merge", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", category: "merge_split" },
  { id: "split-pdf", name: "Split PDF", icon: "split", color: "#e03131", bgColor: "#fff5f5", borderColor: "#ffc9c9", category: "merge_split" },
  { id: "rotate-pdf", name: "Rotate PDF", icon: "rotate-right", color: "#5f3dc4", bgColor: "#f3f0ff", borderColor: "#d0bfff", category: "merge_split" },
  { id: "delete-pages", name: "Delete Pages", icon: "trash", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", category: "merge_split" },
  { id: "extract-pages", name: "Extract Pages", icon: "page", color: "#0b7285", bgColor: "#e3fafc", borderColor: "#99e9f2", category: "merge_split" },
  { id: "crop-pdf", name: "Crop PDF", icon: "crop", color: "#5c7cfa", bgColor: "#edf2ff", borderColor: "#bac8ff", category: "merge_split" },
  { id: "watermark-pdf", name: "Watermark", icon: "watermark", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "page-numbers", name: "Page Numbers", icon: "hash", color: "#495057", bgColor: "#f1f3f5", borderColor: "#ced4da", category: "edit_review", requiresDocument: true },
  { id: "ocr-pdf", name: "OCR PDF", icon: "ocr", color: "#087f5b", bgColor: "#e6fcf5", borderColor: "#96f2d7", category: "edit_review", requiresDocument: true },
  { id: "fill-form", name: "Fill Form", icon: "form", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", category: "edit_review", requiresDocument: true },
  { id: "protect-pdf", name: "Protect PDF", icon: "lock", color: "#9c36b5", bgColor: "#f8f0fc", borderColor: "#e5dbff", category: "edit_review", capability: "encrypt" },
  { id: "unlock-pdf", name: "Unlock PDF", icon: "unlock", color: "#2f9e44", bgColor: "#ebfbee", borderColor: "#b2f2bb", category: "edit_review", capability: "encrypt" },
  { id: "redact-pdf", name: "Redact PDF", icon: "redact", color: "#212529", bgColor: "#f1f3f5", borderColor: "#ced4da", category: "edit_review", requiresDocument: true },
  { id: "compare-pdf", name: "Compare PDF", icon: "compare", color: "#364fc7", bgColor: "#edf2ff", borderColor: "#bac8ff", category: "edit_review", requiresDocument: true },
  { id: "sign-pdf", name: "Sign PDF", icon: "signature", color: "#a61e4d", bgColor: "#fff0f6", borderColor: "#fcc2d7", category: "edit_review", requiresDocument: true, capability: "digital-signature" },
  { id: "pdf-to-html", name: "PDF to HTML", icon: "file-text", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "from_pdf" },
  { id: "pdf-to-rtf", name: "PDF to RTF", icon: "file-text", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "from_pdf" },
  { id: "rtf-to-pdf", name: "RTF to PDF", icon: "file-text", color: "#1b6ec2", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "to_pdf", capability: "office-to-pdf" },
  { id: "insert-pdf", name: "Insert PDF", icon: "insert", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", category: "merge_split", requiresDocument: true },
  { id: "header", name: "Header", icon: "header", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "footer", name: "Footer", icon: "file-text", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "bates", name: "Bates Numbering", icon: "bates", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "normalize", name: "Convert to PDF/A", icon: "file-text", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true, capability: "pdf-a" },
  { id: "measure-drawing", name: "Measure Drawing", icon: "measure", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "edit-content", name: "Edit PDF Content", icon: "edit", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "advanced-pdf", name: "Advanced PDF (Forms, Links, Bookmarks)", icon: "tools", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
  { id: "ai-content-editor", name: "AI Edit", icon: "edit", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", category: "edit_review", requiresDocument: true },
] as const satisfies readonly ToolCatalogEntry[];

export type DashboardToolId = (typeof ALL_TOOLS_CATALOG)[number]["id"];

export function isDashboardToolId(value: string): value is DashboardToolId {
  return ALL_TOOLS_CATALOG.some((tool) => tool.id === value);
}
