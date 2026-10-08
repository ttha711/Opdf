import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { pdfiumContentEditingEngine } from "./pdfiumContentEngine";
import { parseContentObjectId } from "./pdfiumObjectTree";

export function withUnicodeGlyphFallback(patches: PdfContentPatch[]): PdfContentPatch[] {
  const unicodeStyled = new Set(patches.flatMap((patch) =>
    patch.type === "style-text" && patch.fontFamily === "__opdf_unicode__"
      ? [patch.objectId]
      : [],
  ));
  return patches.flatMap((patch) => {
    if (patch.type !== "replace-text" || unicodeStyled.has(patch.objectId)) return [patch];
    return [
      { type: "style-text", objectId: patch.objectId, fontFamily: "__opdf_unicode__" } as PdfContentPatch,
      patch,
    ];
  });
}

export function editedTextPages(patches: PdfContentPatch[]): number[] {
  return Array.from(new Set(patches.filter((patch) =>
    patch.type === "replace-text",
  ).map((patch) => parseContentObjectId(patch.objectId).pageIndex)));
}

async function inspectReplacements(
  bytes: Uint8Array,
  patches: PdfContentPatch[],
  panelPageIndex: number,
) {
  const editedPages = editedTextPages(patches);
  const pages = new Map<number, PdfContentObject[]>();
  for (const page of new Set([...editedPages, panelPageIndex])) {
    pages.set(page, await pdfiumContentEditingEngine.inspectPage(bytes, page));
  }
  const missing = patches.some((patch) => patch.type === "replace-text" &&
    !pages.get(parseContentObjectId(patch.objectId).pageIndex)?.some((item) =>
      item.kind === "text" && item.text === patch.text));
  // A direct inline edit might be on another page than the right-side panel.
  // Return that edited page's objects so the visible update is not rejected.
  return { missing, next: pages.get(editedPages[0] ?? panelPageIndex) ?? [] };
}

export async function applyVerifiedNativePatches(
  bytes: Uint8Array,
  patches: PdfContentPatch[],
  panelPageIndex: number,
) {
  let edited = await pdfiumContentEditingEngine.applyPatches(bytes, patches);
  let { missing, next } = await inspectReplacements(edited, patches, panelPageIndex);
  if (!missing) return { edited, next };
  const fallback = withUnicodeGlyphFallback(patches);
  if (fallback.length === patches.length) {
    throw new Error("PDF did not retain the new text, even with Unicode fallback.");
  }
  edited = await pdfiumContentEditingEngine.applyPatches(bytes, fallback);
  ({ missing, next } = await inspectReplacements(edited, patches, panelPageIndex));
  if (missing) throw new Error("Unable to preserve edited CAD text, including Unicode fallback.");
  return { edited, next };
}
