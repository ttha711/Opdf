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
});
