import { describe, expect, it } from "vitest";
import { mapActiveToolToEmbedPdfAnnotation } from "./annotationToolMapping";

describe("annotation tool mapping", () => {
  it("maps OPDF text to editable EmbedPDF FreeText", () => {
    expect(mapActiveToolToEmbedPdfAnnotation("text")).toBe("freeText");
  });

  it("maps OPDF note to EmbedPDF sticky text annotation", () => {
    expect(mapActiveToolToEmbedPdfAnnotation("note")).toBe("text");
  });

  it("keeps the remaining annotation tools stable", () => {
    expect(mapActiveToolToEmbedPdfAnnotation("highlight")).toBe("highlight");
    expect(mapActiveToolToEmbedPdfAnnotation("shape")).toBe("square");
    expect(mapActiveToolToEmbedPdfAnnotation("draw")).toBe("ink");
    expect(mapActiveToolToEmbedPdfAnnotation("select")).toBeNull();
  });
});
