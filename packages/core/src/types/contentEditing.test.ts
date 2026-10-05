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
});
