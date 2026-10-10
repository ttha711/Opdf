// opdf-file-size-allow: legacy tool dashboard; this PR removes duplicated viewer wiring without expanding dashboard responsibilities.
import { useState, useRef } from "react";
import { useOpdfBridge } from "../hooks/useOpdfBridge";
import { toast } from "./ToastProvider";
import { buildPdfTextExport } from "../lib/pdfTextExport";
import { OpdfIcon } from "./OpdfIcon";
import { ALL_TOOLS_CATALOG, type ToolCatalogEntry } from "../lib/allToolsCatalog";

interface AllToolsDashboardProps {
  hasDocument: boolean;
  fileName: string;
  docBytes: Uint8Array | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  onClose: () => void;
  onTriggerCompress: () => void;
  onTriggerMerge: () => void;
  onTriggerSplit: () => void;
  onTriggerFillForm: () => void;
  onTriggerOcr: () => void;
  onTriggerWatermark: () => void;
  onTriggerPageNumbers: () => void;
  onTriggerCompare: () => void;
  onTriggerRedact: () => void;
  onTriggerSign: () => void;
  onSelectTool?: (toolId: string) => void;
  onTriggerAdditionalTool?: (toolId: string) => void;
}

type TabType = "all" | "hot" | "from_pdf" | "to_pdf" | "merge_split" | "edit_review";

interface ToolDef {
  id: string;
  name: string;
  icon: ToolCatalogEntry["icon"];
  color: string;
  bgColor: string;
  borderColor: string;
  action: () => void;
  requiresDocument?: boolean;
  unavailableReason?: string;
}

export function AllToolsDashboard({
  hasDocument,
  fileName,
  docBytes,
  getDocumentBytes,
  onLoadConvertedPdf,
  onClose,
  onTriggerCompress,
  onTriggerMerge,
  onTriggerSplit,
  onTriggerFillForm,
  onTriggerOcr,
  onTriggerWatermark,
  onTriggerPageNumbers,
  onTriggerCompare,
  onTriggerRedact,
  onTriggerSign,
  onSelectTool,
  onTriggerAdditionalTool,
}: AllToolsDashboardProps) {
  const bridge = useOpdfBridge();
  const canCompress = bridge.capabilities?.compress !== false;
  const canEncrypt = bridge.capabilities?.encrypt !== false;
  const canDigitalSign = bridge.capabilities?.digitalSignature !== false;
  const canOfficeToPdf = Boolean(bridge.convertOfficeToPdf);
  const canPdfToOffice = Boolean(bridge.convertPdfOffice);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Hidden file input triggers
  const triggerFileInput = (actionId: string) => {
    setActiveAction(actionId);
    if (fileInputRef.current) {
      if (actionId.endsWith("to-pdf")) {
        if (actionId === "image-to-pdf") {
          fileInputRef.current.accept = "image/png, image/jpeg, image/jpg";
        } else if (actionId === "txt-to-pdf") {
          fileInputRef.current.accept = ".txt";
        } else if (actionId === "word-to-pdf") {
          fileInputRef.current.accept = ".docx, .doc";
        } else if (actionId === "excel-to-pdf") {
          fileInputRef.current.accept = ".xlsx, .xls";
        } else if (actionId === "ppt-to-pdf") {
          fileInputRef.current.accept = ".pptx, .ppt";
        } else if (actionId === "rtf-to-pdf") {
          fileInputRef.current.accept = ".rtf";
        }
      } else {
        // PDF conversions expect a PDF file first if not already open
        fileInputRef.current.accept = "application/pdf";
      }
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeAction) return;

    try {
      // 1. Convert IMAGE to PDF
      if (activeAction === "image-to-pdf") {
        const pdfLib = await import("pdf-lib");
        const doc = await pdfLib.PDFDocument.create();
        const arrayBuffer = await file.arrayBuffer();
        const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
        
        let image;
        if (isPng) {
          image = await doc.embedPng(new Uint8Array(arrayBuffer));
        } else {
          image = await doc.embedJpg(new Uint8Array(arrayBuffer));
        }
        
        const { width, height } = image.scale(1.0);
        const page = doc.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
        const pdfBytes = await doc.save();
        onLoadConvertedPdf(pdfBytes, file.name.replace(/\.[^/.]+$/, "") + ".pdf");
        onClose();
        return;
      }

      // 2. Convert TXT to PDF
      if (activeAction === "txt-to-pdf") {
        const text = await file.text();
        const pdfLib = await import("pdf-lib");
        const doc = await pdfLib.PDFDocument.create();
        const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
        const fontSize = 12;
        const margin = 50;
        const pageWidth = 595.276; // A4 size
        const pageHeight = 841.890;
        const contentWidth = pageWidth - margin * 2;
        const lines: string[] = [];

        // Wrap text
        const rawLines = text.split(/\r?\n/);
        for (const rawLine of rawLines) {
          if (!rawLine.trim()) {
            lines.push("");
            continue;
          }
          let currentLine = "";
          const words = rawLine.split(/\s+/);
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(testLine, fontSize);
            if (textWidth > contentWidth) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const linesPerPage = Math.floor((pageHeight - margin * 2) / (fontSize * 1.5));
        for (let i = 0; i < lines.length; i += linesPerPage) {
          const pageLines = lines.slice(i, i + linesPerPage);
          const page = doc.addPage([pageWidth, pageHeight]);
          let y = pageHeight - margin;
          for (const line of pageLines) {
            page.drawText(line, { x: margin, y, size: fontSize, font });
            y -= fontSize * 1.5;
          }
        }

        const pdfBytes = await doc.save();
        onLoadConvertedPdf(pdfBytes, file.name.replace(/\.[^/.]+$/, "") + ".pdf");
        onClose();
        return;
      }

      toast.error("Open the PDF in OPDF first, then choose the conversion tool.");

    } catch (err) {
      console.error(err);
      toast.error("File processing failed: " + err);
    } finally {
      e.target.value = "";
    }
  };

  // Convert currently loaded or selected PDF to Text
  const convertPdfToTxt = async () => {
    if (hasDocument) {
      const bytes = docBytes ?? await getDocumentBytes();
      if (!bytes) {
        toast.error("Unable to retrieve the open PDF data.");
        return;
      }
      await runPdfToTxt(bytes, fileName);
      onClose();
      return;
    }
    triggerFileInput("pdf-to-txt");
  };

  const downloadExport = (bytes: Uint8Array, type: string, name: string) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The browser consumes blob URLs asynchronously. Revoking them in the
    // same tick can cancel a download after a lazy-loaded tool unmounts.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const runPdfTextExport = async (bytes: Uint8Array, name: string, format: "txt" | "xml") => {
    try {
      const result = await buildPdfTextExport(bytes, name, format);
      downloadExport(result.bytes, result.mimeType, result.fileName);
    } catch (err) {
      toast.error(`Unable to export PDF as ${format.toUpperCase()}: ${err}`);
    }
  };

  const runPdfToTxt = (bytes: Uint8Array, name: string) => runPdfTextExport(bytes, name, "txt");
  const runPdfToXml = (bytes: Uint8Array, name: string) => runPdfTextExport(bytes, name, "xml");

  const convertPdfToXml = async () => {
    if (hasDocument) {
      const bytes = docBytes ?? await getDocumentBytes();
      if (!bytes) {
        toast.error("Unable to retrieve the open PDF data.");
        return;
      }
      await runPdfToXml(bytes, fileName);
      onClose();
      return;
    }
    triggerFileInput("pdf-to-xml");
  };

  // Keep the active PDF viewer mounted for PDFium-backed image export.
  // The dedicated tool panel owns format/zoom/grayscale options.
  const convertPdfToImages = (isPng: boolean) => {
    const toolId = isPng ? "pdf-to-png" : "pdf-to-jpeg";
    if (hasDocument && onSelectTool) {
      onSelectTool(toolId);
      onClose();
      return;
    }
    triggerFileInput(toolId);
  };

  // Tool catalog follows the naming and task grouping users already know
  // from mainstream PDF products. Every item either performs a real action or
  // routes to a real configured panel/modal.
  const toolAction = (id: string) => {
    switch (id) {
      case "pdf-to-txt": return convertPdfToTxt;
      case "pdf-to-xml": return convertPdfToXml;
      case "pdf-to-png": return () => convertPdfToImages(true);
      case "pdf-to-jpeg": return () => convertPdfToImages(false);
      case "image-to-pdf": return () => triggerFileInput(id);
      case "txt-to-pdf": return () => triggerFileInput(id);
      case "print-pdf": return () => onTriggerAdditionalTool?.(id);
      case "compress-pdf": return onTriggerCompress;
      case "merge-pdf": return onTriggerMerge;
      case "split-pdf": return onTriggerSplit;
      case "watermark-pdf": return onTriggerWatermark;
      case "page-numbers": return onTriggerPageNumbers;
      case "ocr-pdf": return onTriggerOcr;
      case "fill-form": return onTriggerFillForm;
      case "redact-pdf": return onTriggerRedact;
      case "compare-pdf": return onTriggerCompare;
      case "sign-pdf": return onTriggerSign;
      case "insert-pdf":
      case "header":
      case "footer":
      case "bates":
      case "normalize":
      case "measure-drawing":
      case "edit-content":
      case "advanced-pdf":
      case "ai-content-editor":
        return () => onTriggerAdditionalTool?.(id);
      default: return () => onSelectTool?.(id);
    }
  };

  // UI and AI share the same canonical catalogue, with runtime availability
  // evaluated per capability instead of hardcoding a separate list of cards.
  const tools: ToolDef[] = ALL_TOOLS_CATALOG.map((item) => {
    const unavailableReason = (() => {
      switch (item.capability) {
        case "pdf-to-office": return canPdfToOffice ? undefined : "PDF to Office requires OPDF Server or Desktop converter.";
        case "office-to-pdf": return canOfficeToPdf ? undefined : "Office conversion requires OPDF Server or Desktop converter.";
        case "compress": return canCompress ? undefined : "Compression requires OPDF Server or Desktop.";
        case "encrypt": return canEncrypt ? undefined : "Password security requires OPDF Server or Desktop.";
        case "digital-signature": return canDigitalSign ? undefined : "Digital signing requires OPDF Desktop or a configured signing service.";
        case "pdf-a": return bridge.capabilities?.pdfA === true ? undefined : "PDF/A conversion is unavailable in this runtime.";
        default: return undefined;
      }
    })();
    return { ...item, action: toolAction(item.id), unavailableReason };
  });

  // Filter tools based on active tab
  const getFilteredTools = () => {
    switch (activeTab) {
      case "hot":
        return tools.filter(t => ["pdf-to-word", "image-to-pdf", "merge-pdf", "split-pdf", "compress-pdf", "fill-form"].includes(t.id));
      case "from_pdf":
        return tools.filter(t => ALL_TOOLS_CATALOG.find(item => item.id === t.id)?.category === "from_pdf");
      case "to_pdf":
        return tools.filter(t => ALL_TOOLS_CATALOG.find(item => item.id === t.id)?.category === "to_pdf");
      case "merge_split":
        return tools.filter(t => ALL_TOOLS_CATALOG.find(item => item.id === t.id)?.category === "merge_split");
      case "edit_review":
        return tools.filter(t => ALL_TOOLS_CATALOG.find(item => item.id === t.id)?.category === "edit_review");
      case "all":
      default:
        return tools;
    }
  };

  return (
    <div className="all-tools-dashboard flex flex-col h-full bg-[var(--bg-toolbar)] text-[var(--text-primary)] transition-colors p-6 overflow-y-auto">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        aria-label="Choose a file for conversion"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header and Close */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-[var(--text-primary)]">
          <span className="text-red-500"><OpdfIcon name="tools" size={20} /></span> Opdf Power Tools Dashboard
        </h2>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-color)] bg-[var(--ui-muted-bg)] hover:bg-[var(--ui-hover-bg)] transition-all cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5"><OpdfIcon name="close" size={14} />Close Tools</span>
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="relative z-10 flex shrink-0 border-b border-[var(--border-color)] mb-8 overflow-x-auto whitespace-nowrap scrollbar-none overscroll-x-contain touch-pan-x">
        {(["hot", "from_pdf", "to_pdf", "merge_split", "edit_review", "all"] as TabType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setActiveTab(tab);
            }}
            className={`shrink-0 px-5 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer capitalize touch-manipulation ${
              activeTab === tab
                ? "border-red-500 text-red-500 bg-red-500/5"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab === "all"
              ? "All Tools"
              : tab === "hot"
              ? "Hot Tools"
              : tab === "from_pdf"
              ? "Convert from PDF"
              : tab === "to_pdf"
              ? "Convert to PDF"
              : tab === "merge_split" ? "Pages & Files" : "Edit & Review"}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {getFilteredTools().map((tool) => (
          <button
            key={tool.id}
            data-opdf-tool-card={tool.id}
            data-opdf-tool-available={tool.unavailableReason ? "false" : "true"}
            disabled={Boolean(tool.unavailableReason)}
            title={tool.unavailableReason}
            onClick={() => {
              if (tool.unavailableReason) {
                toast.info(tool.unavailableReason);
                return;
              }
              if (!hasDocument && tool.requiresDocument) {
                toast.info("Open a PDF first to use this tool.");
                return;
              }
              void tool.action();
            }}
            style={{
              borderColor: tool.borderColor,
            }}
            className="flex flex-col items-center justify-center p-5 rounded-xl border text-center transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer h-32 group disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {/* Tool Icon inside colored circle */}
            <div
              style={{
                backgroundColor: tool.bgColor,
                color: tool.color,
              }}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 shadow-inner group-hover:scale-110 transition-transform duration-200"
            >
              <OpdfIcon name={tool.icon} size={24} />
            </div>

            {/* Tool Name */}
            <span className="text-[13px] font-semibold text-[var(--text-primary)] group-hover:text-red-500 transition-colors">
              {tool.name}
            </span>
            {tool.unavailableReason ? (
              <span className="mt-1 text-[10px] font-medium text-[var(--text-secondary)]">Not available here</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Bottom helper */}
      <div className="mt-12 p-4 rounded-xl bg-[var(--ui-muted-bg)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] flex items-center gap-3">
        <span className="text-lg"><OpdfIcon name="lock" size={20} /></span>
        <span>
          <strong>Processing:</strong> PDF viewing and annotation stay in the browser. Conversions, optimization, or server-backed workflows may send the selected document to the OPDF service configured for this deployment.
        </span>
      </div>
    </div>
  );
}
