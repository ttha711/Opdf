import { describe, expect, it } from "vitest";
import { getServerDocumentUrl, resolvePdfSource } from "./documentSource";

describe("document source", () => {
  const identity = "server://123e4567-e89b-12d3-a456-426614174000/drawing.pdf";

  it("maps persisted server identities to the document endpoint", () => {
    expect(getServerDocumentUrl(identity, "/api/opdf")).toBe(
      "/api/opdf/documents/123e4567-e89b-12d3-a456-426614174000",
    );
  });

  it("keeps working copies ahead of persisted server URLs", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(resolvePdfSource({
      docBytes: bytes,
      sourceIdentity: identity,
      serverBaseUrl: "/api/opdf",
    })).toBe(bytes);
  });

  it("uses latest edited bytes when an original uploaded File is still retained", () => {
    const edited = new Uint8Array([37, 80, 68, 70, 2]);
    const original = new Blob([new Uint8Array([37, 80, 68, 70, 1])], { type: "application/pdf" });
    expect(resolvePdfSource({
      sourceBlob: original,
      docBytes: edited,
      sourceIdentity: identity,
    })).toBe(edited);
  });

  it("uses the server URL when no local working copy exists", () => {
    expect(resolvePdfSource({
      sourceIdentity: identity,
      serverBaseUrl: "/api/opdf",
    })).toBe("/api/opdf/documents/123e4567-e89b-12d3-a456-426614174000");
  });
});
