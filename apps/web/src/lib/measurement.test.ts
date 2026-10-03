import { describe, expect, it } from "vitest";
import {
  calibrateMmPerPdfPoint,
  formatCanvasMeasurement,
  formatPathMeasurement,
  polygonCanvasArea,
  polylineCanvasDistance,
  presetMmPerPdfPoint,
  toMillimeters,
} from "./measurement";

describe("technical drawing measurement", () => {
  it("converts a 1:100 PDF-space distance to real millimeters", () => {
    const mmPerPoint = presetMmPerPdfPoint(100);
    expect(formatCanvasMeasurement(72, 1, mmPerPoint, "m")).toBe("2.540 m");
  });

  it("calibrates from a known real-world dimension", () => {
    const calibrated = calibrateMmPerPdfPoint(144, 5000);
    expect(calibrated).not.toBeNull();
    expect(formatCanvasMeasurement(72, 1, calibrated!, "m")).toBe("2.500 m");
  });

  it("supports common engineering units", () => {
    expect(toMillimeters(2.5, "m")).toBe(2500);
    expect(toMillimeters(25, "cm")).toBe(250);
    expect(toMillimeters(250, "mm")).toBe(250);
  });

  it("calculates perimeter and polygon area", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
    expect(polylineCanvasDistance(points)).toBe(70);
    expect(polygonCanvasArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(100);
    expect(formatPathMeasurement(points, 1, 1, "mm", "perimeter")).toBe("70.0 mm");
  });
});
