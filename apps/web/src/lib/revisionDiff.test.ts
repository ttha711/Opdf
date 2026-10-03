import { describe, expect, it } from "vitest";
import { detectDiffRegions, estimateTranslation, type RgbaImage } from "./revisionDiff";

function image(width: number, height: number, fill = 255): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function paint(img: RgbaImage, x0: number, y0: number, w: number, h: number, value: number) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * img.width + x) * 4;
      img.data[i] = value;
      img.data[i + 1] = value;
      img.data[i + 2] = value;
    }
  }
}

describe("revision diff engine", () => {
  it("detects a localized changed region", () => {
    const base = image(120, 100);
    const revision = image(120, 100);
    paint(revision, 40, 30, 32, 28, 0);
    const regions = detectDiffRegions(base, revision, 25, { dx: 0, dy: 0, score: 0 }, 12, 2);
    expect(regions.length).toBeGreaterThan(0);
    expect(regions[0].x).toBeLessThan(0.7);
    expect(regions[0].y).toBeLessThan(0.7);
  });

  it("finds a small translation", () => {
    const base = image(100, 80);
    const revision = image(100, 80);
    paint(base, 30, 24, 30, 20, 20);
    paint(revision, 34, 26, 30, 20, 20);
    const alignment = estimateTranslation(base, revision, 8, 4);
    expect(Math.abs(alignment.dx)).toBeLessThanOrEqual(6);
    expect(Math.abs(alignment.dy)).toBeLessThanOrEqual(4);
  });
});
