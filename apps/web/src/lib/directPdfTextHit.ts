import type { PdfContentObject } from "@opdf/core";
import { geometryForObject } from "./nativeEditGeometry";

export type PageRect = { left: number; top: number; width: number; height: number };

export type DirectTextTarget = {
  pageIndex: number;
  clientX: number;
  clientY: number;
  rect: PageRect;
  selectedText?: string;
};

export function findPageCanvasRect(root: HTMLElement, x: number, y: number): PageRect | null {
  // Identify the painted sheet, not a thumbnail or the toolbar.
  const candidates = [...root.querySelectorAll<HTMLCanvasElement | HTMLImageElement>("canvas, img")]
    .filter((element) => !element.closest("aside, nav, [role='navigation'], [role='toolbar']"))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width >= 150 && rect.height >= 150 &&
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  const rect = candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

export function findDirectTextObject(
  objects: PdfContentObject[],
  request: DirectTextTarget,
): PdfContentObject | null {
  const { rect, clientX, clientY } = request;
  if (rect.width <= 0 || rect.height <= 0) return null;
  const needle = request.selectedText?.trim();
  const hits = objects.filter((object) =>
    object.kind === "text" && (object.depth ?? 0) <= 1 && Boolean(object.text),
  ).map((object) => {
    const p = {
      x: (clientX - rect.left) * object.pageWidth / rect.width,
      y: (1 - (clientY - rect.top) / rect.height) * object.pageHeight,
    };
    const geometry = geometryForObject(object);
    const dx = p.x - geometry.center.x, dy = p.y - geometry.center.y;
    const u = Math.abs(dx * geometry.u.x + dy * geometry.u.y);
    const v = Math.abs(dx * geometry.v.x + dy * geometry.v.y);
    const missX = Math.max(0, u - geometry.width / 2) * rect.width / object.pageWidth;
    const missY = Math.max(0, v - geometry.height / 2) * rect.height / object.pageHeight;
    const distance = Math.hypot(missX, missY);
    const selectedMatch = Boolean(needle && object.text?.includes(needle));
    return { object, distance, selectedMatch, area: geometry.width * geometry.height };
  });
  const matched = hits.filter((hit) => hit.distance <= (hit.selectedMatch ? 24 : 9));
  matched.sort((a, b) =>
    (Number(b.selectedMatch) - Number(a.selectedMatch)) ||
    a.distance - b.distance || a.area - b.area);
  // A selected DOM text fragment can identify text where the PDF canvas has
  // no matching raster geometry, but never guess among duplicate labels.
  if (matched[0]) return matched[0].object;
  if (needle) {
    const exact = hits.filter((hit) => hit.selectedMatch);
    if (exact.length === 1) return exact[0].object;
  }
  return null;
}
