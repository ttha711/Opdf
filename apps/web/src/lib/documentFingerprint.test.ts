import { describe, expect, it } from "vitest";
import { buildDocumentFingerprint } from "./documentFingerprint";

describe("document fingerprint with embedded PDF edits", () => {
  const input = {
    fileName: "drawing.pdf",
    docBytes: new Uint8Array([37, 80, 68, 70]),
    annotations: [],
  };

  it("marks embedded annotation mutations dirty even if React annotations and bytes do not change", () => {
    const saved = buildDocumentFingerprint({ ...input, viewerRevision: 0 });
    const edited = buildDocumentFingerprint({ ...input, viewerRevision: 1 });
    expect(edited).not.toBe(saved);
    expect(buildDocumentFingerprint({ ...input, viewerRevision: 1 })).toBe(edited);
  });

  it("keeps empty document fingerprints empty", () => {
    expect(buildDocumentFingerprint({ ...input, fileName: "" })).toBe("");
  });
});
