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
// deliberately a compact, upright popover. CAD fonts may exceed 100 PDF points.
export function nativeInlineTextLayout(
  object: PdfContentObject,
  geometry: NativeObjectGeometry,
  pageWidth: number,
  pageHeight: number,
  value: string,
): InlineTextLayout {
  const center = pdfPointToDom(
    geometry.center, object.pageWidth, object.pageHeight, pageWidth, pageHeight,
  );
  const fontSize = clamp(
    (object.fontSize ?? 16) * pageWidth / Math.max(1, object.pageWidth),
    14, 20,
  );
  const availableWidth = Math.max(40, pageWidth - 16);
  const availableHeight = Math.max(32, pageHeight - 16);
  const width = Math.min(availableWidth, clamp(180 + Math.min(value.length, 40) * 2, 180, 260));
  const columns = Math.max(1, Math.floor((width - 22) / (fontSize * 0.58)));
  const rows = value.split(/\r?\n/).reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0,
  );
  const height = Math.min(availableHeight, clamp(rows * fontSize * 1.35 + 18, 46, 144));
  return {
    left: clamp(center.x - width / 2, 8, Math.max(8, pageWidth - width - 8)),
    top: clamp(center.y - height - 12, 8, Math.max(8, pageHeight - height - 8)),
    width,
    height,
    fontSize,
  };
}
