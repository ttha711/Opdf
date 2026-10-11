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
  // EmbedPDF paints inside a shadow root, with raster images OR tiled layers.
  // The Scroller page wrapper always owns the true page dimensions.
  const candidates: { rect: DOMRect; priority: number }[] = [];
  const collect = (scope: ParentNode) => {
    for (const element of scope.querySelectorAll<HTMLElement>("*")) {
      if (element.shadowRoot) collect(element.shadowRoot);
      const insideSidebar = element.closest(
        "aside, nav, [role='navigation'], [role='toolbar'], [data-sidebar-id]",
      );
      if (insideSidebar) continue;
      const raster = element.matches("canvas, img");
      const pageBox = element instanceof HTMLDivElement &&
        element.style.position === "relative" &&
        element.style.width.endsWith("px") && element.style.height.endsWith("px");
      if (!raster && !pageBox) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 150 || rect.height < 150 ||
          x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      candidates.push({ rect, priority: raster ? 0 : 1 });
    }
  };
  collect(root);
  candidates.sort((a, b) =>
    a.priority - b.priority ||
    a.rect.width * a.rect.height - b.rect.width * b.rect.height);
  const rect = candidates[0]?.rect;
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
  // Never fall back to a matching label elsewhere on the sheet.
  // CAD drawings often repeat the same dimension, e.g. "1200", hundreds of times.
  // The pointer must actually be over the intended object.
  return matched[0]?.object ?? null;
}
