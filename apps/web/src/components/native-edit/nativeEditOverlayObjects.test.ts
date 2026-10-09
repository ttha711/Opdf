import { describe, expect, it } from "vitest";
import type { PdfContentObject } from "@opdf/core";
import {
  getNativeEditOverlayObjects,
  NATIVE_EDIT_OVERLAY_LIMIT,
} from "./nativeEditOverlayObjects";

function object(id: string, kind: PdfContentObject["kind"]): PdfContentObject {
  return {
    id, kind, pageIndex: 0, pageWidth: 600, pageHeight: 800,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: [1, 0, 0, 1, 0, 0],
  };
}

describe("native edit SVG overlay budget", () => {
  it("keeps paths editable on ordinary PDFs", () => {
    const items = [object("path", "path"), object("text", "text")];
    expect(getNativeEditOverlayObjects(items, null)).toBe(items);
  });

  it("does not mount thousands of CAD path polygons", () => {
    const paths = Array.from({ length: 27711 }, (_, i) => object(`path-${i}`, "path"));
    const items = [...paths, object("label", "text"), object("logo", "image")];
    expect(getNativeEditOverlayObjects(items, null).map((item) => item.id))
      .toEqual(["label", "logo"]);
  });

  it("caps dense text and retains a sidebar-selected path", () => {
    const items = [
      ...Array.from({ length: 700 }, (_, i) => object(`text-${i}`, "text")),
      object("selected-path", "path"),
    ];
    const actual = getNativeEditOverlayObjects(items, "selected-path");
    expect(actual).toHaveLength(NATIVE_EDIT_OVERLAY_LIMIT);
    expect(actual.at(-1)?.id).toBe("selected-path");
  });
  it("prioritizes a readable label after hundreds of tiny CAD fragments", () => {
    const tiny = Array.from({ length: 900 }, (_, i) => ({
      ...object(`glyph-${i}`, "text"),
      bounds: { x: 5 + i % 20, y: 5, width: 0.2, height: 0.3 },
    }));
    const legible = {
      ...object("room-label", "text"),
      bounds: { x: 90, y: 520, width: 130, height: 24 },
      text: "ROOM 43",
    };
    const selected = getNativeEditOverlayObjects([...tiny, legible], null);
    expect(selected).toHaveLength(NATIVE_EDIT_OVERLAY_LIMIT);
    expect(selected.some((item) => item.id === legible.id)).toBe(true);
  });

  it("distributes CAD hit targets across sheet regions", () => {
    const concentrated = Array.from({ length: 1000 }, (_, i) => ({
      ...object(`dense-${i}`, "text"),
      bounds: { x: 10 + i % 2, y: 15, width: 40, height: 9 },
    }));
    const far = {
      ...object("far-label", "text"),
      bounds: { x: 450, y: 690, width: 36, height: 9 },
    };
    const selected = getNativeEditOverlayObjects([...concentrated, far], null);
    expect(selected.some((item) => item.id === "far-label")).toBe(true);
  });
});
