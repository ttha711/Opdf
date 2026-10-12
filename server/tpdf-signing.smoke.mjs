import forge from "node-forge";
import { PDFDocument } from "pdf-lib";

function encodeOptions(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function buildTestP12(passphrase) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "10";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attrs = [
    { name: "commonName", value: "TPDF Server CI" },
    { name: "organizationName", value: "TPDF" },
    { name: "countryName", value: "VN" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", digitalSignature: true, keyCertSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
    algorithm: "3des",
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}

export async function runSigningSmoke({ base, pdfBytes, assert }) {
  const passphrase = "tpdf-server-ci";
  const p12 = buildTestP12(passphrase);

  const inspectCertificate = await fetch(`${base}/api/tpdf/certificates/inspect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-pkcs12",
      "X-TPDF-Options": encodeOptions({ passphrase }),
    },
    body: p12,
  });
  assert(inspectCertificate.ok, `certificate inspection failed: ${inspectCertificate.status}`);
  const inspectedCertificate = await inspectCertificate.json();
  assert(
    inspectedCertificate.commonName === "TPDF Server CI",
    "certificate inspection returned wrong subject",
  );

  const storeCertificate = await fetch(`${base}/api/tpdf/certificates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-pkcs12",
      "X-TPDF-Options": encodeOptions({
        passphrase,
        fileName: "server-ci.p12",
      }),
    },
    body: p12,
  });
  assert(storeCertificate.status === 201, `certificate storage failed: ${storeCertificate.status}`);
  const storedCertificate = await storeCertificate.json();
  assert(
    storedCertificate.certificate.commonName === "TPDF Server CI",
    "stored certificate metadata is wrong",
  );

  const storedList = await fetch(`${base}/api/tpdf/certificates`).then((r) => r.json());
  assert(
    storedList.some((item) => item.id === storedCertificate.id),
    "stored certificate missing from list",
  );

  const signResponse = await fetch(`${base}/api/tpdf/operations/sign-p12`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-TPDF-Options": encodeOptions({
        certificateId: storedCertificate.id,
        passphrase,
        page: 1,
        reason: "Server CI verification",
        location: "CI runner",
        contactInfo: "ci@tpdf.local",
        x: 0.55,
        y: 0.72,
        width: 0.38,
        height: 0.16,
      }),
    },
    body: pdfBytes,
  });
  assert(signResponse.ok, `server PDF signing failed: ${signResponse.status}`);
  const signedPdf = Buffer.from(await signResponse.arrayBuffer());
  assert(signedPdf.includes(Buffer.from("/ByteRange")), "server signed PDF has no ByteRange");
  assert(
    signedPdf.includes(Buffer.from("/SubFilter /adbe.pkcs7.detached")),
    "server signed PDF has no detached PKCS#7 signature",
  );
  await PDFDocument.load(signedPdf);

  const inspectSignatures = await fetch(`${base}/api/tpdf/operations/inspect-signatures`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: signedPdf,
  });
  assert(inspectSignatures.ok, "server signature inspection failed");
  const signatures = await inspectSignatures.json();
  assert(signatures.length === 1, "server signature inspection expected one signature");
  assert(signatures[0].byteRangeWellFormed === true, "server signature ByteRange is malformed");
  assert(signatures[0].cmsParsed === true, "server signature CMS could not be parsed");
  assert(
    signatures[0].certificates[0]?.commonName === "TPDF Server CI",
    "server signature signer mismatch",
  );

  const deleteCertificate = await fetch(
    `${base}/api/tpdf/certificates/${storedCertificate.id}`,
    { method: "DELETE" },
  );
  assert(deleteCertificate.ok, "stored certificate delete failed");
}
