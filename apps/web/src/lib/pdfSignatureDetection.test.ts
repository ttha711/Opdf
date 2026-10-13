import { describe, expect, it } from "vitest";
import { pdfHasDigitalSignature } from "./pdfSignatureDetection";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("pdfHasDigitalSignature", () => {
  it("detects a signature dictionary", () => {
    expect(pdfHasDigitalSignature(bytes("1 0 obj <</Type/Sig/ByteRange[0 10 20 30]/Contents<00>>> endobj"))).toBe(true);
  });
  it("detects a certification (DocMDP) signature", () => {
    const certified = "1 0 obj <</Type/Sig/Filter/Adobe.PPKLite/Reference[<</TransformMethod/DocMDP/TransformParams<</P 2>>>>]" +
      "/ByteRange [0 840 1840 220]/Contents<00>>> endobj";
    expect(pdfHasDigitalSignature(bytes(certified))).toBe(true);
  });
  it("still detects the signature after an incremental update was appended", () => {
    const signed = "%PDF-1.7\n1 0 obj <</Type/Sig/ByteRange [0 10 20 30]/Contents<00>>> endobj\n%%EOF\n";
    const updated = signed + "2 0 obj <</Type/Annot/Subtype/Text>> endobj\nxref\n0 1\ntrailer <</Prev 9>>\n%%EOF\n";
    expect(pdfHasDigitalSignature(bytes(updated))).toBe(true);
  });
  it("detects a document timestamp, which is also byte-range protected", () => {
    expect(pdfHasDigitalSignature(bytes("1 0 obj <</Type/DocTimeStamp/ByteRange [0 5 15 25]/Contents<00>>> endobj"))).toBe(true);
  });
  it("ignores unsigned content", () => {
    expect(pdfHasDigitalSignature(bytes("%PDF-1.7 1 0 obj <</Type/Page>> endobj"))).toBe(false);
    expect(pdfHasDigitalSignature(bytes("/Byte"))).toBe(false);
    expect(pdfHasDigitalSignature(new Uint8Array(0))).toBe(false);
  });
});
