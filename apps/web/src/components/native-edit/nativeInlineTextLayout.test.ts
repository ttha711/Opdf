import { describe, expect, it } from "vitest";
import type { PdfContentObject } from "@opdf/core";
import { geometryForObject } from "../../lib/nativeEditGeometry";
import { nativeInlineTextLayout } from "./nativeInlineTextLayout";

function textObject(overrides: Partial<PdfContentObject> = {}): PdfContentObject {
  return {
    id: "p0-o0", pageIndex: 0, kind: "text",
    pageWidth: 600, pageHeight: 800,
    bounds: { x: 12, y: 10, width: 120, height: 280 },
    matrix: [1, 0, 0, 1, 0, 0],
    fontSize: 118,
    ...overrides,
  };
}

describe("native inline text popover", () => {
  it("does not inherit an oversized CAD font or bounding rectangle", () => {
    const object = textObject();
    const result = nativeInlineTextLayout(object, geometryForObject(object), 600, 800, "43\n20");
    expect(result.fontSize).toBe(20);
    expect(result.width).toBeLessThan(65);
    expect(result.height).toBeLessThanOrEqual(144);
    expect(result.height).toBeLessThan(80);
  });

  it("fits a two-digit CAD label without a fixed 180px minimum", () => {
    const object = textObject({
      text: "43",
      fontSize: 7,
      bounds: { x: 80, y: 200, width: 13, height: 8 },
    });
    const result = nativeInlineTextLayout(object, geometryForObject(object), 600, 800, "43");
    expect(result.width).toBeLessThanOrEqual(40);
    expect(result.height).toBeLessThanOrEqual(32);
    expect(result.fontSize).toBe(11);
  });

  it("grows with typed content and preserves original width while editing", () => {
    const object = textObject({
      text: "A", fontSize: 11, bounds: { x: 12, y: 10, width: 8, height: 12 },
    });
    const short = nativeInlineTextLayout(object, geometryForObject(object), 600, 800, "A");
    const longer = nativeInlineTextLayout(object, geometryForObject(object), 600, 800, "A much longer label");
    expect(short.width).toBeLessThan(45);
    expect(longer.width).toBeGreaterThan(short.width);
  });

  it("stays within the PDF page at high zoom and near edges", () => {
    const object = textObject({
      bounds: { x: 580, y: 780, width: 20, height: 20 },
    });
    const result = nativeInlineTextLayout(object, geometryForObject(object), 1200, 1600, "Edit text");
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.left + result.width).toBeLessThanOrEqual(1192);
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + result.height).toBeLessThanOrEqual(1592);
  });

  it("grows with multiline text without occupying the entire drawing", () => {
    const object = textObject({ fontSize: 12 });
    const short = nativeInlineTextLayout(object, geometryForObject(object), 600, 800, "one");
    const long = nativeInlineTextLayout(object, geometryForObject(object), 600, 800, "one\ntwo\nthree");
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.height).toBeLessThanOrEqual(144);
  });
});
