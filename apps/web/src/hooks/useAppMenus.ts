import type { Dispatch, SetStateAction } from "react";
import type { MenuItemDef } from "../components/MenuDropdown";
import type { ActiveTool, ViewMode } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";

export function useAppMenus({
  hasDocument,
  viewMode,
  setViewMode,
  setActiveTool,
  openFile,
  closeDocument,
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
}: {
  hasDocument: boolean;
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setActiveTool: Dispatch<SetStateAction<ActiveTool>>;
  openFile: () => void;
  closeDocument: () => void;
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
  runDocumentTool: () => void;
}) {
  const fileMenuItems: MenuItemDef[] = [
    { kind: "action", label: "Open...", shortcut: "Ctrl+O", onClick: openFile },
    { kind: "action", label: "Close", disabled: !hasDocument, onClick: closeDocument },
    { kind: "separator" },
    { kind: "action", label: "Save / Export PDF", shortcut: "Ctrl+S", disabled: !hasDocument, onClick: exportPdf },
    { kind: "separator" },
    { kind: "action", label: "Compress PDF", disabled: !hasDocument, onClick: compressDocument },
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
    { kind: "action", label: "Delete Pages...", disabled: !hasDocument, onClick: () => { setDocumentTool("delete-pages"); runDocumentTool(); } },
    { kind: "action", label: "Insert PDF...", disabled: !hasDocument, onClick: () => { setDocumentTool("insert-pdf"); runDocumentTool(); } },
    { kind: "action", label: "Crop Page...", disabled: !hasDocument, onClick: () => { setDocumentTool("crop-current"); runDocumentTool(); } },
    { kind: "separator" },
    { kind: "action", label: "Add Page Numbers", disabled: !hasDocument, onClick: () => { setDocumentTool("page-numbers"); runDocumentTool(); } },
    { kind: "action", label: "Add Header", disabled: !hasDocument, onClick: () => { setDocumentTool("header"); runDocumentTool(); } },
    { kind: "action", label: "Add Footer", disabled: !hasDocument, onClick: () => { setDocumentTool("footer"); runDocumentTool(); } },
    { kind: "action", label: "Add Bates Numbering", disabled: !hasDocument, onClick: () => { setDocumentTool("bates"); runDocumentTool(); } },
    { kind: "separator" },
    { kind: "action", label: "Encrypt PDF", disabled: !hasDocument, onClick: () => { setDocumentTool("encrypt"); runDocumentTool(); } },
    { kind: "action", label: "Decrypt PDF", disabled: !hasDocument, onClick: () => { setDocumentTool("decrypt"); runDocumentTool(); } },
    { kind: "action", label: "Convert to PDF/A", disabled: !hasDocument, onClick: () => { setDocumentTool("normalize"); runDocumentTool(); } },
  ];

  return { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems };
}
