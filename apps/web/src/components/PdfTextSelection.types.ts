import type { RenderedTextItem } from "./PdfViewer.types";

export type TextSelectionAction = "copy" | "highlight" | "underline" | "strike" | "translate" | "redact" | "edit-text" | "ai-rewrite";

export interface PdfTextLayerProps {
  pageNumber: number;
  width: number;
  height: number;
  textItems: RenderedTextItem[];
  selectionEnabled: boolean;
  onAction: (pageNumber: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
  createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void>;
  annotations?: any[];
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  imageUrl?: string;
}

export interface SelectionMenuState {
  text: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  x: number;
  y: number;
  anchor: "selection" | "cursor";
}

export interface GroupedLine {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  items: RenderedTextItem[];
}

export interface GroupedParagraph {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  lines: GroupedLine[];
}
