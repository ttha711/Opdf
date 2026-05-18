export function getDocumentToolName(activeToolId: string): string {
  switch (activeToolId) {
    case "pdf-to-word": return "Export PDF to Word";
    case "pdf-to-excel": return "Export PDF to Excel";
    case "pdf-to-ppt": return "Export PDF to PowerPoint";
    case "pdf-to-png": return "Export PDF to PNG Image";
    case "pdf-to-jpeg": return "Export PDF to JPEG Image";
    case "pdf-to-txt": return "Export PDF to Plain Text";
    case "pdf-to-html": return "Export PDF to HTML Web";
    case "pdf-to-xml": return "Export PDF to XML Code";
    case "pdf-to-rtf": return "Export PDF to Rich Text";
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
    default: return "Document Power Tool";
  }
}
