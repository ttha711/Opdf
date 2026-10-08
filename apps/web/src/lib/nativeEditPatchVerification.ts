import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { pdfiumContentEditingEngine } from "./pdfiumContentEngine";

export function withUnicodeGlyphFallback(patches: PdfContentPatch[]): PdfContentPatch[] {
  const unicodeStyled = new Set(patches.flatMap((patch) =>
    patch.type === "style-text" && patch.fontFamily === "__opdf_unicode__"
      ? [patch.objectId]
      : [],
  ));
  return patches.flatMap((patch) => {
    if (patch.type !== "replace-text" || unicodeStyled.has(patch.objectId)) return [patch];
    // Apply font before replacing text; PDFium may silently retain the old
    // glyphs when the original embedded CAD font has incomplete mappings.
    return [
      { type: "style-text", objectId: patch.objectId, fontFamily: "__opdf_unicode__" } as PdfContentPatch,
      patch,
    ];
  });
}

function replacementMissing(objects: PdfContentObject[], patches: PdfContentPatch[]): boolean {
  return patches.some((patch) => patch.type === "replace-text" &&
    !objects.some((item) => item.kind === "text" && item.text === patch.text));
}

export async function applyVerifiedNativePatches(
  bytes: Uint8Array,
  patches: PdfContentPatch[],
  pageIndex: number,
) {
  let edited = await pdfiumContentEditingEngine.applyPatches(bytes, patches);
  let next = await pdfiumContentEditingEngine.inspectPage(edited, pageIndex);
  if (!replacementMissing(next, patches)) return { edited, next };
  const fallback = withUnicodeGlyphFallback(patches);
  if (fallback.length === patches.length) {
    throw new Error("PDF did not retain the new text, even with Unicode fallback.");
  }
  // Retry only after a verified glyph mismatch, using the original bytes:
  // never stack a second edit on top of a potentially corrupted first result.
  edited = await pdfiumContentEditingEngine.applyPatches(bytes, fallback);
  next = await pdfiumContentEditingEngine.inspectPage(edited, pageIndex);
  if (replacementMissing(next, patches)) {
    throw new Error("Unable to preserve edited CAD text, including Unicode fallback.");
  }
  return { edited, next };
}
