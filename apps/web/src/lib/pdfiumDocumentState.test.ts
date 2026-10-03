import { describe, expect, it, vi } from "vitest";
import { resolvePdfiumPageCount } from "./pdfiumDocumentState";

describe("resolvePdfiumPageCount", () => {
  it("prefers the live scroll scope used by the visible PDFium viewer", () => {
    expect(resolvePdfiumPageCount({
      documentId: "doc",
      scrollScope: { getTotalPages: () => 120 },
      documentManager: null,
    })).toBe(120);
  });

  it("supports document state and direct document shapes", () => {
    expect(resolvePdfiumPageCount({
      documentId: "doc",
      scrollScope: { getTotalPages: () => 0 },
      documentManager: {
        getDocumentState: vi.fn(() => ({ document: { pageCount: 42 } })),
      },
    })).toBe(42);

    expect(resolvePdfiumPageCount({
      documentId: "doc",
      documentManager: {
        getDocument: vi.fn(() => ({ pageCount: 7 })),
      },
    })).toBe(7);
  });

  it("accepts document-open payloads and ignores invalid counts", () => {
    expect(resolvePdfiumPageCount({
      documentId: "doc",
      scrollScope: { getTotalPages: () => Number.NaN },
      documentManager: null,
      openedDocument: { document: { pageCount: 9 } },
    })).toBe(9);

    expect(resolvePdfiumPageCount({
      documentId: "doc",
      scrollScope: { getTotalPages: () => 0 },
      documentManager: null,
    })).toBeNull();
  });
});
