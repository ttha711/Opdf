import { describe, expect, it } from "vitest";
import type { PdfContentObject } from "@opdf/core";
import { findDirectTextObject } from "./directPdfTextHit";

const objects: PdfContentObject[] = [
  {
    id: "p0-o0", pageIndex: 0, kind: "text",
    pageWidth: 600, pageHeight: 800,
    bounds: { x: 70, y: 690, width: 100, height: 25 },
    matrix: [1, 0, 0, 1, 0, 0], text: "LABEL 1250",
  },
  {
    id: "p0-o1", pageIndex: 0, kind: "text",
    pageWidth: 600, pageHeight: 800,
    bounds: { x: 70, y: 300, width: 100, height: 25 },
    matrix: [1, 0, 0, 1, 0, 0], text: "LABEL 1350",
  },
];

const rect = { left: 0, top: 0, width: 600, height: 800 };

describe("direct PDF reader text hit testing", () => {
  it("selects text at the original PDF drawing position", () => {
    expect(findDirectTextObject(objects, {
      pageIndex: 0, clientX: 90, clientY: 100, rect,
    })?.id).toBe("p0-o0");
  });
  it("does not edit an unrelated text object far from the click", () => {
    expect(findDirectTextObject(objects, {
      pageIndex: 0, clientX: 450, clientY: 400, rect,
    })).toBeNull();
  });
  it("does not edit a distant text object just because selected text matches", () => {
    expect(findDirectTextObject(objects, {
      pageIndex: 0, clientX: 450, clientY: 400, rect, selectedText: "1350",
    })).toBeNull();
  });
});
