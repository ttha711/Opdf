import { useMemo } from "react";
import type { PdfContentObject } from "@tpdf/core";
import type { NativeObjectGeometry } from "../../lib/nativeEditGeometry";
import { measureNativeInlineText, nativeInlineTextLayout, type InlineTextLayout } from "./nativeInlineTextLayout";

function geometryForLayout(
  object: PdfContentObject,
  layout: InlineTextLayout,
  width: number,
  height: number,
): NativeObjectGeometry {
  const origin = object.pageOrigin ?? { x: 0, y: 0 };
  const fromDom = (x: number, y: number) => ({
    x: x * object.pageWidth / Math.max(1, width) + origin.x,
    y: object.pageHeight - y * object.pageHeight / Math.max(1, height) + origin.y,
  });
  const corners = [
    fromDom(layout.left, layout.top),
    fromDom(layout.left + layout.width, layout.top),
    fromDom(layout.left + layout.width, layout.top + layout.height),
    fromDom(layout.left, layout.top + layout.height),
  ] as NativeObjectGeometry["corners"];
  return {
    center: fromDom(layout.left + layout.width / 2, layout.top + layout.height / 2),
    width: layout.width * object.pageWidth / Math.max(1, width),
    height: layout.height * object.pageHeight / Math.max(1, height),
    u: { x: 1, y: 0 },
    v: { x: 0, y: 1 },
    corners,
  };
}

export function useNativeInlineTextFrame(
  object: PdfContentObject | null,
  geometry: NativeObjectGeometry | null,
  width: number,
  height: number,
  value: string,
  coverSelectedText: boolean,
) {
  const fontFamily = object?.fontFamily || "Arial";
  const layout = useMemo(() => object && geometry
    ? nativeInlineTextLayout(object, geometry, width, height, value,
      (line, size) => measureNativeInlineText(line, size, fontFamily))
    : null,
  [object, geometry, width, height, value, fontFamily, coverSelectedText]);
  const frame = useMemo(() => object && geometry && layout && coverSelectedText
    ? geometryForLayout(object, layout, width, height)
    : geometry,
  [object, geometry, layout, width, height, coverSelectedText]);
  return { layout, geometry: frame };
}
