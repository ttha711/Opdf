import type { ActiveTool, ViewMode } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { DocumentToolOptions, MarkupOptions, MarkupTool, WatermarkOptions } from "../hooks/useDocumentActions";
import type { AgentActionContext, AgentCommand, AgentCommandResult, AgentToolDefinition } from "./types";
import { getAgentToolDefinition } from "./definitions";

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
    case "open-file": {
      const filePath = typeof args.filePath === "string" ? args.filePath : undefined;
      if (filePath && actions.openFileWithPath) {
        return actions.openFileWithPath(filePath);
      }
      return actions.openFile?.();
    }
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
    case "zoom-in": {
      const zoomVal = args.zoom ?? args.scale;
      let scale: number | undefined;
      if (typeof zoomVal === "number") {
        scale = zoomVal;
      } else if (typeof zoomVal === "string") {
        const parsed = parseFloat(zoomVal);
        if (!isNaN(parsed)) {
          scale = zoomVal.includes("%") ? parsed / 100 : parsed;
        }
      }
      return actions.zoomIn?.(scale);
    }
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
