import type { PdfContentObject } from "@opdf/core";

// Keep the DOM bounded on complex CAD plans while preserving hit targets
// across the entire sheet, not simply the first 500 objects in PDF order.
export const NATIVE_EDIT_OVERLAY_LIMIT = 500;
const GRID_SIZE = 8;

function hitScore(object: PdfContentObject): number {
  const bounds = object.bounds;
  const relativeWidth = Math.max(0, bounds.width) / Math.max(1, object.pageWidth);
  const relativeHeight = Math.max(0, bounds.height) / Math.max(1, object.pageHeight);
  if (!Number.isFinite(relativeWidth) || !Number.isFinite(relativeHeight)) return 0;
  const area = Math.sqrt(Math.min(0.25, relativeWidth) * Math.min(0.25, relativeHeight));
  // Give direct-edit text precedence over images/forms with equal footprint.
  return area * (object.kind === "text" && (object.depth ?? 0) <= 1 ? 1.5 : 1);
}

function sheetCell(object: PdfContentObject): number {
  const { x, y, width, height } = object.bounds;
  const normalizedX = (x + width / 2) / Math.max(1, object.pageWidth);
  const normalizedY = (y + height / 2) / Math.max(1, object.pageHeight);
  const column = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(normalizedX * GRID_SIZE)));
  const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(normalizedY * GRID_SIZE)));
  return row * GRID_SIZE + column;
}

export function getNativeEditOverlayObjects(
  objects: PdfContentObject[],
  selectedId: string | null,
): PdfContentObject[] {
  if (objects.length <= NATIVE_EDIT_OVERLAY_LIMIT) return objects;

  const selected = objects.find((object) => object.id === selectedId);
  const candidates = objects
    .map((object, index) => ({ object, index, score: hitScore(object) }))
    .filter(({ object }) => object.kind === "text" || object.kind === "image" || object.kind === "form");

  // Dense drawing exporters may list hundreds of tiny glyph fragments
  // before a single usable room label. Prefer larger, editable hit regions.
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = new Map<string, number>();
  const cells = new Set<number>();
  for (const item of candidates) {
    const cell = sheetCell(item.object);
    if (cells.has(cell)) continue;
    cells.add(cell);
    chosen.set(item.object.id, item.index);
    if (cells.size === GRID_SIZE * GRID_SIZE) break;
  }
  for (const item of candidates) {
    if (chosen.size >= NATIVE_EDIT_OVERLAY_LIMIT) break;
    chosen.set(item.object.id, item.index);
  }
  if (selected && !chosen.has(selected.id)) {
    if (chosen.size >= NATIVE_EDIT_OVERLAY_LIMIT) {
      const last = [...chosen.keys()].at(-1);
      if (last) chosen.delete(last);
    }
    chosen.set(selected.id, objects.indexOf(selected));
  }
  // Preserve original PDF stacking order for overlapping polygons.
  return [...chosen.values()].sort((a, b) => a - b).map((index) => objects[index]);
}
