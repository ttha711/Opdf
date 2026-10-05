export type PdfContentObjectKind = "text" | "image" | "path";

export type PdfRect = { x: number; y: number; width: number; height: number };
export type PdfMatrix = [number, number, number, number, number, number];

export type PdfPathCommand =
  | { type: "move"; x: number; y: number }
  | { type: "line"; x: number; y: number; close?: boolean }
  | { type: "bezier"; x1: number; y1: number; x2: number; y2: number; x: number; y: number; close?: boolean };

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
  strokeWidth?: number;
  pathCommands?: PdfPathCommand[];
};

export type PdfContentPatch =
  | { type: "replace-text"; objectId: string; text: string }
  | { type: "transform"; objectId: string; matrix: PdfMatrix }
  | { type: "resize"; objectId: string; bounds: PdfRect }
  | { type: "delete"; objectId: string }
  | { type: "duplicate"; objectId: string; offsetX?: number; offsetY?: number }
  | { type: "style-text"; objectId: string; fontFamily?: string; fontSize?: number; fillColor?: string }
  | { type: "style-object"; objectId: string; fillColor?: string; strokeColor?: string; strokeWidth?: number }
  | { type: "replace-path"; objectId: string; commands: PdfPathCommand[] }
  | { type: "relative-transform"; objectId: string; matrix: PdfMatrix }
  | { type: "replace-image"; objectId: string; bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" }
  | { type: "crop-image"; objectId: string; left: number; top: number; right: number; bottom: number };

export interface PdfContentEditingEngine {
  inspectPage(pdf: Uint8Array, pageIndex: number): Promise<PdfContentObject[]>;
  applyPatches(pdf: Uint8Array, patches: PdfContentPatch[]): Promise<Uint8Array>;
}
