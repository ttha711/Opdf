export type ViewMode = "continuous" | "page";

export interface PdfViewerProps {
  transitionTick?: number;
  transitionDirection?: "next" | "prev";
  data: Uint8Array | null;
  page: number;
  scale: number;
  rotation?: number;
  pageRotations?: Record<number, number>;
  viewMode?: ViewMode;
  annotations?: import("@opdf/core").Annotation[];
  highlightMode?: boolean;
  searchText?: string;
  activeTool?: string;
  onPageToolAction?: (page: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
  shapeMode?: boolean;
  redactMode?: boolean;
  measureMode?: boolean;
  onDocumentLoaded?: (pages: number) => void;
  onSearchResult?: (found: boolean, message: string) => void;
  onError?: (message: string | null) => void;
  onActivePageChange?: (page: number) => void;
  onThumbsLoaded?: (thumbs: Array<{ page: number; url: string; blob: Blob }>) => void;
  initialThumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
}

export interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  imageUrl: string;
  textItems: RenderedTextItem[];
}

export interface RenderedTextItem {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  transform: string;
}

export const WINDOW_RADIUS = 2;
export const CONTINUOUS_BATCH_SIZE = 4;
