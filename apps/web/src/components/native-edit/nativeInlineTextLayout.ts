import type { PdfContentObject } from "@opdf/core";
import { pdfPointToDom, type NativeObjectGeometry } from "../../lib/nativeEditGeometry";

export type InlineTextLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

// The selection follows the original PDF geometry, but the typing control is
// deliberately fit the glyphs, not the potentially huge CAD bounding box.
export function nativeInlineTextLayout(
  object: PdfContentObject,
  geometry: NativeObjectGeometry,
  pageWidth: number,
  pageHeight: number,
  value: string,
  measureText?: (line: string, fontSize: number) => number,
): InlineTextLayout {
  const center = pdfPointToDom(
    geometry.center, object.pageWidth, object.pageHeight, pageWidth, pageHeight,
  );
  const visualHeight = geometry.height * pageHeight / Math.max(1, object.pageHeight);
  const fontSize = clamp(Math.min(
    (object.fontSize ?? 12) * pageWidth / Math.max(1, object.pageWidth),
    visualHeight * 0.95,
  ), 11, 20);
  const measure = (line: string) => measureText?.(line, fontSize)
    ?? Array.from(line).reduce((sum, char) =>
      sum + fontSize * (/\s/.test(char) ? 0.35 : /[^\x00-\xff]/.test(char) ? 0.95 : 0.57), 0);
  const lines = value.split(/\r?\n/);
  const originalLines = (object.text ?? "").split(/\r?\n/);
  const longest = Math.max(0, ...[...lines, ...originalLines].map(measure));
  const width = Math.min(Math.max(1, pageWidth - 16),
    Math.max(36, Math.min(320, Math.ceil(longest + 20))));
  const rows = lines.reduce((sum, line) =>
    sum + Math.max(1, Math.ceil(measure(line) / Math.max(1, width - 16))), 0);
  const height = Math.min(Math.max(1, pageHeight - 16),
    Math.max(26, Math.min(160, Math.ceil(rows * fontSize * 1.35 + 12))));
  return {
    left: clamp(center.x - width / 2, 8, Math.max(8, pageWidth - width - 8)),
    top: clamp(center.y - height / 2, 8, Math.max(8, pageHeight - height - 8)),
    width,
    height,
    fontSize,
  };
}
