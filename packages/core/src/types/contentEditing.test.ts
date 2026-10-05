import { describe, expect, it } from "vitest";
import type { PdfContentEditingEngine, PdfContentPatch } from "./contentEditing.js";

describe("native content editing contract", () => {
  it("requires mutations to return serialized PDF bytes", async () => {
    const engine: PdfContentEditingEngine = {
      inspectPage: async () => [],
      applyPatches: async (pdf: Uint8Array, patches: PdfContentPatch[]) => {
        expect(patches[0]).toEqual({ type: "replace-text", objectId: "p0-o1", text: "OPDF" });
        return pdf;
      },
    };
    const input = new Uint8Array([37, 80, 68, 70]);
    const output = await engine.applyPatches(input, [{ type: "replace-text", objectId: "p0-o1", text: "OPDF" }]);
    expect(output).toEqual(input);
  });

  it("supports PDFium-native object creation and advanced styling patches", async () => {
    const patches: PdfContentPatch[] = [
      { type: "add-text", pageIndex: 0, text: "Xin chào", x: 40, y: 80, fontSize: 18, fontFamily: "__opdf_unicode__" },
      { type: "add-rect", pageIndex: 0, x: 20, y: 20, width: 100, height: 40, stroke: true, fillMode: "winding" },
      { type: "style-object", objectId: "p0-o1", lineCap: "round", lineJoin: "bevel", dashArray: [6, 3] },
      { type: "style-text", objectId: "p0-o2", renderMode: "fill-stroke", strokeColor: "#111111", strokeWidth: 0.5 },
    ];
    expect(patches[0].type).toBe("add-text");
    expect(patches[2]).toMatchObject({ type: "style-object", dashArray: [6, 3] });
    expect(patches[3]).toMatchObject({ renderMode: "fill-stroke" });
  });
});
