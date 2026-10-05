export type PdfContentObjectKind = "text" | "image" | "path" | "shading" | "form";

export type PdfRect = { x: number; y: number; width: number; height: number };
export type PdfMatrix = [number, number, number, number, number, number];

export type PdfPathCommand =
  | { type: "move"; x: number; y: number }
  | { type: "line"; x: number; y: number; close?: boolean }
  | { type: "bezier"; x1: number; y1: number; x2: number; y2: number; x: number; y: number; close?: boolean };

export type PdfTextRenderMode =
  | "fill"
  | "stroke"
  | "fill-stroke"
  | "invisible"
  | "fill-clip"
  | "stroke-clip"
  | "fill-stroke-clip"
  | "clip";

export type PdfLineCap = "butt" | "round" | "square";
export type PdfLineJoin = "miter" | "round" | "bevel";
export type PdfPathFillMode = "none" | "alternate" | "winding";

export type PdfBlendMode =
  | "Normal"
  | "Multiply"
  | "Screen"
  | "Overlay"
  | "Darken"
  | "Lighten"
  | "ColorDodge"
  | "ColorBurn"
  | "HardLight"
  | "SoftLight"
  | "Difference"
  | "Exclusion"
  | "Hue"
  | "Saturation"
  | "Color"
  | "Luminosity";

export type PdfImageInfo = {
  width: number;
  height: number;
  horizontalDpi: number;
  verticalDpi: number;
  bitsPerPixel: number;
  colorSpace: number;
  colorSpaceName: string;
  markedContentId?: number;
  filters: string[];
};

export type PdfContentObject = {
  id: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  kind: PdfContentObjectKind;
  bounds: PdfRect;
  matrix: PdfMatrix;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fillColor?: string;
  opacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  textRenderMode?: PdfTextRenderMode;
  lineCap?: PdfLineCap;
  lineJoin?: PdfLineJoin;
  dashArray?: number[];
  dashPhase?: number;
  pathFillMode?: PdfPathFillMode;
  pathStroke?: boolean;
  imageInfo?: PdfImageInfo;
  formChildCount?: number;
  hasTransparency?: boolean;
  markedContentId?: number;
};

export type PdfContentPatch =
  | {
      type: "add-text";
      pageIndex: number;
      text: string;
      x: number;
      y: number;
      fontSize: number;
      fillColor?: string;
      fontFamily?: string;
      renderMode?: PdfTextRenderMode;
    }
  | {
      type: "add-rect";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
      fillMode?: PdfPathFillMode;
      stroke?: boolean;
    }
  | {
      type: "add-image";
      pageIndex: number;
      bytes: Uint8Array;
      mimeType: "image/png" | "image/jpeg";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { type: "replace-text"; objectId: string; text: string }
  | { type: "transform"; objectId: string; matrix: PdfMatrix }
  | { type: "resize"; objectId: string; bounds: PdfRect }
  | { type: "delete"; objectId: string }
  | { type: "duplicate"; objectId: string; offsetX?: number; offsetY?: number }
  | {
      type: "style-text";
      objectId: string;
      fontFamily?: string;
      fontSize?: number;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWidth?: number;
      renderMode?: PdfTextRenderMode;
    }
  | {
      type: "style-object";
      objectId: string;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWidth?: number;
      lineCap?: PdfLineCap;
      lineJoin?: PdfLineJoin;
      dashArray?: number[];
      dashPhase?: number;
      pathFillMode?: PdfPathFillMode;
      pathStroke?: boolean;
      blendMode?: PdfBlendMode;
    }
  | { type: "replace-path"; objectId: string; commands: PdfPathCommand[] }
  | { type: "relative-transform"; objectId: string; matrix: PdfMatrix }
  | { type: "replace-image"; objectId: string; bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" }
  | { type: "crop-image"; objectId: string; left: number; top: number; right: number; bottom: number };

export interface PdfContentEditingEngine {
  inspectPage(pdf: Uint8Array, pageIndex: number): Promise<PdfContentObject[]>;
  applyPatches(pdf: Uint8Array, patches: PdfContentPatch[]): Promise<Uint8Array>;
}
