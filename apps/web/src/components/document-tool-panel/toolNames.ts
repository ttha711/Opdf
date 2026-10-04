import { getDocumentToolLabel } from "../../lib/documentEditingExperience";

export function getDocumentToolName(activeToolId: string): string {
  switch (activeToolId) {
    case "pdf-to-word": return getDocumentToolLabel("pdf-to-word");
    case "pdf-to-excel": return getDocumentToolLabel("pdf-to-excel");
    case "pdf-to-ppt": return getDocumentToolLabel("pdf-to-ppt");
    case "pdf-to-png": return "Export PDF to PNG Image";
    case "pdf-to-jpeg": return "Export PDF to JPEG Image";
    case "pdf-to-txt": return getDocumentToolLabel("pdf-to-txt");
    case "pdf-to-html": return getDocumentToolLabel("pdf-to-html");
    case "pdf-to-xml": return getDocumentToolLabel("pdf-to-xml");
    case "pdf-to-rtf": return getDocumentToolLabel("pdf-to-rtf");
    case "word-to-pdf": return "Word to PDF Converter";
    case "excel-to-pdf": return "Excel to PDF Converter";
    case "ppt-to-pdf": return "PowerPoint to PDF Converter";
    case "image-to-pdf": return "Image to PDF Converter";
    case "rtf-to-pdf": return "Rich Text to PDF Converter";
    case "txt-to-pdf": return "Plain Text to PDF Converter";
    case "compress-pdf": return "Optimize & Compress PDF";
    case "split-pdf": return "Advanced Split Document";
    case "merge-pdf": return "Advanced Merge Documents";
    case "watermark-pdf": return "Premium Watermark Tool";
    case "fill-form": return "Interactive Form Filler";
    case "rotate-pdf": return "Rotate PDF";
    case "delete-pages": return "Delete PDF Pages";
    case "extract-pages": return "Extract PDF Pages";
    case "crop-pdf": return "Crop PDF";
    case "protect-pdf": return "Protect PDF";
    case "unlock-pdf": return "Unlock PDF";
    default: return "Document Power Tool";
  }
}
