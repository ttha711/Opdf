import type { Dispatch, SetStateAction } from "react";
import type { MenuItemDef } from "../components/MenuDropdown";
import type { ActiveTool, ViewMode } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { BridgeCapabilities } from "../types/opdf";

const DESKTOP_ONLY_TITLE = "Chỉ khả dụng trên bản desktop";

export function useAppMenus({
  hasDocument,
  viewMode,
  setViewMode,
  setActiveTool,
  openFile,
  closeDocument,
  savePdf,
  savePdfAs,
  compressDocument,
  addWatermark,
  mergeDocuments,
  splitDocument,
  convertToImages,
  undoAnnotations,
  redoAnnotations,
  zoomIn,
  zoomOut,
  resetZoom,
  applyZoomPreset,
  rotateLeft,
  rotateRight,
  runOcr,
  setDocumentTool,
  runDocumentTool,
  capabilities,
}: {
  hasDocument: boolean;
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setActiveTool: Dispatch<SetStateAction<ActiveTool>>;
  openFile: () => void;
  closeDocument: () => void;
  savePdf: () => void;
  savePdfAs: () => void;
  compressDocument: () => void;
  addWatermark: () => void;
  mergeDocuments: () => void;
  splitDocument: () => void;
  convertToImages: () => void;
  undoAnnotations: () => void;
  redoAnnotations: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  applyZoomPreset: (preset: "actual" | "fit-width" | "fit-page") => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  runOcr: () => void;
  setDocumentTool: Dispatch<SetStateAction<DocumentTool>>;
  runDocumentTool: (tool?: DocumentTool) => void;
  capabilities?: BridgeCapabilities;
}) {
  // Absent capabilities (desktop bridge) means everything is supported
  const canCompress = capabilities?.compress !== false;
  const canEncrypt = capabilities?.encrypt !== false;
  const canPdfA = capabilities?.pdfA !== false;
  const fileMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Open...", shortcut: "Ctrl+O", onClick: openFile },
    { kind: "action", label: "Close", disabled: !hasDocument, onClick: closeDocument },
    { kind: "separator" },
    { kind: "action", label: "Save", shortcut: "Ctrl+S", disabled: !hasDocument, onClick: savePdf },
    { kind: "action", label: "Save As...", shortcut: "Ctrl+Shift+S", disabled: !hasDocument, onClick: savePdfAs },
    { kind: "separator" },
    { kind: "action", label: "Compress PDF", disabled: !hasDocument || !canCompress, title: !canCompress ? DESKTOP_ONLY_TITLE : undefined, onClick: compressDocument },
    { kind: "action", label: "Add Watermark", disabled: !hasDocument, onClick: addWatermark },
    { kind: "action", label: "Merge PDFs", onClick: mergeDocuments },
    { kind: "action", label: "Split PDF", disabled: !hasDocument, onClick: splitDocument },
    { kind: "action", label: "Convert to Images", disabled: !hasDocument, onClick: convertToImages },
  ];

  const editMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Undo", shortcut: "Ctrl+Z", disabled: !hasDocument, onClick: undoAnnotations },
    { kind: "action", label: "Redo", shortcut: "Ctrl+Y", disabled: !hasDocument, onClick: redoAnnotations },
    { kind: "separator" },
    { kind: "action", label: "Select Tool", onClick: () => setActiveTool("select") },
    { kind: "action", label: "Highlight Text", disabled: !hasDocument, onClick: () => setActiveTool("highlight") },
    { kind: "action", label: "Add Note", disabled: !hasDocument, onClick: () => setActiveTool("note") },
    { kind: "action", label: "Add Shape", disabled: !hasDocument, onClick: () => setActiveTool("shape") },
    { kind: "action", label: "Add Signature", disabled: !hasDocument, onClick: () => setActiveTool("signature") },
    { kind: "action", label: "Redact", disabled: !hasDocument, onClick: () => setActiveTool("redact") },
  ];

  const viewMenuItems: MenuItemDef[] = [
    { kind: "action", label: viewMode === "continuous" ? "Switch to Single Page" : "Switch to Continuous Scroll", disabled: !hasDocument, onClick: () => setViewMode((m) => (m === "continuous" ? "page" : "continuous")) },
    { kind: "separator" },
    { kind: "action", label: "Zoom In", shortcut: "Ctrl++", disabled: !hasDocument, onClick: zoomIn },
    { kind: "action", label: "Zoom Out", shortcut: "Ctrl+-", disabled: !hasDocument, onClick: zoomOut },
    { kind: "action", label: "Actual Size (100%)", disabled: !hasDocument, onClick: resetZoom },
    { kind: "action", label: "Fit Width", disabled: !hasDocument, onClick: () => applyZoomPreset("fit-width") },
    { kind: "action", label: "Fit Page", disabled: !hasDocument, onClick: () => applyZoomPreset("fit-page") },
    { kind: "separator" },
    { kind: "action", label: "Rotate Left", disabled: !hasDocument, onClick: rotateLeft },
    { kind: "action", label: "Rotate Right", disabled: !hasDocument, onClick: rotateRight },
  ];

  const toolsMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Run OCR", disabled: !hasDocument, onClick: runOcr },
    { kind: "separator" },
    { kind: "action", label: "Delete Pages...", disabled: !hasDocument, onClick: () => { runDocumentTool("delete-pages"); } },
    { kind: "action", label: "Insert PDF...", disabled: !hasDocument, onClick: () => { runDocumentTool("insert-pdf"); } },
    { kind: "action", label: "Crop Page...", disabled: !hasDocument, onClick: () => { runDocumentTool("crop-current"); } },
    { kind: "separator" },
    { kind: "action", label: "Add Page Numbers", disabled: !hasDocument, onClick: () => { runDocumentTool("page-numbers"); } },
    { kind: "action", label: "Add Header", disabled: !hasDocument, onClick: () => { runDocumentTool("header"); } },
    { kind: "action", label: "Add Footer", disabled: !hasDocument, onClick: () => { runDocumentTool("footer"); } },
    { kind: "action", label: "Add Bates Numbering", disabled: !hasDocument, onClick: () => { runDocumentTool("bates"); } },
    { kind: "separator" },
    { kind: "action", label: "Encrypt PDF", disabled: !hasDocument || !canEncrypt, title: !canEncrypt ? DESKTOP_ONLY_TITLE : undefined, onClick: () => { runDocumentTool("encrypt"); } },
    { kind: "action", label: "Decrypt PDF", disabled: !hasDocument || !canEncrypt, title: !canEncrypt ? DESKTOP_ONLY_TITLE : undefined, onClick: () => { runDocumentTool("decrypt"); } },
    { kind: "action", label: "Convert to PDF/A", disabled: !hasDocument || !canPdfA, title: !canPdfA ? DESKTOP_ONLY_TITLE : undefined, onClick: () => { runDocumentTool("normalize"); } },
  ];

  return { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems };
}
