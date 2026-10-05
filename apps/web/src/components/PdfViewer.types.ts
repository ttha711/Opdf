import type { ActiveTool } from "../lib/app-types";

export interface PdfViewerProps {
  data: Uint8Array | null;
  sourceBlob?: Blob | null;
  sourceIdentity?: string;
  page: number;
  scale: number;
  activeTool?: ActiveTool;
  onActiveToolChange?: (tool: ActiveTool) => void;
  onDocumentLoaded?: (pages: number) => void;
  onError?: (message: string | null) => void;
  onActivePageChange?: (page: number) => void;
  onViewerDirty?: () => void;
  onViewerScaleChange?: (scale: number) => void;
  onPatchApplied?: () => void;
  onViewerReady?: () => void;
  getDocumentBytes?: () => Promise<Uint8Array | null>;
}
