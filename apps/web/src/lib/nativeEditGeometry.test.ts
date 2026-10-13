import { describe, expect, it } from "vitest";
import type { PdfContentObject } from "@tpdf/core";
import {
  geometryForObject,
  handlePdfPoint,
  pdfPointFromClient,
  pdfPointToDom,
  resizeMatrix,
  rotationMatrix,
  transformGeometry,
  translationMatrix,
} from "./nativeEditGeometry";

const object: PdfContentObject = {
  id: "p0-o0",
  pageIndex: 0,
  pageWidth: 600,
  pageHeight: 800,
  kind: "image",
  bounds: { x: 100, y: 200, width: 120, height: 80 },
  matrix: [1, 0, 0, 1, 0, 0],
};

describe("native edit geometry", () => {
  it("builds an oriented box from PDF bounds", () => {
    const geometry = geometryForObject(object);
    expect(geometry.center).toEqual({ x: 160, y: 240 });
    expect(geometry.width).toBeCloseTo(120);
    expect(geometry.height).toBeCloseTo(80);
  });

  it("moves the box without resizing it", () => {
    const geometry = geometryForObject(object);
    const moved = transformGeometry(geometry, translationMatrix(15, -10));
    expect(moved.center).toEqual({ x: 175, y: 230 });
    expect(moved.width).toBeCloseTo(120);
    expect(moved.height).toBeCloseTo(80);
  });

  it("resizes from the east handle around the west anchor", () => {
    const geometry = geometryForObject(object);
    const east = handlePdfPoint(geometry, "e");
    const matrix = resizeMatrix(geometry, "e", { x: east.x + 60, y: east.y });
    const resized = transformGeometry(geometry, matrix);
    expect(resized.width).toBeCloseTo(180);
    expect(resized.center.x).toBeCloseTo(190);
    expect(resized.corners[0].x).toBeCloseTo(100);
  });

  it("rotates around the object center", () => {
    const geometry = geometryForObject(object);
    const rotated = transformGeometry(geometry, rotationMatrix(geometry.center, Math.PI / 2));
    expect(rotated.center.x).toBeCloseTo(160);
    expect(rotated.center.y).toBeCloseTo(240);
    expect(rotated.u.x).toBeCloseTo(0);
    expect(rotated.u.y).toBeCloseTo(1);
  });

  it("maps PDF coordinates when the page box has a non-zero origin", () => {
    const origin = { x: -1000, y: -500 };
    const pageCenter = { x: 0, y: 0 };
    const dom = pdfPointToDom(pageCenter, 2000, 1000, 400, 200, origin);
    expect(dom).toEqual({ x: 200, y: 100 });
    expect(pdfPointFromClient(200, 100, {
      left: 0, top: 0, width: 400, height: 200,
    } as DOMRect, 2000, 1000, origin)).toEqual(pageCenter);
  });
});
