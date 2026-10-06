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
      icon: "tools",
      onClick: () => setShowDashboard(!showDashboard),
    },
    {
      kind: "submenu",
      label: "Pages",
      icon: "page",
      items: [
        { kind: "action", label: "Insert PDF...", icon: "insert", disabled: !hasDocument, onClick: () => runDocumentTool("insert-pdf") },
        { kind: "action", label: "Split PDF...", icon: "split", disabled: !hasDocument, onClick: splitDocument },
        { kind: "action", label: "Merge PDFs...", icon: "merge", onClick: mergeDocuments },
      ],
    },
    {
      kind: "submenu",
      label: "Document",
      icon: "file-pdf",
      items: [
        { kind: "action", label: "Run OCR", icon: "ocr", disabled: !hasDocument, onClick: runOcr },
        { kind: "action", label: "Page Numbers...", icon: "hash", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("page-numbers") },
        { kind: "action", label: "Header...", icon: "header", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("header") },
        { kind: "action", label: "Footer...", icon: "file-text", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("footer") },
        { kind: "action", label: "Bates Numbering...", icon: "bates", disabled: !hasDocument, onClick: () => openDocumentMarkupTool("bates") },
        { kind: "action", label: "Watermark...", icon: "watermark", disabled: !hasDocument, onClick: addWatermark },
      ],
    },
    {
      kind: "submenu",
      label: "Convert & Optimize",
      icon: "export",
      items: [
        { kind: "action", label: "Compress PDF", icon: "compress", disabled: !hasDocument, onClick: compressDocument },
        { kind: "action", label: "Convert to Images", icon: "image", disabled: !hasDocument, onClick: convertToImages },
      ],
    },
    {
      kind: "submenu",
      label: "Edit & Review",
      icon: "edit",
      items: [
        { kind: "action", label: "Edit PDF Content", icon: "edit", disabled: !hasDocument, onClick: () => setActiveTool("edit-content") },
        { kind: "action", label: "Measure Drawing", icon: "measure", disabled: !hasDocument, onClick: () => setActiveTool("measure") },
        { kind: "action", label: "Compare Revisions...", icon: "compare", disabled: !hasDocument, onClick: compareRevisions },
      ],
    },
    {
      kind: "submenu",
      label: "Security",
      icon: "lock",
      items: [
        { kind: "action", label: "Search & Secure Redact...", icon: "redact", disabled: !hasDocument, onClick: searchRedact },
        {
          kind: "action",
          label: "Digital Sign...",
          icon: "signature",
          disabled: !hasDocument || !hasDesktopBridge || capabilities?.digitalSignature === false,
          title: !hasDesktopBridge ? "Available in the Desktop App only" : undefined,
          onClick: digitalSign,
        },
      ],
    },
    {
      kind: "action",
      label: "Advanced PDF...",
      icon: "advanced",
      disabled: !hasDocument,
      onClick: advancedPdf,
    },
  ];
}

function findAction(items: MenuItemDef[], label: string) {
  return items.find((item): item is Extract<MenuItemDef, { kind: "action" }> =>
    item.kind === "action" && item.label === label,
  );
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
  const closeDocument = findAction(fileMenuItems, "Close");
  const save = findAction(fileMenuItems, "Save");
  const saveAs = findAction(fileMenuItems, "Save As...");
  const exportPdf = findAction(fileMenuItems, "Export PDF...");
  const viewMode = viewMenuItems.find((item): item is Extract<MenuItemDef, { kind: "action" }> =>
    item.kind === "action" && item.label.startsWith("Switch to "),
  );
  const zoomItems = [
    findAction(viewMenuItems, "Zoom In"),
    findAction(viewMenuItems, "Zoom Out"),
    findAction(viewMenuItems, "Actual Size (100%)"),
    findAction(viewMenuItems, "Fit Width"),
    findAction(viewMenuItems, "Fit Page"),
  ].filter(Boolean) as MenuItemDef[];
  const rotateItems = [
    findAction(viewMenuItems, "Rotate Page Left"),
    findAction(viewMenuItems, "Rotate Page Right"),
    findAction(viewMenuItems, "Rotate All Pages Left"),
    findAction(viewMenuItems, "Rotate All Pages Right"),
  ].filter(Boolean) as MenuItemDef[];

  return [
    {
      kind: "submenu",
      label: "Document",
      icon: "file-pdf",
      items: [closeDocument, save, saveAs, exportPdf].filter(Boolean) as MenuItemDef[],
    },
    {
      kind: "submenu",
      label: "Edit",
      icon: "edit",
      items: editMenuItems.filter((item) => item.kind !== "separator" && item.kind !== "section"),
    },
    {
      kind: "submenu",
      label: "View",
      icon: "view",
      items: [
        ...(viewMode ? [viewMode] : []),
        {
          kind: "submenu",
          label: "Zoom",
          icon: "zoom-in",
          items: zoomItems,
        },
        {
          kind: "submenu",
          label: "Rotate",
          icon: "rotate-right",
          items: rotateItems,
        },
      ],
    },
    {
      kind: "submenu",
      label: "Tools",
      icon: "tools",
      items: toolsMenuItems,
    },
    {
      kind: "action",
      label: "AI Edit",
      icon: "sparkles",
      onClick: aiEdit,
    },
  ];
}
