import { useState, useRef, useMemo } from "react";
import { getDocumentToolLabel } from "../lib/documentEditingExperience";
import { toast } from "./ToastProvider";

interface IntegratedUploadWorkspaceProps {
  activeToolId: string;
  onFileSelected: (file: File) => void;
}

export function IntegratedUploadWorkspace({
  activeToolId,
  onFileSelected,
}: IntegratedUploadWorkspaceProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic file requirements based on tool
  const fileSpec = useMemo(() => {
    const isToPdf = activeToolId.endsWith("-to-pdf");
    if (isToPdf) {
      if (activeToolId === "image-to-pdf") {
        return { accept: "image/png, image/jpeg, image/jpg", label: "Image files (PNG, JPG)", ext: ["png", "jpg", "jpeg"] };
      } else if (activeToolId === "txt-to-pdf") {
        return { accept: ".txt", label: "Plain Text files (TXT)", ext: ["txt"] };
      } else if (activeToolId === "word-to-pdf") {
        return { accept: ".docx, .doc", label: "Word documents (DOCX, DOC)", ext: ["docx", "doc"] };
      } else if (activeToolId === "excel-to-pdf") {
        return { accept: ".xlsx, .xls", label: "Excel spreadsheets (XLSX, XLS)", ext: ["xlsx", "xls"] };
      } else if (activeToolId === "ppt-to-pdf") {
        return { accept: ".pptx, .ppt", label: "PowerPoint slides (PPTX, PPT)", ext: ["pptx", "ppt"] };
      } else if (activeToolId === "rtf-to-pdf") {
        return { accept: ".rtf", label: "Rich Text files (RTF)", ext: ["rtf"] };
      }
    }
    return { accept: "application/pdf", label: "PDF Documents (PDF)", ext: ["pdf"] };
  }, [activeToolId]);

  // Visual header setup
  const headerText = useMemo(() => {
    switch (activeToolId) {
      case "pdf-to-word": return getDocumentToolLabel("pdf-to-word");
      case "pdf-to-excel": return getDocumentToolLabel("pdf-to-excel");
      case "pdf-to-ppt": return getDocumentToolLabel("pdf-to-ppt");
      case "pdf-to-png": return "Convert PDF to high-fidelity PNG";
      case "pdf-to-jpeg": return "Convert PDF to high-fidelity JPEG";
      case "pdf-to-txt": return getDocumentToolLabel("pdf-to-txt");
      case "pdf-to-html": return getDocumentToolLabel("pdf-to-html");
      case "pdf-to-xml": return getDocumentToolLabel("pdf-to-xml");
      case "pdf-to-rtf": return getDocumentToolLabel("pdf-to-rtf");
      case "word-to-pdf": return "Reconstruct Word doc into PDF";
      case "excel-to-pdf": return "Reconstruct Excel sheet into PDF";
      case "ppt-to-pdf": return "Reconstruct PPT slide into PDF";
      case "image-to-pdf": return "Convert Image into PDF Canvas";
      case "rtf-to-pdf": return "Convert Rich Text into PDF";
      case "txt-to-pdf": return "Wrap Plain Text into PDF page";
      case "compress-pdf": return "Compress & Optimize PDF filesize";
      case "split-pdf": return "Split PDF into multiple indexes";
      case "merge-pdf": return "Merge multiple PDFs into a book";
      case "watermark-pdf": return "Stamp Watermark on PDF document";
      case "fill-form": return "Form Field Interactive Filler";
      default: return "Integrated Acrobat Power Tool Workspace";
    }
  }, [activeToolId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (fileSpec.ext.includes(ext) || fileSpec.accept === "*/*") {
        onFileSelected(file);
      } else {
        toast.error(`Định dạng không hợp lệ: Vui lòng chọn tệp ${fileSpec.label} hợp lệ cho thao tác này.`);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const triggerPicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-workspace flex-1 flex flex-col justify-center items-center p-8 bg-[var(--bg-app)] select-none">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept={fileSpec.accept}
        className="hidden"
      />

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerPicker}
        className={`w-full max-w-[480px] h-[340px] flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 transform ${
          isDragActive
            ? "border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)] scale-[1.02] shadow-lg"
            : "border-[var(--border-color)] bg-[var(--bg-toolbar)] hover:border-gray-400 hover:shadow-md"
        }`}
      >
        {/* Animated conversion vector representation */}
        <div className="relative mb-6">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner transition-transform duration-300 ${
            isDragActive ? "scale-110 rotate-12" : "group-hover:scale-105"
          }`} style={{ backgroundColor: activeToolId.endsWith("-to-pdf") ? "#fff5f5" : "#e7f1ff" }}>
            {activeToolId.endsWith("-to-pdf") ? "📝" : "📄"}
          </div>
          <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[var(--acrobat-blue)] border-2 border-white flex items-center justify-center text-[11px] text-white font-bold">
            ➔
          </div>
        </div>

        {/* Text descriptions */}
        <h3 className="m-0 text-base font-bold text-center text-[var(--text-primary)]">
          {headerText}
        </h3>
        
        <p className="m-0 mt-3 text-xs text-center leading-normal text-[var(--text-secondary)] px-4">
          Drag & drop your <strong>{fileSpec.label}</strong> here, or click to browse computer local streams.
        </p>

        {/* Premium Select Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerPicker();
          }}
          className="mt-6 px-5 py-2 text-xs font-bold rounded-lg text-white transition-colors cursor-pointer"
          style={{ backgroundColor: "var(--acrobat-blue)" }}
        >
          Select File
        </button>

        {/* Helper footer */}
        <span className="text-[10px] text-[var(--text-secondary)] mt-6 flex items-center gap-1">
          🔒 Offline local buffer conversions. Your data never leaves your browser.
        </span>
      </div>
    </div>
  );
}
