import type { Dispatch, SetStateAction } from "react";
import type { MenuItemDef } from "../components/MenuDropdown";
import type { ActiveTool, ViewMode } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { BridgeCapabilities } from "../types/opdf";

const DESKTOP_ONLY_TITLE = "Available in the Desktop App only";

export function useAppMenus({
  hasDocument,
  viewMode,
  setViewMode,
  setActiveTool,
  openFile,
  closeDocument,
  savePdf,
  savePdfAs,
  exportPdf,
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
  exportPdf: () => void;
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
  const fileMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Open...", icon: "folder-open", shortcut: "Ctrl+O", onClick: openFile },
    { kind: "action", label: "Close", icon: "close", disabled: !hasDocument, onClick: closeDocument },
    { kind: "separator" },
    { kind: "action", label: "Save", icon: "save", shortcut: "Ctrl+S", disabled: !hasDocument, onClick: savePdf },
    { kind: "action", label: "Save As...", icon: "save", shortcut: "Ctrl+Shift+S", disabled: !hasDocument, onClick: savePdfAs },
    { kind: "action", label: "Export PDF...", icon: "export", disabled: !hasDocument, onClick: exportPdf },
    { kind: "separator" },
    { kind: "action", label: "Compress PDF", icon: "compress", disabled: !hasDocument || !canCompress, title: !canCompress ? DESKTOP_ONLY_TITLE : undefined, onClick: compressDocument },
    { kind: "action", label: "Add Watermark", icon: "watermark", disabled: !hasDocument, onClick: addWatermark },
    { kind: "action", label: "Merge PDFs", icon: "merge", onClick: mergeDocuments },
    { kind: "action", label: "Split PDF", icon: "split", disabled: !hasDocument, onClick: splitDocument },
    { kind: "action", label: "Convert to Images", icon: "image", disabled: !hasDocument, onClick: convertToImages },
  ];

  const editMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Undo", icon: "undo", shortcut: "Ctrl+Z", disabled: !hasDocument, onClick: undoAnnotations },
    { kind: "action", label: "Redo", icon: "redo", shortcut: "Ctrl+Y", disabled: !hasDocument, onClick: redoAnnotations },
  ];

  const viewMenuItems: MenuItemDef[] = [
    { kind: "action", label: viewMode === "continuous" ? "Switch to Single Page" : "Switch to Continuous Scroll", disabled: !hasDocument, onClick: () => setViewMode((m) => (m === "continuous" ? "page" : "continuous")) },
    { kind: "separator" },
    { kind: "action", label: "Zoom In", icon: "zoom-in", shortcut: "Ctrl++", disabled: !hasDocument, onClick: zoomIn },
    { kind: "action", label: "Zoom Out", icon: "zoom-out", shortcut: "Ctrl+-", disabled: !hasDocument, onClick: zoomOut },
    { kind: "action", label: "Actual Size (100%)", icon: "view", disabled: !hasDocument, onClick: resetZoom },
    { kind: "action", label: "Fit Width", icon: "fit-width", disabled: !hasDocument, onClick: () => applyZoomPreset("fit-width") },
    { kind: "action", label: "Fit Page", icon: "fit-page", disabled: !hasDocument, onClick: () => applyZoomPreset("fit-page") },
    { kind: "separator" },
    { kind: "action", label: "Rotate Page Left", icon: "rotate-left", disabled: !hasDocument, onClick: rotateLeft },
    { kind: "action", label: "Rotate Page Right", icon: "rotate-right", disabled: !hasDocument, onClick: rotateRight },
    { kind: "action", label: "Rotate All Pages Left", icon: "rotate-left", disabled: !hasDocument, onClick: () => runDocumentTool("rotate-all-left") },
    { kind: "action", label: "Rotate All Pages Right", icon: "rotate-right", disabled: !hasDocument, onClick: () => runDocumentTool("rotate-all-right") },
  ];

  const toolsMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Run OCR", icon: "ocr", disabled: !hasDocument, onClick: runOcr },
    { kind: "separator" },
    { kind: "action", label: "Insert PDF...", icon: "insert", disabled: !hasDocument, onClick: () => { runDocumentTool("insert-pdf"); } },
    { kind: "action", label: "Rotate All Pages Left", disabled: !hasDocument, onClick: () => runDocumentTool("rotate-all-left") },
    { kind: "action", label: "Rotate All Pages Right", disabled: !hasDocument, onClick: () => runDocumentTool("rotate-all-right") },
  ];

  return { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems };
}
