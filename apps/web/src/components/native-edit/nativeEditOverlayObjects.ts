import type { PdfContentObject } from "@opdf/core";

// SVG hit targets are unnecessary for every CAD hairline. Keep full PDF
// inspection and sidebar editing; cap only the expensive interactive DOM.
export const NATIVE_EDIT_OVERLAY_LIMIT = 500;

export function getNativeEditOverlayObjects(
  objects: PdfContentObject[],
  selectedId: string | null,
): PdfContentObject[] {
  if (objects.length <= NATIVE_EDIT_OVERLAY_LIMIT) return objects;

  const primary: PdfContentObject[] = [];
  let selected: PdfContentObject | undefined;
  for (const object of objects) {
    if (object.id === selectedId) selected = object;
    if (
      primary.length < NATIVE_EDIT_OVERLAY_LIMIT &&
      (object.kind === "text" || object.kind === "image" || object.kind === "form")
    ) primary.push(object);
  }

  // A CAD path chosen from the sidebar must remain selectable and movable,
  // even when dense vector paths are hidden from the SVG overlay.
  if (selected && !primary.some((object) => object.id === selected?.id)) {
    if (primary.length === NATIVE_EDIT_OVERLAY_LIMIT) primary.pop();
    primary.push(selected);
  }
  return primary;
}
