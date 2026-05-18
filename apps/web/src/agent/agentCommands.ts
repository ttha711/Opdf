import type { ActiveTool, ViewMode } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { DocumentToolOptions, MarkupOptions, MarkupTool, WatermarkOptions } from "../hooks/useDocumentActions";

export type AgentToolRisk = "safe" | "needs-input" | "destructive";
export type AgentCommandStatus = "completed" | "input_required" | "confirmation_required" | "unavailable" | "failed";

export type AgentToolId =
  | "open-file"
  | "close-document"
  | "export-pdf"
  | "save-pdf"
  | "compress-pdf"
  | "run-ocr"
  | "convert-to-images"
  | "go-prev-page"
  | "go-next-page"
  | "go-to-page"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom"
  | "set-view-mode"
  | "rotate-view-left"
  | "rotate-view-right"
  | "undo-annotations"
  | "redo-annotations"
  | "select-tool"
  | "highlight-tool"
  | "note-tool"
  | "shape-tool"
  | "redact-tool"
  | "signature-tool"
  | "rotate-all-left"
  | "rotate-all-right"
  | "delete-pages"
  | "insert-pdf"
  | "crop-current"
  | "page-numbers"
  | "header"
  | "footer"
  | "bates"
  | "encrypt"
  | "decrypt"
  | "normalize"
  | "open-tools-dashboard"
  | "open-tool-panel"
  | "pdf-to-word"
  | "pdf-to-excel"
  | "pdf-to-ppt"
  | "pdf-to-png"
  | "pdf-to-jpeg"
  | "pdf-to-txt"
  | "pdf-to-html"
  | "pdf-to-xml"
  | "pdf-to-rtf"
  | "word-to-pdf"
  | "excel-to-pdf"
  | "ppt-to-pdf"
  | "image-to-pdf"
  | "rtf-to-pdf"
  | "txt-to-pdf"
  | "merge-pdf"
  | "split-pdf"
  | "watermark-pdf"
  | "fill-form";

export interface AgentToolDefinition {
  id: AgentToolId;
  title: string;
  description: string;
  risk: AgentToolRisk;
  requiresDocument?: boolean;
  requiredArgs?: string[];
  optionalArgs?: string[];
  documentTool?: DocumentTool;
  markupTool?: MarkupTool;
  panelTool?: string;
}

export interface AgentCommand {
  tool: AgentToolId;
  args?: Record<string, unknown>;
  confirmed?: boolean;
}

export interface AgentCommandResult {
  status: AgentCommandStatus;
  message: string;
  tool?: AgentToolId;
  missingArgs?: string[];
  confirmationPrompt?: string;
}

export interface AgentStateSnapshot {
  hasDocument: boolean;
  fileName: string;
  currentPage: number;
  totalPages: number;
  activeTool: string;
  viewMode: string;
  hasDesktopBridge: boolean;
}

export interface AgentActionContext {
  state: AgentStateSnapshot;
  actions: {
    openFile?: () => void | Promise<void>;
    closeDocument?: () => void | Promise<void>;
    exportPdf?: () => void | Promise<void>;
    compressDocument?: () => void | Promise<void>;
    runOcr?: () => void | Promise<void>;
    convertToImages?: () => void | Promise<void>;
    goPrevPage?: () => void;
    goNextPage?: () => void;
    zoomIn?: () => void;
    zoomOut?: () => void;
    resetZoom?: () => void;
    rotateLeft?: () => void;
    rotateRight?: () => void;
    undoAnnotations?: () => void | Promise<void>;
    redoAnnotations?: () => void | Promise<void>;
    runDocumentTool?: (tool?: DocumentTool) => void | Promise<void>;
    runConfiguredDocumentTool?: (tool: DocumentTool, options: DocumentToolOptions) => void | Promise<void>;
    runConfiguredMarkupTool?: (tool: MarkupTool, options: MarkupOptions) => void | Promise<void>;
    runConfiguredWatermark?: (options: WatermarkOptions) => void | Promise<void>;
    setPage?: (page: number) => void;
    setViewMode?: (mode: ViewMode) => void;
    setActiveTool?: (tool: ActiveTool) => void;
    setShowDashboard?: (show: boolean) => void;
    setActiveDashboardTool?: (toolId: string | null) => void;
    setViewerError?: (message: string | null) => void;
  };
}

const conversionPanelTools: AgentToolDefinition[] = [
  { id: "pdf-to-word", title: "PDF to Word", description: "Open the PDF to Word export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-word" },
  { id: "pdf-to-excel", title: "PDF to Excel", description: "Open the PDF to Excel export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-excel" },
  { id: "pdf-to-ppt", title: "PDF to PowerPoint", description: "Open the PDF to PowerPoint export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-ppt" },
  { id: "pdf-to-png", title: "PDF to PNG", description: "Open the PDF image export tool with PNG output.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-png" },
  { id: "pdf-to-jpeg", title: "PDF to JPEG", description: "Open the PDF image export tool with JPEG output.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-jpeg" },
  { id: "pdf-to-txt", title: "PDF to TXT", description: "Open the PDF text export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-txt" },
  { id: "pdf-to-html", title: "PDF to HTML", description: "Open the PDF to HTML export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-html" },
  { id: "pdf-to-xml", title: "PDF to XML", description: "Open the PDF to XML export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-xml" },
  { id: "pdf-to-rtf", title: "PDF to RTF", description: "Open the PDF to RTF export tool.", risk: "needs-input", requiresDocument: true, panelTool: "pdf-to-rtf" },
  { id: "word-to-pdf", title: "Word to PDF", description: "Open the Word to PDF converter and ask for a source file.", risk: "needs-input", panelTool: "word-to-pdf" },
  { id: "excel-to-pdf", title: "Excel to PDF", description: "Open the Excel to PDF converter and ask for a source file.", risk: "needs-input", panelTool: "excel-to-pdf" },
  { id: "ppt-to-pdf", title: "PowerPoint to PDF", description: "Open the PowerPoint to PDF converter and ask for a source file.", risk: "needs-input", panelTool: "ppt-to-pdf" },
  { id: "image-to-pdf", title: "Image to PDF", description: "Open the Image to PDF converter and ask for source images.", risk: "needs-input", panelTool: "image-to-pdf" },
  { id: "rtf-to-pdf", title: "RTF to PDF", description: "Open the RTF to PDF converter and ask for a source file.", risk: "needs-input", panelTool: "rtf-to-pdf" },
  { id: "txt-to-pdf", title: "TXT to PDF", description: "Open the TXT to PDF converter and ask for a source file.", risk: "needs-input", panelTool: "txt-to-pdf" },
  { id: "merge-pdf", title: "Merge PDF", description: "Open merge workflow. Requires additional PDF files.", risk: "needs-input", panelTool: "merge-pdf" },
  { id: "split-pdf", title: "Split PDF", description: "Open split workflow for page ranges or extraction.", risk: "needs-input", requiresDocument: true, panelTool: "split-pdf" },
  { id: "watermark-pdf", title: "Watermark PDF", description: "Add a text watermark to the current PDF.", risk: "safe", requiresDocument: true, requiredArgs: ["text"], optionalArgs: ["fontSize", "color", "opacity", "rotation"], panelTool: "watermark-pdf" },
  { id: "fill-form", title: "Fill Form", description: "Enable form filling and annotation tools.", risk: "needs-input", requiresDocument: true, panelTool: "fill-form" },
];

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  { id: "open-file", title: "Open File", description: "Open a PDF or supported local file.", risk: "needs-input" },
  { id: "close-document", title: "Close Document", description: "Close the current document.", risk: "destructive", requiresDocument: true },
  { id: "export-pdf", title: "Export PDF", description: "Export the current edited PDF.", risk: "safe", requiresDocument: true },
  { id: "save-pdf", title: "Save PDF", description: "Alias for exporting the current edited PDF.", risk: "safe", requiresDocument: true },
  { id: "compress-pdf", title: "Compress PDF", description: "Compress the current PDF.", risk: "safe", requiresDocument: true },
  { id: "run-ocr", title: "Run OCR", description: "Run OCR on the current PDF.", risk: "safe", requiresDocument: true },
  { id: "convert-to-images", title: "Convert to Images", description: "Export rendered pages as image files.", risk: "safe", requiresDocument: true },
  { id: "go-prev-page", title: "Previous Page", description: "Navigate to the previous page.", risk: "safe", requiresDocument: true },
  { id: "go-next-page", title: "Next Page", description: "Navigate to the next page.", risk: "safe", requiresDocument: true },
  { id: "go-to-page", title: "Go to Page", description: "Navigate to a specific page.", risk: "safe", requiresDocument: true, requiredArgs: ["page"] },
  { id: "zoom-in", title: "Zoom In", description: "Increase viewer zoom.", risk: "safe", requiresDocument: true },
  { id: "zoom-out", title: "Zoom Out", description: "Decrease viewer zoom.", risk: "safe", requiresDocument: true },
  { id: "reset-zoom", title: "Reset Zoom", description: "Reset viewer zoom.", risk: "safe", requiresDocument: true },
  { id: "set-view-mode", title: "Set View Mode", description: "Switch viewer layout mode.", risk: "safe", requiresDocument: true, requiredArgs: ["mode"] },
  { id: "rotate-view-left", title: "Rotate View Left", description: "Rotate the viewer left without changing the file.", risk: "safe", requiresDocument: true },
  { id: "rotate-view-right", title: "Rotate View Right", description: "Rotate the viewer right without changing the file.", risk: "safe", requiresDocument: true },
  { id: "undo-annotations", title: "Undo Annotation", description: "Undo the latest annotation change.", risk: "safe", requiresDocument: true },
  { id: "redo-annotations", title: "Redo Annotation", description: "Redo the latest annotation change.", risk: "safe", requiresDocument: true },
  { id: "select-tool", title: "Select Tool", description: "Switch to select mode.", risk: "safe", requiresDocument: true },
  { id: "highlight-tool", title: "Highlight Tool", description: "Switch to highlight annotation mode.", risk: "safe", requiresDocument: true },
  { id: "note-tool", title: "Note Tool", description: "Switch to note annotation mode.", risk: "safe", requiresDocument: true },
  { id: "shape-tool", title: "Shape Tool", description: "Switch to shape annotation mode.", risk: "safe", requiresDocument: true },
  { id: "redact-tool", title: "Redact Tool", description: "Switch to redaction annotation mode.", risk: "safe", requiresDocument: true },
  { id: "signature-tool", title: "Signature Tool", description: "Switch to signature annotation mode.", risk: "safe", requiresDocument: true },
  { id: "rotate-all-left", title: "Rotate All Pages Left", description: "Persistently rotate every PDF page left.", risk: "safe", requiresDocument: true, documentTool: "rotate-all-left" },
  { id: "rotate-all-right", title: "Rotate All Pages Right", description: "Persistently rotate every PDF page right.", risk: "safe", requiresDocument: true, documentTool: "rotate-all-right" },
  { id: "delete-pages", title: "Delete Pages", description: "Delete one or more pages from the PDF.", risk: "destructive", requiresDocument: true, requiredArgs: ["pages"], documentTool: "delete-pages" },
  { id: "insert-pdf", title: "Insert PDF", description: "Insert pages from another PDF.", risk: "needs-input", requiresDocument: true, requiredArgs: ["targetPage", "position"], documentTool: "insert-pdf" },
  { id: "crop-current", title: "Crop Current Page", description: "Crop the current page.", risk: "destructive", requiresDocument: true, requiredArgs: ["marginPercent"], documentTool: "crop-current" },
  { id: "page-numbers", title: "Add Page Numbers", description: "Add page numbers with optional prefix/suffix and range.", risk: "safe", requiresDocument: true, markupTool: "page-numbers" },
  { id: "header", title: "Add Header", description: "Add a header to pages.", risk: "safe", requiresDocument: true, requiredArgs: ["text"], markupTool: "header" },
  { id: "footer", title: "Add Footer", description: "Add a footer to pages.", risk: "safe", requiresDocument: true, requiredArgs: ["text"], markupTool: "footer" },
  { id: "bates", title: "Add Bates Numbering", description: "Add Bates numbering to pages.", risk: "safe", requiresDocument: true, markupTool: "bates" },
  { id: "encrypt", title: "Encrypt PDF", description: "Encrypt the PDF with a password.", risk: "destructive", requiresDocument: true, requiredArgs: ["password"], documentTool: "encrypt" },
  { id: "decrypt", title: "Decrypt PDF", description: "Decrypt the PDF with a password.", risk: "destructive", requiresDocument: true, requiredArgs: ["password"], documentTool: "decrypt" },
  { id: "normalize", title: "Convert to PDF/A", description: "Normalize the PDF to PDF/A where supported.", risk: "safe", requiresDocument: true, documentTool: "normalize" },
  { id: "open-tools-dashboard", title: "Open Tools Dashboard", description: "Open the all-tools dashboard.", risk: "safe" },
  { id: "open-tool-panel", title: "Open Tool Panel", description: "Open a specific tool panel by id.", risk: "safe", requiredArgs: ["toolId"] },
  ...conversionPanelTools,
];

const definitionById = new Map(AGENT_TOOL_DEFINITIONS.map((definition) => [definition.id, definition]));

export function getAgentToolDefinition(tool: AgentToolId): AgentToolDefinition | undefined {
  return definitionById.get(tool);
}

export function getAgentStateForPrompt(state: AgentStateSnapshot) {
  return {
    hasDocument: state.hasDocument,
    fileName: state.fileName,
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    activeTool: state.activeTool,
    viewMode: state.viewMode,
    runtime: state.hasDesktopBridge ? "desktop" : "browser",
  };
}

export function getAgentFunctionDeclarations() {
  return [
    {
      name: "execute_opdf_tool",
      description: "Execute one Opdf app tool directly through the internal command layer. If the result asks for input or confirmation, ask the user and call again with the missing args or confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: AGENT_TOOL_DEFINITIONS.map((definition) => definition.id),
            description: "The Opdf tool or app action to run.",
          },
          args: {
            type: "object",
            description: "Tool-specific arguments. Check tool definitions for requiredArgs and optionalArgs.",
            additionalProperties: true,
          },
          confirmed: {
            type: "boolean",
            description: "Set true only after the user confirms a destructive command.",
          },
        },
        required: ["tool"],
      },
    },
  ];
}

export async function executeAgentCommand(command: AgentCommand, context: AgentActionContext): Promise<AgentCommandResult> {
  const definition = getAgentToolDefinition(command.tool);
  if (!definition) {
    return { status: "unavailable", tool: command.tool, message: `Unknown tool: ${command.tool}` };
  }

  if (definition.requiresDocument && !context.state.hasDocument) {
    return { status: "input_required", tool: command.tool, message: "A document must be opened first.", missingArgs: ["file"] };
  }

  const args = command.args ?? {};
  const missingArgs = (definition.requiredArgs ?? []).filter((arg) => args[arg] === undefined || args[arg] === null || args[arg] === "");
  if (missingArgs.length > 0) {
    return { status: "input_required", tool: command.tool, message: `Missing required option(s): ${missingArgs.join(", ")}`, missingArgs };
  }

  if (definition.risk === "destructive" && !command.confirmed) {
    return {
      status: "confirmation_required",
      tool: command.tool,
      message: `${definition.title} needs user confirmation before running.`,
      confirmationPrompt: buildConfirmationPrompt(definition, args),
    };
  }

  try {
    await runAgentAction(definition, args, context);
    return { status: "completed", tool: command.tool, message: `${definition.title} completed.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.actions.setViewerError?.(message);
    return { status: "failed", tool: command.tool, message };
  }
}

function buildConfirmationPrompt(definition: AgentToolDefinition, args: Record<string, unknown>) {
  if (definition.id === "delete-pages") return `Delete page(s) ${String(args.pages)} from the current PDF?`;
  if (definition.id === "close-document") return "Close the current document? Unsaved edits may be lost.";
  if (definition.id === "encrypt") return "Encrypt the current PDF with the provided password?";
  if (definition.id === "decrypt") return "Decrypt the current PDF with the provided password?";
  if (definition.id === "crop-current") return "Crop the current page and rewrite its page box?";
  return `Run ${definition.title}?`;
}

async function runAgentAction(definition: AgentToolDefinition, args: Record<string, unknown>, context: AgentActionContext) {
  const { actions, state } = context;
  switch (definition.id) {
    case "open-file": return actions.openFile?.();
    case "close-document": return actions.closeDocument?.();
    case "export-pdf":
    case "save-pdf": return actions.exportPdf?.();
    case "compress-pdf": return actions.compressDocument?.();
    case "run-ocr": return actions.runOcr?.();
    case "convert-to-images": return actions.convertToImages?.();
    case "go-prev-page": return actions.goPrevPage?.();
    case "go-next-page": return actions.goNextPage?.();
    case "go-to-page": {
      const page = clampPage(Number(args.page), state.totalPages);
      return actions.setPage?.(page);
    }
    case "zoom-in": return actions.zoomIn?.();
    case "zoom-out": return actions.zoomOut?.();
    case "reset-zoom": return actions.resetZoom?.();
    case "set-view-mode": return actions.setViewMode?.(normalizeViewMode(args.mode));
    case "rotate-view-left": return actions.rotateLeft?.();
    case "rotate-view-right": return actions.rotateRight?.();
    case "undo-annotations": return actions.undoAnnotations?.();
    case "redo-annotations": return actions.redoAnnotations?.();
    case "select-tool": return actions.setActiveTool?.("select");
    case "highlight-tool": return actions.setActiveTool?.("highlight");
    case "note-tool": return actions.setActiveTool?.("note");
    case "shape-tool": return actions.setActiveTool?.("shape");
    case "redact-tool": return actions.setActiveTool?.("redact");
    case "signature-tool": return actions.setActiveTool?.("signature");
    case "open-tools-dashboard":
      actions.setActiveDashboardTool?.(null);
      return actions.setShowDashboard?.(true);
    case "open-tool-panel": return openPanel(String(args.toolId), actions);
    default:
      if (definition.markupTool) {
        return actions.runConfiguredMarkupTool?.(definition.markupTool, normalizeMarkupOptions(args));
      }
      if (definition.documentTool) {
        if (actions.runConfiguredDocumentTool) {
          return actions.runConfiguredDocumentTool(definition.documentTool, normalizeDocumentToolOptions(args));
        }
        return actions.runDocumentTool?.(definition.documentTool);
      }
      if (definition.id === "watermark-pdf") {
        return actions.runConfiguredWatermark?.(normalizeWatermarkOptions(args));
      }
      if (definition.panelTool) {
        return openPanel(definition.panelTool, actions);
      }
  }
}

function normalizeDocumentToolOptions(args: Record<string, unknown>): DocumentToolOptions {
  return {
    pages: Array.isArray(args.pages) ? args.pages.map(Number).filter(Number.isFinite) : typeof args.pages === "string" ? args.pages : undefined,
    marginPercent: numberOption(args.marginPercent),
    password: typeof args.password === "string" ? args.password : undefined,
    targetPage: numberOption(args.targetPage),
    position: args.position === "after" ? "after" : args.position === "before" ? "before" : undefined,
  };
}

function normalizeWatermarkOptions(args: Record<string, unknown>): WatermarkOptions {
  return {
    text: String(args.text ?? ""),
    fontSize: numberOption(args.fontSize),
    color: typeof args.color === "string" ? args.color : typeof args.fontColor === "string" ? args.fontColor : undefined,
    opacity: numberOption(args.opacity),
    rotation: numberOption(args.rotation),
  };
}

function openPanel(toolId: string, actions: AgentActionContext["actions"]) {
  actions.setShowDashboard?.(false);
  actions.setActiveDashboardTool?.(toolId);
}

function clampPage(rawPage: number, totalPages: number) {
  if (!Number.isFinite(rawPage)) return 1;
  return Math.max(1, Math.min(Math.trunc(rawPage), Math.max(1, totalPages)));
}

function normalizeViewMode(mode: unknown): ViewMode {
  return mode === "page" ? "page" : "continuous";
}

function normalizeMarkupOptions(args: Record<string, unknown>): MarkupOptions {
  return {
    text: typeof args.text === "string" ? args.text : undefined,
    prefix: typeof args.prefix === "string" ? args.prefix : undefined,
    suffix: typeof args.suffix === "string" ? args.suffix : undefined,
    align: args.align === "left" || args.align === "right" || args.align === "center" ? args.align : undefined,
    position: normalizePosition(args.position),
    startNumber: numberOption(args.startNumber),
    digits: numberOption(args.digits),
    fontSize: numberOption(args.fontSize),
    fontColor: typeof args.fontColor === "string" ? args.fontColor : typeof args.color === "string" ? args.color : undefined,
    pageStart: numberOption(args.pageStart),
    pageEnd: numberOption(args.pageEnd),
  };
}

function normalizePosition(value: unknown): MarkupOptions["position"] | undefined {
  const allowed = new Set(["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]);
  return typeof value === "string" && allowed.has(value) ? value as MarkupOptions["position"] : undefined;
}

function numberOption(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

export function createAgentCommandQueue(
  handler: (command: AgentCommand) => Promise<AgentCommandResult>
) {
  let tail = Promise.resolve();
  return {
    enqueue(command: AgentCommand): Promise<AgentCommandResult> {
      const run = tail.then(() => handler(command));
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}
