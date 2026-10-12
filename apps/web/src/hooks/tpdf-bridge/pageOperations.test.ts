import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createMockBridge } from "./mockBridge";

async function createSizedPages() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([400, 500]);
  doc.addPage([500, 600]);
  return new Uint8Array(await doc.save());
}

describe("browser PDF page operations", () => {
  it("reorders pages without losing pages", async () => {
    const bridge = createMockBridge();
    const source = await createSizedPages();
    const output = await bridge.reorderPages!(source, [3, 1, 2]);
    const loaded = await PDFDocument.load(output);

    expect(loaded.getPageCount()).toBe(3);
    expect(loaded.getPage(0).getSize()).toEqual({ width: 500, height: 600 });
    expect(loaded.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
    expect(loaded.getPage(2).getSize()).toEqual({ width: 400, height: 500 });
  });

  it("rejects an invalid reorder list", async () => {
    const bridge = createMockBridge();
    const source = await createSizedPages();
    await expect(bridge.reorderPages!(source, [1, 1, 2])).rejects.toThrow(/every page exactly once/i);
  });

  it("rotates only the requested page", async () => {
    const bridge = createMockBridge();
    const source = await createSizedPages();
    const output = await bridge.rotatePages(source, [2], 90);
    const loaded = await PDFDocument.load(output);

    expect(loaded.getPage(0).getRotation().angle).toBe(0);
    expect(loaded.getPage(1).getRotation().angle).toBe(90);
    expect(loaded.getPage(2).getRotation().angle).toBe(0);
  });

  it("duplicates selected pages immediately after their originals", async () => {
    const bridge = createMockBridge();
    const source = await createSizedPages();
    const output = await bridge.duplicatePages!(source, [2]);
    const loaded = await PDFDocument.load(output);

    expect(loaded.getPageCount()).toBe(4);
    expect(loaded.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    expect(loaded.getPage(1).getSize()).toEqual({ width: 400, height: 500 });
    expect(loaded.getPage(2).getSize()).toEqual({ width: 400, height: 500 });
    expect(loaded.getPage(3).getSize()).toEqual({ width: 500, height: 600 });
  });

  it("deletes selected pages and keeps the remaining order", async () => {
    const bridge = createMockBridge();
    const source = await createSizedPages();
    const output = await bridge.deletePages(source, [2]);
    const loaded = await PDFDocument.load(output);

    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    expect(loaded.getPage(1).getSize()).toEqual({ width: 500, height: 600 });
  });

  it("crops a page using normalized margins", async () => {
    const bridge = createMockBridge();
    const source = await createSizedPages();
    const output = await bridge.cropPage(source, {
      page: 1,
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
    const loaded = await PDFDocument.load(output);
    const page = loaded.getPage(0);

    expect(page.getWidth()).toBeCloseTo(240, 4);
    expect(page.getHeight()).toBeCloseTo(320, 4);
  });
});
