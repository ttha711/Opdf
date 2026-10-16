import { describe, expect, it } from "vitest";
import type { PdfContentObject } from "@tpdf/core";
import { rememberVerifiedNativeEditPage, takeVerifiedNativeEditPage } from "./nativeEditPageObjectCache";

describe("verified native edit page cache", () => {
  it("returns a verified page once for the exact byte revision", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const objects = [] as PdfContentObject[];

    rememberVerifiedNativeEditPage(bytes, 181, objects);

    expect(takeVerifiedNativeEditPage(bytes, 181)).toBe(objects);
    expect(takeVerifiedNativeEditPage(bytes, 181)).toBeNull();
    expect(takeVerifiedNativeEditPage(new Uint8Array([1, 2, 3]), 181)).toBeNull();
  });

  it("keeps different pages of the same revision independent", () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const firstPage = [] as PdfContentObject[];
    const secondPage = [] as PdfContentObject[];

    rememberVerifiedNativeEditPage(bytes, 0, firstPage);
    rememberVerifiedNativeEditPage(bytes, 1, secondPage);

    expect(takeVerifiedNativeEditPage(bytes, 1)).toBe(secondPage);
    expect(takeVerifiedNativeEditPage(bytes, 0)).toBe(firstPage);
  });
});
