export type PdfContentObjectKind = "text" | "image" | "path";

export type PdfRect = { x: number; y: number; width: number; height: number };
export type PdfMatrix = [number, number, number, number, number, number];

export type PdfContentObject = {
  id: string;
  pageIndex: number;
  kind: PdfContentObjectKind;
  bounds: PdfRect;
  matrix: PdfMatrix;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fillColor?: string;
  opacity?: number;
};

export type PdfContentPatch =
  | { type: "replace-text"; objectId: string; text: string }
  | { type: "transform"; objectId: string; matrix: PdfMatrix }
  | { type: "resize"; objectId: string; bounds: PdfRect }
  | { type: "delete"; objectId: string }
  | { type: "style-text"; objectId: string; fontFamily?: string; fontSize?: number; fillColor?: string }
  | { type: "style-object"; objectId: string; fillColor?: string; strokeColor?: string; strokeWidth?: number }
  | { type: "relative-transform"; objectId: string; matrix: PdfMatrix }
  | { type: "replace-image"; objectId: string; bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" };

export interface PdfContentEditingEngine {
  inspectPage(pdf: Uint8Array, pageIndex: number): Promise<PdfContentObject[]>;
  applyPatches(pdf: Uint8Array, patches: PdfContentPatch[]): Promise<Uint8Array>;
}
