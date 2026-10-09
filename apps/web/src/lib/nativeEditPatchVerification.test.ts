import { describe, expect, it } from "vitest";
import type { PdfContentPatch } from "@opdf/core";
import { editedTextPages, retainedPdfText, withUnicodeGlyphFallback } from "./nativeEditPatchVerification";

describe("native CAD text fallback", () => {
  it("accepts only PDFium's extra trailing separator after an exact edit", () => {
    const wanted = "OPDF CAD TEST va-floor-finish";
    expect(retainedPdfText(wanted, wanted)).toBe(true);
    expect(retainedPdfText(wanted + " ", wanted)).toBe(true);
    expect(retainedPdfText(wanted + "   ", wanted)).toBe(true);
    expect(retainedPdfText("OPDF CAD TEST va-floor-finis", wanted)).toBe(false);
    expect(retainedPdfText("OPDF CAD TEST va-floor-finishX", wanted)).toBe(false);
    expect(retainedPdfText(wanted, wanted + " ")).toBe(false);
    expect(retainedPdfText(" "+wanted, wanted)).toBe(false);
    expect(retainedPdfText(undefined, wanted)).toBe(false);
  });

  it("validates replacements on their actual PDF pages, not the sidebar page", () => {
    const patches: PdfContentPatch[] = [
      { type: "replace-text", objectId: "p1-o32", text: "KITCHEN" },
      { type: "replace-text", objectId: "p0-o2-f3", text: "OFFICE" },
      { type: "style-text", objectId: "p0-o2-f3", fontSize: 12 },
    ];
    expect(editedTextPages(patches)).toEqual([1, 0]);
  });

  it("adds a Unicode font before replacing missing Latin glyphs", () => {
    const patches: PdfContentPatch[] = [{ type: "replace-text", objectId: "one", text: "KITCHEN" }];
    expect(withUnicodeGlyphFallback(patches)).toEqual([
      { type: "style-text", objectId: "one", fontFamily: "__opdf_unicode__" },
      ...patches,
    ]);
  });
  it("does not duplicate a Unicode style already supplied by the caller", () => {
    const patches: PdfContentPatch[] = [
      { type: "style-text", objectId: "one", fontFamily: "__opdf_unicode__" },
      { type: "replace-text", objectId: "one", text: "LEVEL 1" },
    ];
    expect(withUnicodeGlyphFallback(patches)).toEqual(patches);
  });
  it("does not change ordinary non-text mutations", () => {
    const patches: PdfContentPatch[] = [
      { type: "delete", objectId: "old" },
      { type: "relative-transform", objectId: "two", matrix: [1, 0, 0, 1, 2, 3] },
    ];
    expect(withUnicodeGlyphFallback(patches)).toEqual(patches);
  });
});
