import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";

export function AdaptivePdfViewer(props: PdfViewerProps) {
  if (props.activeTool === "edit-content") {
    return <NativeEditPdfViewer {...props} />;
  }

  // Keep one viewer engine for both local and persisted server PDFs. PdfViewer
  // already consumes server:// sources through the range-capable document URL,
  // so a second PDF.js preview only adds a handoff where the page can appear
  // before the EmbedPDF toolbar and editing plugins are ready.
  return <PdfViewer {...props} />;
}
