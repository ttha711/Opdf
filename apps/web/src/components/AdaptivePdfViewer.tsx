import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";

export function AdaptivePdfViewer(props: PdfViewerProps) {
  if (props.activeTool === "edit-content") {
    return <NativeEditPdfViewer {...props} />;
  }

  return <PdfViewer {...props} />;
}
