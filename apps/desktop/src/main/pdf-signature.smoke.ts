import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { inspectP12Certificate, inspectPdfSignatures, signPdfWithP12 } from "./pdf-signature.js";

function buildTestP12(passphrase: string) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attrs = [
    { name: "commonName", value: "OPDF CI Test" },
    { name: "organizationName", value: "OPDF" },
    { name: "countryName", value: "VN" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", digitalSignature: true, keyCertSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
    algorithm: "3des",
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return new Uint8Array(Buffer.from(der, "binary"));
}

async function main() {
  const passphrase = "opdf-ci";
  const p12 = buildTestP12(passphrase);
  const info = inspectP12Certificate(p12, passphrase);
  if (info.commonName !== "OPDF CI Test") {
    throw new Error("Unexpected certificate common name: " + info.commonName);
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 300]);
  page.drawText("OPDF digital signature integration smoke test", { x: 40, y: 240, size: 14 });
  const source = await pdf.save();

  const signed = await signPdfWithP12(source, p12, {
    passphrase,
    page: 1,
    reason: "CI verification",
    location: "Local test runner",
    contactInfo: "ci@opdf.local",
    x: 0.55,
    y: 0.72,
    width: 0.38,
    height: 0.16,
  });

  const signedBuffer = Buffer.from(signed.bytes);
  if (signedBuffer.length <= source.length) {
    throw new Error("Signed PDF did not grow as expected.");
  }
  if (!signedBuffer.includes(Buffer.from("/ByteRange"))) {
    throw new Error("Signed PDF does not contain a ByteRange.");
  }
  if (!signedBuffer.includes(Buffer.from("/SubFilter /adbe.pkcs7.detached"))) {
    throw new Error("Signed PDF does not contain the expected detached signature subfilter.");
  }

  await PDFDocument.load(signed.bytes);

  const inspections = inspectPdfSignatures(signed.bytes);
  if (inspections.length !== 1) {
    throw new Error("Expected one inspected PDF signature.");
  }
  const inspected = inspections[0];
  if (!inspected.byteRangeWellFormed || !inspected.cmsParsed) {
    throw new Error("Signature inspector could not parse the generated signature.");
  }
  if (inspected.certificates[0]?.commonName !== "OPDF CI Test") {
    throw new Error("Signature inspector did not recover the signer certificate.");
  }
  if (inspected.hasLaterRevision) {
    throw new Error("Freshly signed PDF unexpectedly reports a later revision.");
  }

  const withLaterBytes = new Uint8Array(Buffer.concat([Buffer.from(signed.bytes), Buffer.from("\n% OPDF later revision marker\n")]));
  const laterInspection = inspectPdfSignatures(withLaterBytes)[0];
  if (!laterInspection?.hasLaterRevision || laterInspection.bytesAfterSignedRevision <= 0) {
    throw new Error("Signature inspector did not detect bytes after the signed revision.");
  }

  process.stdout.write("Digital signature + inspection smoke test passed\n");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
