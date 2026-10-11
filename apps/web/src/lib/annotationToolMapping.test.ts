import { describe, expect, it } from "vitest";
import { isEmbedPdfReplaceTextTool, mapActiveToolToEmbedPdfAnnotation, mapEmbedPdfToolToActiveTool } from "./annotationToolMapping";

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
  it("keeps the touch toolbar in sync with embedded native tool changes", () => {
    expect(mapEmbedPdfToolToActiveTool("highlight")).toBe("highlight");
    expect(mapEmbedPdfToolToActiveTool("annotation:freeText")).toBe("text");
    expect(mapEmbedPdfToolToActiveTool("text")).toBe("note");
    expect(mapEmbedPdfToolToActiveTool("ink")).toBe("draw");
    expect(mapEmbedPdfToolToActiveTool("square")).toBe("shape");
    expect(mapEmbedPdfToolToActiveTool("none")).toBe("select");
    expect(mapEmbedPdfToolToActiveTool("not-installed")).toBeNull();
  });

  it("recognizes EmbedPDF replace-text variants for native content editing", () => {
    expect(isEmbedPdfReplaceTextTool("replace-text")).toBe(true);
    expect(isEmbedPdfReplaceTextTool("replaceText")).toBe(true);
    expect(isEmbedPdfReplaceTextTool("strikeout")).toBe(false);
  });
});
