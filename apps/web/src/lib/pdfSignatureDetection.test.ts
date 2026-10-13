import { describe, expect, it } from "vitest";
import { pdfHasDigitalSignature } from "./pdfSignatureDetection";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("pdfHasDigitalSignature", () => {
  it("detects a signature dictionary", () => {
    expect(pdfHasDigitalSignature(bytes("1 0 obj <</Type/Sig/ByteRange[0 10 20 30]/Contents<00>>> endobj"))).toBe(true);
  });
  it("ignores unsigned content", () => {
    expect(pdfHasDigitalSignature(bytes("%PDF-1.7 1 0 obj <</Type/Page>> endobj"))).toBe(false);
    expect(pdfHasDigitalSignature(bytes("/Byte"))).toBe(false);
    expect(pdfHasDigitalSignature(new Uint8Array(0))).toBe(false);
  });
});
