import type { MenuItemDef } from "./MenuDropdown";
import type { DocumentTool } from "../lib/document-tools";
import type { BridgeCapabilities } from "../types/opdf";

type CompactToolsArgs = {
  hasDocument: boolean;
  hasDesktopBridge: boolean;
  capabilities?: BridgeCapabilities;
  showDashboard: boolean;
  setShowDashboard: (value: boolean) => void;
  setActiveTool: (tool: any) => void;
  runOcr: () => void;
  compressDocument: () => void;
  addWatermark: () => void;
  splitDocument: () => void;
  mergeDocuments: () => void;
  convertToImages: () => void;
  compareRevisions: () => void;
  searchRedact: () => void;
  advancedPdf: () => void;
  digitalSign: () => void;
  runDocumentTool: (tool?: DocumentTool) => void;
  openDocumentMarkupTool: (tool: "page-numbers" | "header" | "footer" | "bates") => void;
};

export function buildCompactToolsMenuItems(args: CompactToolsArgs): MenuItemDef[] {
  const {
    hasDocument,
    hasDesktopBridge,
    capabilities,
    showDashboard,
    setShowDashboard,
    setActiveTool,
    runOcr,
    compressDocument,
    addWatermark,
    splitDocument,
    mergeDocuments,
    convertToImages,
    compareRevisions,
    searchRedact,
    advancedPdf,
    digitalSign,
    runDocumentTool,
    openDocumentMarkupTool,
  } = args;

  return [
    {
      kind: "action",
      label: showDashboard ? "Back to Document" : "All Tools...",
      onClick: () => setShowDashboard(!showDashboard),
    },
    { kind: "separator" },
    { kind: "section", label: "Pages" },
    { kind: "action", label: "Insert PDF...", disabled: !hasDocument, onClick: () => runDocumentTool("insert-pdf") },
    { kind: "action", label: "Split PDF...", disabled: !hasDocument, onClick: splitDocument },
    { kind: "action", label: "Merge PDFs...", onClick: mergeDocuments },
    { kind: "section", label: "Document" },
    { kind: "action", label: "Run OCR", disabled: !hasDocument, onClick: runOcr },
    { kind: "action", label: "Page Numbers...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("page-numbers") },
    { kind: "action", label: "Header...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("header") },
    { kind: "action", label: "Footer...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("footer") },
    { kind: "action", label: "Bates Numbering...", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("bates") },
    { kind: "action", label: "Watermark...", disabled: !hasDocument, onClick: addWatermark },
    { kind: "section", label: "Convert" },
    { kind: "action", label: "Compress PDF", disabled: !hasDocument, onClick: compressDocument },
    { kind: "action", label: "Convert to Images", disabled: !hasDocument, onClick: convertToImages },
    { kind: "section", label: "Edit PDF" },
    { kind: "action", label: "Edit PDF Content", disabled: !hasDocument, onClick: () => setActiveTool("edit-content") },
    { kind: "section", label: "Review & Security" },
    { kind: "action", label: "Measure Drawing", disabled: !hasDocument, onClick: () => setActiveTool("measure") },
    { kind: "action", label: "Compare Revisions...", disabled: !hasDocument, onClick: compareRevisions },
    { kind: "action", label: "Search & Secure Redact...", disabled: !hasDocument, onClick: searchRedact },
    {
      kind: "action",
      label: "Digital Sign...",
      disabled: !hasDocument || !hasDesktopBridge || capabilities?.digitalSignature === false,
      title: !hasDesktopBridge ? "Available in the Desktop App only" : undefined,
      onClick: digitalSign,
    },
    { kind: "section", label: "Advanced" },
    { kind: "action", label: "Advanced PDF...", disabled: !hasDocument, onClick: advancedPdf },
  ];
}

export function buildGlobalMenuItems({
  fileMenuItems,
  editMenuItems,
  viewMenuItems,
  toolsMenuItems,
  aiEdit,
}: {
  fileMenuItems: MenuItemDef[];
  editMenuItems: MenuItemDef[];
  viewMenuItems: MenuItemDef[];
  toolsMenuItems: MenuItemDef[];
  aiEdit: () => void;
}): MenuItemDef[] {
  return [
    { kind: "section", label: "File" },
    ...fileMenuItems,
    { kind: "separator" },
    { kind: "section", label: "Edit" },
    ...editMenuItems,
    { kind: "separator" },
    { kind: "section", label: "View" },
    ...viewMenuItems,
    { kind: "separator" },
    { kind: "section", label: "Tools" },
    ...toolsMenuItems,
    { kind: "separator" },
    { kind: "section", label: "AI" },
    { kind: "action", label: "AI Edit", onClick: aiEdit },
  ];
}
