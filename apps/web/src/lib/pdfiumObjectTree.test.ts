import { describe, expect, it } from "vitest";
import {
  multiplyMatrices,
  parseContentObjectId,
  quadBounds,
  transformQuad,
} from "./pdfiumObjectTree";

describe("pdfium object tree helpers", () => {
  it("parses deeply nested Form XObject ids", () => {
    expect(parseContentObjectId("p2-o7-f1-f3")).toEqual({
      pageIndex: 2,
      rootObjectIndex: 7,
      formChildIndices: [1, 3],
    });
  });

  it("composes parent Form transforms", () => {
    expect(multiplyMatrices(
      [1, 0, 0, 1, 100, 50],
      [2, 0, 0, 2, 10, 20],
    )).toEqual([2, 0, 0, 2, 110, 70]);
  });

  it("transforms rotated quads into page coordinates", () => {
    const quad = transformQuad([1, 0, 0, 1, 100, 50], [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(quadBounds(quad)).toEqual({ x: 100, y: 50, width: 20, height: 10 });
  });
});
