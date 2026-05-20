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
    openFileWithPath?: (filePath: string) => void | Promise<void>;
    closeDocument?: () => void | Promise<void>;
    exportPdf?: () => void | Promise<void>;
    compressDocument?: () => void | Promise<void>;
    runOcr?: () => void | Promise<void>;
    convertToImages?: () => void | Promise<void>;
    goPrevPage?: () => void;
    goNextPage?: () => void;
    zoomIn?: (scale?: number) => void;
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
