export interface NormalizedSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeSelectionRects(
  rects: DOMRect[],
  containerRect: DOMRect,
  pageWidth: number,
  pageHeight: number
): NormalizedSelectionRect[] {
  return rects
    .map((rect) => {
      const left = clamp(rect.left - containerRect.left, 0, pageWidth);
      const top = clamp(rect.top - containerRect.top, 0, pageHeight);
      const right = clamp(rect.right - containerRect.left, 0, pageWidth);
      const bottom = clamp(rect.bottom - containerRect.top, 0, pageHeight);
      return {
        x: left / pageWidth,
        y: top / pageHeight,
        width: Math.max(0, right - left) / pageWidth,
        height: Math.max(0, bottom - top) / pageHeight,
      };
    })
    .filter((rect) => rect.width > 0.001 && rect.height > 0.001);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
