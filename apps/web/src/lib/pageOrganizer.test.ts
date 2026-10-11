import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { createMockBridge } from "../hooks/opdf-bridge/mockBridge";
import { applyPagePlan, moveSelectedPages, validatePagePlan } from "./pageOrganizer";

async function fixture() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([400, 500]);
  doc.addPage([500, 600]);
  return new Uint8Array(await doc.save());
}

describe("Page Organizer draft", () => {
  it("moves grouped pages before the target in their original order", () => {
    expect(moveSelectedPages([1,2,3,4,5], [2,3], 5)).toEqual([1,4,2,3,5]);
    expect(moveSelectedPages([1,2,3], [2], 2)).toEqual([1,2,3]);
    expect(moveSelectedPages([1,2,3], [2], null)).toEqual([1,3,2]);
  });

  it("rejects missing, duplicated, invalid and all-removed page plans", () => {
    expect(() => validatePagePlan({order:[1,1,3],removed:[],rotations:{}},3)).toThrow();
    expect(() => validatePagePlan({order:[1,2,3],removed:[1,2,3],rotations:{}},3)).toThrow();
    expect(() => validatePagePlan({order:[1,2,3],removed:[],rotations:{2:42}},3)).toThrow();
  });

  it("applies page ordering, deletion and rotation with existing OPDF bridge", async () => {
    const bridge = createMockBridge();
    const bytes = await fixture();
    const result = await applyPagePlan(bytes, {
      reorderPages: bridge.reorderPages!,
      deletePages: bridge.deletePages,
      rotatePages: bridge.rotatePages,
    }, {order:[3,1,2],removed:[1],rotations:{3:90}});
    expect(result.pageCount).toBe(2);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({width:500,height:600});
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getSize()).toEqual({width:400,height:500});
  });

  it("does not rewrite untouched documents", async () => {
    const bytes = await fixture();
    const bridge = { reorderPages: vi.fn(), deletePages: vi.fn(), rotatePages: vi.fn() };
    const result = await applyPagePlan(bytes, bridge, {order:[1,2,3],removed:[],rotations:{}});
    expect(result.bytes).toBe(bytes);
    expect(bridge.reorderPages).not.toHaveBeenCalled();
    expect(bridge.deletePages).not.toHaveBeenCalled();
    expect(bridge.rotatePages).not.toHaveBeenCalled();
  });

  it("does not require reordering capability when only rotating", async () => {
    const bytes = await fixture();
    const bridge = createMockBridge();
    const result = await applyPagePlan(bytes, {
      deletePages: bridge.deletePages,
      rotatePages: bridge.rotatePages,
    }, {order:[1,2,3],removed:[],rotations:{2:-90}});
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPage(1).getRotation().angle).toBe(270);
  });
});
