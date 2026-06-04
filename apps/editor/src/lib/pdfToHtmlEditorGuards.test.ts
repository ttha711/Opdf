import { describe, expect, it } from "vitest";
import { type PageResult } from "../types";
import {
  MAX_PERSISTED_PDF_PAGES_BYTES,
  getClosestHTMLElement,
  serializePdfPagesForStorage,
} from "./pdfToHtmlEditorGuards";

describe("pdfToHtml editor guards", () => {
  it("returns null instead of throwing when event target is not an Element", () => {
    expect(getClosestHTMLElement({} as EventTarget, '[data-floating-box="true"]')).toBeNull();
    expect(getClosestHTMLElement(null, "table")).toBeNull();
  });

  it("skips persistence when pdfPages payload exceeds localStorage-safe size", () => {
    const basePage: PageResult = {
      pageNumber: 1,
      imageUrl: "data:image/png;base64,small",
      pageWidth: 100,
      pageHeight: 120,
      htmlContent: "<p>ok</p>",
      status: "done",
    };

    const oversizedPayload = "x".repeat(MAX_PERSISTED_PDF_PAGES_BYTES);
    const largePages: PageResult[] = [
      {
        ...basePage,
        imageUrl: `data:image/png;base64,${oversizedPayload}`,
      },
    ];

    expect(serializePdfPagesForStorage([basePage])).toContain("\"pageNumber\":1");
    expect(serializePdfPagesForStorage(largePages)).toBeNull();
  });
});
