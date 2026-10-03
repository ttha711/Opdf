export interface PdfViewerProps {
  data: Uint8Array | null;
  sourceBlob?: Blob | null;
  sourceIdentity?: string;
  page: number;
  scale: number;
  activeTool?: string;
  onDocumentLoaded?: (pages: number) => void;
  onError?: (message: string | null) => void;
  onActivePageChange?: (page: number) => void;
  onViewerDirty?: () => void;
  onViewerScaleChange?: (scale: number) => void;
  onPatchApplied?: () => void;
}
