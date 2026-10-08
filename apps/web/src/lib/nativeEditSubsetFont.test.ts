import { describe, expect, it } from "vitest";
import { needsSubsetFontFallback } from "./nativeEditSubsetFont";

describe("subset font replacement glyph support", () => {
  it("promotes numeric-only subset text before inserting Latin letters", () => {
    expect(needsSubsetFontFallback("ABCDEF+CAD-NumberFont", "12345", "KITCHEN A1")).toBe(true);
  });
  it("handles a new ASCII character even when the original text contains some letters", () => {
    expect(needsSubsetFontFallback("ABCDEF+CAD-Title", "ROOM", "STUDY")).toBe(true);
  });
  it("preserves existing subset font when all characters are already represented", () => {
    expect(needsSubsetFontFallback("ABCDEF+CAD", "12345", "54321")).toBe(false);
  });
  it("does not replace a full embedded or standard font needlessly", () => {
    expect(needsSubsetFontFallback("Helvetica", "123", "ABC")).toBe(false);
    expect(needsSubsetFontFallback(undefined, "123", "ABC")).toBe(false);
  });
});
