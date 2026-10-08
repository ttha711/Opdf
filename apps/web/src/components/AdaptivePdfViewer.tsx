import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";

// Preserve the reader's scroll/zoom DOM on edit entry and exit. Native editing
// remains lazy, so opening a PDF does not initialize its second PDFium view.
export function AdaptivePdfViewer(props: PdfViewerProps) {
  const isEditing = props.activeTool === "edit-content";
  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0"
        style={{ visibility: isEditing ? "hidden" : "visible", pointerEvents: isEditing ? "none" : "auto" }}
        aria-hidden={isEditing}
      >
        <PdfViewer {...props} />
      </div>
      {isEditing ? (
        <div className="absolute inset-0">
          <NativeEditPdfViewer {...props} />
        </div>
      ) : null}
    </div>
  );
}
