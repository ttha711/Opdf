import { describe, expect, it } from "vitest";
import type { PdfContentObject } from "@tpdf/core";
import { nativeEditTextRun } from "./nativeEditTextRun";
import { getNativeEditInteractiveObjects, nativeEditTransformPatches } from "./nativeEditInteractiveObjects";
import { nativeEditTextCommitPatches } from "./nativeEditTextCommit";

function text(id: string, value: string, x: number, y = 100, fontSize = 12): PdfContentObject {
  return {
    id,
    pageIndex: 0,
    pageWidth: 600,
    pageHeight: 800,
    kind: "text",
    bounds: { x, y, width: value.length * 6, height: 14 },
    matrix: [1, 0, 0, 1, x, -y],
    text: value,
    fontFamily: "Arial",
    fontSize,
    fillColor: "#000000",
    textRenderMode: "fill",
  };
}

describe("native inline PDF text runs", () => {
  it("combines adjacent same-line objects and preserves word spacing", () => {
    const objects = [
      text("first", "TRUNG TÂM T", 20),
      text("second", "Ổ CHỨC", 90),
      text("third", "HỘI NGHỊ", 132),
      text("next-line", "APEC - NHÀ HÁT", 20, 120),
      text("separate-paragraph", "PROJECT CODE", 20, 145),
      text("different-style", "GHI CHÚ", 200, 100, 8),
    ];
    objects[1].fontFamily = "Subset-Vietnamese";
    objects[2].fontSize = 15;

    const run = nativeEditTextRun(objects, objects[1]);

    expect(run.object.text).toBe("TRUNG TÂM T Ổ CHỨC HỘI NGHỊ\nAPEC - NHÀ HÁT");
    expect(run.object.id).toBe("first");
    expect(run.objectIds).toEqual(["first", "second", "third", "next-line"]);
    expect(run.object.bounds).toEqual({ x: 20, y: 100, width: 160, height: 34 });
  });

  it("keeps isolated objects independent", () => {
    const target = text("label", "APEC", 20);
    const run = nativeEditTextRun([target, text("far", "NOT THIS", 260)], target);

    expect(run.object).toBe(target);
    expect(run.objectIds).toEqual(["label"]);
  });

  it("uses rendered bounds when PDF font size metadata is scaled", () => {
    const first = text("first", "ONE", 20, 100, 1);
    const second = text("second", " TWO", 40, 105, 1);
    second.bounds.height = 8;
    second.matrix[5] = first.matrix[5];
    const nextLine = text("next-line", "NEXT", 20, 120, 1);
    first.bounds.height = 16;

    const run = nativeEditTextRun([first, second, nextLine], first);

    expect(run.object.text).toBe("ONE TWO\nNEXT");
    expect(run.objectIds).toEqual(["first", "second", "next-line"]);
  });

  it("keeps visual reading order when a PDF text matrix points left", () => {
    const first = text("first", "FIRST LINE", 20, 100);
    const second = text("second", "SECOND LINE", 20, 120);
    first.matrix = [-1, 0, 0, -1, 20, -100];
    second.matrix = [-1, 0, 0, -1, 20, -120];

    const run = nativeEditTextRun([first, second], first);

    expect(run.object.text).toBe("FIRST LINE\nSECOND LINE");
  });

  it("reconstructs the split Vietnamese title from PDFium baselines", () => {
    const fragments: Array<[string, string, number, number, number, number, number]> = [
      ["p0-o70", "TRUNG TÂM T", 536.98, 427.14, 122.22, 16.53, -139.2617],
      ["p0-o71", "Ổ ", 660.51, 427.06, 12.41, 16.62, -139.2617],
      ["p0-o72", " CH", 673.63, 430.29, 29.39, 13.39, -139.2617],
      ["p0-o73", "Ứ", 705.69, 427.11, 13.53, 16.57, -139.2617],
      ["p0-o74", "C H", 720.07, 430.29, 28.55, 13.39, -139.2617],
      ["p0-o75", "Ộ", 750.76, 428.91, 12.41, 18.05, -139.2617],
      ["p0-o76", "I NGH", 765.10, 435.00, 47.03, 8.67, -139.4147],
      ["p0-o77", "Ị", 813.07, 430.50, 6, 16.46, -139.2617],
      ["p0-o78", "APEC - NHÀ HÁT ", 536.60, 447.62, 145.79, 16.57, -184.6349],
    ];
    const objects = fragments.map(([id, value, x, y, width, height, baseline]) => ({
      ...text(id, value, x, y, 1),
      bounds: { x, y, width, height },
      matrix: [39.4986, 0, 0, 39.4986, x, baseline] as PdfContentObject["matrix"],
    }));

    const run = nativeEditTextRun(objects, objects[0]);
    const hitRegion = getNativeEditInteractiveObjects(objects).find((item) => item.object.id === "p0-o70");

    expect(run.object.text).toBe("TRUNG TÂM TỔ CHỨC HỘI NGHỊ\nAPEC - NHÀ HÁT");
    expect(run.objectIds).toEqual(fragments.map(([id]) => id));
    expect(hitRegion?.objectIds).toEqual(run.objectIds);
    expect(hitRegion?.object.bounds.height).toBeGreaterThan(objects[0].bounds.height);
  });

  it("groups rotated fragments along their baseline direction", () => {
    const angle = Math.PI / 6;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -direction.y, y: direction.x };
    const makeRotated = (id: string, value: string, offset: number) => {
      const width = value.length * 6;
      const point = (along: number, across: number) => ({
        x: direction.x * along + normal.x * across,
        y: direction.y * along + normal.y * across,
      });
      const quad = [point(offset, 14), point(offset + width, 14), point(offset + width, 0), point(offset, 0)] as const;
      const xs = quad.map((item) => item.x);
      const ys = quad.map((item) => item.y);
      return {
        ...text(id, value, offset, 0),
        bounds: {
          x: Math.min(...xs), y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
        },
        rotatedBounds: [...quad] as PdfContentObject["rotatedBounds"],
        matrix: [direction.x, direction.y, normal.x, normal.y,
          direction.x * offset, direction.y * offset] as PdfContentObject["matrix"],
      };
    };
    const first = makeRotated("first", "ROTATED", 0);
    const second = makeRotated("second", " TEXT", 50);

    const run = nativeEditTextRun([second, first], first);

    expect(run.object.text).toBe("ROTATED TEXT");
    expect(run.objectIds).toEqual(["first", "second"]);
    expect(run.object.rotatedBounds).toHaveLength(4);
  });

  it("uses one stable interactive hit region for the full text run", () => {
    const objects = [text("first", "TRUNG TÂM T", 20), text("second", "Ổ CHỨC", 90), text("third", "HỘI NGHỊ", 132)];
    const interactive = getNativeEditInteractiveObjects(objects);

    expect(interactive).toHaveLength(1);
    expect(interactive[0].object.id).toBe("first");
    expect(interactive[0].object.text).toBe("TRUNG TÂM T Ổ CHỨC HỘI NGHỊ");
    expect(interactive[0].objectIds).toEqual(["first", "second", "third"]);
    expect(nativeEditTransformPatches(interactive[0].objectIds, [1, 0, 0, 1, 8, 0]).map(({ objectId }) => objectId))
      .toEqual(interactive[0].objectIds);
  });

  it("commits each paragraph line through its original PDF object", () => {
    const first = text("line-1", "OLD ONE", 20);
    const second = text("line-2", "OLD TWO", 20, 120);
    const lines = [
      { object: first, objectIds: ["line-1", "fragment-1"] },
      { object: second, objectIds: ["line-2", "fragment-2"] },
    ];
    const patches = nativeEditTextCommitPatches(first, lines, "NEW ONE\nNEW TWO");

    expect(patches).toEqual([
      { type: "replace-text", objectId: "line-1", text: "NEW ONE" },
      { type: "delete", objectId: "fragment-1" },
      { type: "replace-text", objectId: "line-2", text: "NEW TWO" },
      { type: "delete", objectId: "fragment-2" },
    ]);
  });

  it("keeps the draft safe when an edit adds more PDF lines than the group has", () => {
    const line = text("line-1", "OLD", 20);

    expect(() => nativeEditTextCommitPatches(line, [{ object: line, objectIds: [line.id] }], "ONE\nTWO"))
      .toThrow("Remove extra line breaks before applying.");
  });
});
