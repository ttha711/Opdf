import { useState, useRef } from "react";
import { getDocumentToolLabel } from "../lib/documentEditingExperience";
import { useOpdfBridge } from "../hooks/useOpdfBridge";
import { toast } from "./ToastProvider";
import { buildPdfTextExport } from "../lib/pdfTextExport";

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
  onTriggerOrganizePages: () => void;
  onTriggerFillForm: () => void;
  onTriggerOcr: () => void;
  onTriggerWatermark: () => void;
  onTriggerPageNumbers: () => void;
  onTriggerCompare: () => void;
  onTriggerRedact: () => void;
  onTriggerSign: () => void;
  onSelectTool?: (toolId: string) => void;
}

type TabType = "all" | "hot" | "from_pdf" | "to_pdf" | "merge_split";

interface ToolDef {
  id: string;
  name: string;
  icon: string;
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
  onTriggerOrganizePages,
  onTriggerFillForm,
  onTriggerOcr,
  onTriggerWatermark,
  onTriggerPageNumbers,
  onTriggerCompare,
  onTriggerRedact,
  onTriggerSign,
  onSelectTool,
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

      // Office -> PDF conversion is not implemented in the web viewer.
      // Never generate a placeholder PDF and report a fake successful conversion.
      if (activeAction.endsWith("-to-pdf")) {
        toast.error("Office → PDF is not supported in the web viewer. Use a real converter or open the Office Editor.");
        return;
      }

      // 4. PDF to Office / Image Converter (runs if user uploads a PDF from this screen)
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        if (activeAction === "pdf-to-txt") {
          await runPdfToTxt(bytes, file.name);
          onClose();
          return;
        }
        if (activeAction === "pdf-to-xml") {
          await runPdfToXml(bytes, file.name);
          onClose();
          return;
        }

        const targetFormat = getTargetFormat(activeAction);
        if (targetFormat) {
          launchPdfToHtmlEditorWithBytes(bytes, file.name, targetFormat);
          onClose();
          return;
        } else if (activeAction === "pdf-to-png" || activeAction === "pdf-to-jpg") {
          toast.info("To convert PDF to images, open the file in Opdf and use 'To Images' to export rendered pages.");
        } else {
          toast.error("This conversion format does not have a real engine in the web viewer yet.");
        }
      } else {
        toast.error("Please select a valid PDF file for this action.");
      }

    } catch (err) {
      console.error(err);
      toast.error("File processing failed: " + err);
    } finally {
      e.target.value = "";
    }
  };

  const getTargetFormat = (actionId: string): string => {
    switch (actionId) {
      case "pdf-to-ms-office": return "ms-office";
      case "pdf-to-word": return "word";
      case "pdf-to-excel": return "excel";
      case "pdf-to-ppt": return "powerpoint";
      case "pdf-to-rtf": return "rtf";
      case "pdf-to-txt": return "txt";
      case "pdf-to-html": return "html";
      case "pdf-to-xml": return "xml";
      default: return "";
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
    a.click();
    URL.revokeObjectURL(url);
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
  const tools: ToolDef[] = [
    { id: "pdf-to-word", name: "PDF to Word", icon: "W", color: "#1b6ec2", bgColor: "#e7f1ff", borderColor: "#b8d9ff", action: () => onSelectTool?.("pdf-to-word"), requiresDocument: true, unavailableReason: canPdfToOffice ? undefined : "PDF to Word requires OPDF Server or Desktop converter." },
    { id: "pdf-to-excel", name: "PDF to Excel", icon: "X", color: "#198754", bgColor: "#e8f7ee", borderColor: "#b7e4c7", action: () => onSelectTool?.("pdf-to-excel"), requiresDocument: true, unavailableReason: canPdfToOffice ? undefined : "PDF to Excel requires OPDF Server or Desktop converter." },
    { id: "pdf-to-ppt", name: "PDF to PowerPoint", icon: "P", color: "#d9480f", bgColor: "#fff4e6", borderColor: "#ffd8a8", action: () => onSelectTool?.("pdf-to-ppt"), requiresDocument: true, unavailableReason: canPdfToOffice ? undefined : "PDF to PowerPoint requires OPDF Server or Desktop converter." },
    { id: "pdf-to-png", name: "PDF to PNG", icon: "🖼️", color: "#7048e8", bgColor: "#f3f0ff", borderColor: "#d0bfff", action: () => convertPdfToImages(true) },
    { id: "pdf-to-jpeg", name: "PDF to JPEG", icon: "🌄", color: "#862e9c", bgColor: "#f8f0fc", borderColor: "#e5dbff", action: () => convertPdfToImages(false) },
    { id: "pdf-to-txt", name: getDocumentToolLabel("pdf-to-txt"), icon: "📝", color: "#f59f00", bgColor: "#fff9db", borderColor: "#ffe066", action: convertPdfToTxt },
    { id: "pdf-to-xml", name: getDocumentToolLabel("pdf-to-xml"), icon: "👾", color: "#0ca678", bgColor: "#e6fcf5", borderColor: "#96f2d7", action: convertPdfToXml },

    { id: "image-to-pdf", name: "Image to PDF", icon: "🖼️", color: "#7048e8", bgColor: "#f3f0ff", borderColor: "#d0bfff", action: () => triggerFileInput("image-to-pdf") },
    { id: "txt-to-pdf", name: "TXT to PDF", icon: "📝", color: "#f59f00", bgColor: "#fff9db", borderColor: "#ffe066", action: () => triggerFileInput("txt-to-pdf") },
    { id: "word-to-pdf", name: "Word to PDF", icon: "W", color: "#1b6ec2", bgColor: "#e7f1ff", borderColor: "#b8d9ff", action: () => onSelectTool?.("word-to-pdf"), unavailableReason: canOfficeToPdf ? undefined : "Requires OPDF Server with LibreOffice." },
    { id: "excel-to-pdf", name: "Excel to PDF", icon: "X", color: "#198754", bgColor: "#e8f7ee", borderColor: "#b7e4c7", action: () => onSelectTool?.("excel-to-pdf"), unavailableReason: canOfficeToPdf ? undefined : "Requires OPDF Server with LibreOffice." },
    { id: "ppt-to-pdf", name: "PowerPoint to PDF", icon: "P", color: "#d9480f", bgColor: "#fff4e6", borderColor: "#ffd8a8", action: () => onSelectTool?.("ppt-to-pdf"), unavailableReason: canOfficeToPdf ? undefined : "Requires OPDF Server with LibreOffice." },

    { id: "compress-pdf", name: "Compress PDF", icon: "🗜️", color: "#e03131", bgColor: "#fff5f5", borderColor: "#ffc9c9", action: onTriggerCompress, unavailableReason: canCompress ? undefined : "Compression requires OPDF Server or Desktop." },
    { id: "merge-pdf", name: "Merge PDF", icon: "📚", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", action: onTriggerMerge },
    { id: "split-pdf", name: "Split PDF", icon: "✂️", color: "#e03131", bgColor: "#fff5f5", borderColor: "#ffc9c9", action: onTriggerSplit },
    { id: "organize-pages", name: "Organize Pages", icon: "▦", color: "#1971c2", bgColor: "#e7f5ff", borderColor: "#a5d8ff", action: onTriggerOrganizePages, requiresDocument: true },
    { id: "rotate-pdf", name: "Rotate PDF", icon: "↻", color: "#5f3dc4", bgColor: "#f3f0ff", borderColor: "#d0bfff", action: () => onSelectTool?.("rotate-pdf") },
    { id: "delete-pages", name: "Delete Pages", icon: "🗑️", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", action: () => onSelectTool?.("delete-pages") },
    { id: "extract-pages", name: "Extract Pages", icon: "📄", color: "#0b7285", bgColor: "#e3fafc", borderColor: "#99e9f2", action: () => onSelectTool?.("extract-pages") },
    { id: "crop-pdf", name: "Crop PDF", icon: "⌗", color: "#5c7cfa", bgColor: "#edf2ff", borderColor: "#bac8ff", action: () => onSelectTool?.("crop-pdf") },

    { id: "watermark-pdf", name: "Watermark", icon: "💧", color: "#1864ab", bgColor: "#e7f5ff", borderColor: "#a5d8ff", action: onTriggerWatermark, requiresDocument: true },
    { id: "page-numbers", name: "Page Numbers", icon: "#", color: "#495057", bgColor: "#f1f3f5", borderColor: "#ced4da", action: onTriggerPageNumbers, requiresDocument: true },
    { id: "ocr-pdf", name: "OCR PDF", icon: "🔎", color: "#087f5b", bgColor: "#e6fcf5", borderColor: "#96f2d7", action: onTriggerOcr, requiresDocument: true },
    { id: "fill-form", name: "Fill Form", icon: "✍️", color: "#c92a2a", bgColor: "#fff5f5", borderColor: "#ffc9c9", action: onTriggerFillForm, requiresDocument: true },

    { id: "protect-pdf", name: "Protect PDF", icon: "🔒", color: "#9c36b5", bgColor: "#f8f0fc", borderColor: "#e5dbff", action: () => onSelectTool?.("protect-pdf"), unavailableReason: canEncrypt ? undefined : "Password protection requires OPDF Server or Desktop." },
    { id: "unlock-pdf", name: "Unlock PDF", icon: "🔓", color: "#2f9e44", bgColor: "#ebfbee", borderColor: "#b2f2bb", action: () => onSelectTool?.("unlock-pdf"), unavailableReason: canEncrypt ? undefined : "Unlock requires OPDF Server or Desktop." },
    { id: "redact-pdf", name: "Redact PDF", icon: "▰", color: "#212529", bgColor: "#f1f3f5", borderColor: "#ced4da", action: onTriggerRedact, requiresDocument: true },
    { id: "compare-pdf", name: "Compare PDF", icon: "⇄", color: "#364fc7", bgColor: "#edf2ff", borderColor: "#bac8ff", action: onTriggerCompare, requiresDocument: true },
    { id: "sign-pdf", name: "Sign PDF", icon: "✒️", color: "#a61e4d", bgColor: "#fff0f6", borderColor: "#fcc2d7", action: onTriggerSign, requiresDocument: true, unavailableReason: canDigitalSign ? undefined : "Digital signing requires OPDF Desktop." },
  ];

  // Filter tools based on active tab
  const getFilteredTools = () => {
    switch (activeTab) {
      case "hot":
        return tools.filter(t => ["pdf-to-word", "image-to-pdf", "merge-pdf", "split-pdf", "compress-pdf", "fill-form"].includes(t.id));
      case "from_pdf":
        return tools.filter(t => t.id.startsWith("pdf-to"));
      case "to_pdf":
        return tools.filter(t => t.id.endsWith("-to-pdf"));
      case "merge_split":
        return tools.filter(t => ["compress-pdf", "merge-pdf", "split-pdf", "organize-pages", "rotate-pdf", "delete-pages", "extract-pages", "crop-pdf"].includes(t.id));
      case "all":
      default:
        return tools;
    }
  };

  return (
    <div className="all-tools-dashboard flex flex-col h-full bg-[var(--bg-toolbar)] text-[var(--text-primary)] transition-colors select-none p-6 overflow-y-auto">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header and Close */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-[var(--text-primary)]">
          <span className="text-red-500">⚙️</span> Opdf Power Tools Dashboard
        </h2>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-color)] bg-[var(--ui-muted-bg)] hover:bg-[var(--ui-hover-bg)] transition-all cursor-pointer"
        >
          ✕ Close Tools
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-[var(--border-color)] mb-8 overflow-x-auto whitespace-nowrap scrollbar-none">
        {(["hot", "from_pdf", "to_pdf", "merge_split", "all"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer capitalize ${
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
              : "Merge & Split"}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {getFilteredTools().map((tool) => (
          <button
            key={tool.id}
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
              if (hasDocument) {
                void tool.action();
              } else if (onSelectTool) {
                onSelectTool(tool.id);
              } else {
                void tool.action();
              }
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
              {tool.icon}
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
        <span className="text-lg">🔒</span>
        <span>
          <strong>Processing:</strong> PDF viewing and annotation stay in the browser. Conversions, optimization, or server-backed workflows may send the selected document to the OPDF service configured for this deployment.
        </span>
      </div>
    </div>
  );
}
