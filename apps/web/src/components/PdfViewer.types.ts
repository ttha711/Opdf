import type { Dispatch, SetStateAction } from "react";

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
  annotationToolDefaults?: import("../lib/app-types").AnnotationToolDefaults;
  onPageToolAction?: (page: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
  shapeMode?: boolean;
  redactMode?: boolean;
  measureMode?: boolean;
  onDocumentLoaded?: (pages: number) => void;
  onSearchResult?: (found: boolean, message: string) => void;
  onError?: (message: string | null) => void;
  onActivePageChange?: (page: number) => void;
  onThumbsLoaded?: (thumbs: Array<{ page: number; url: string; blob: Blob }>) => void;
  setThumbnails: Dispatch<SetStateAction<Array<{ page: number; url: string; blob: Blob }>>>;
  initialThumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
  /** Called when an ai-patch image overlay is placed, so the viewer parent can switch tool */
  onPatchApplied?: () => void;
  selectedPages?: Set<number>;
  onPageSelectionClick?: (pageNum: number, ctrl: boolean, shift: boolean) => void;
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
  fontName?: string;
}

export interface PageDimension {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  rotation: number;
}
