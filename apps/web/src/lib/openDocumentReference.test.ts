import { describe, expect, it, vi } from "vitest";
import {
  normalizeServerDocumentReference,
  resolveBrowserDocumentReference,
} from "./openDocumentReference";

const id = "123e4567-e89b-12d3-a456-426614174000";

describe("production document references", () => {
  it("normalizes server identities", () => {
    expect(normalizeServerDocumentReference(
      `server://${id}/drawing%20set.pdf`,
    )).toEqual({
      identity: `server://${id}/drawing%20set.pdf`,
      id,
      displayName: "drawing set.pdf",
    });
  });

  it("normalizes OPDF document API URLs without touching Vite /@fs", async () => {
    const fetchImpl = vi.fn();
    const resolved = await resolveBrowserDocumentReference(
      `https://pdf.example.com/api/opdf/documents/${id}`,
      { allowViteFs: false, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(resolved.isServerDocument).toBe(true);
    expect(resolved.identity).toBe(`server://${id}/document.pdf`);
    expect(resolved.blob).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes persisted storage paths that contain a document UUID", async () => {
    const fetchImpl = vi.fn();
    const resolved = await resolveBrowserDocumentReference(
      `D:\\OPDF\\data\\documents\\${id}\\document.pdf`,
      { allowViteFs: false, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(resolved.isServerDocument).toBe(true);
    expect(resolved.identity).toBe(`server://${id}/document.pdf`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects raw local paths in production instead of fetching /@fs", async () => {
    const fetchImpl = vi.fn();

    await expect(resolveBrowserDocumentReference(
      "D:\\private\\drawing.pdf",
      { allowViteFs: false, fetchImpl: fetchImpl as unknown as typeof fetch },
    )).rejects.toThrow("only available in Desktop or Vite development mode");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps Vite /@fs support limited to explicit development mode", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    const fetchImpl = vi.fn(async () => new Response(blob, { status: 200 }));

    const resolved = await resolveBrowserDocumentReference(
      "/tmp/drawing.pdf",
      { allowViteFs: true, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledWith("/@fs//tmp/drawing.pdf");
    expect(resolved.isServerDocument).toBe(false);
    expect(resolved.displayName).toBe("drawing.pdf");
    expect(resolved.blob).toBeInstanceOf(Blob);
  });
});
