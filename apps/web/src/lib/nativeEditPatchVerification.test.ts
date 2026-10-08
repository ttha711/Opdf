import { describe, expect, it } from "vitest";
import type { PdfContentPatch } from "@opdf/core";
import { withUnicodeGlyphFallback } from "./nativeEditPatchVerification";

describe("native CAD text fallback", () => {
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
      { type: "replace-text", objectId: "one", text: "TẦNG 1" },
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
