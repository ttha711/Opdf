import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { ProgressiveServerPdfViewer } from "./ProgressiveServerPdfViewer";

export function AdaptivePdfViewer(props: PdfViewerProps) {
  if (props.activeTool === "edit-content") {
    return <NativeEditPdfViewer {...props} />;
  }

  const isPersistedServerPdf =
    Boolean(props.sourceIdentity?.startsWith("server://")) &&
    !props.data &&
    !props.sourceBlob;

  if (isPersistedServerPdf) {
    return <ProgressiveServerPdfViewer {...props} />;
  }

  return <PdfViewer {...props} />;
}
