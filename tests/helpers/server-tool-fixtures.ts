import forge from "node-forge";
import { Document, Packer, Paragraph } from "docx";
import * as XLSX from "xlsx";
import PptxGenJS from "pptxgenjs";

export async function buildOfficeFixtures() {
  const wordMarker = "OPDF SERVER UI DOCX CHECK";
  const excelMarker = "OPDF SERVER UI XLSX CHECK";
  const pptMarker = "OPDF SERVER UI PPTX CHECK";

  const word = new Document({
    sections: [{ children: [new Paragraph(wordMarker), new Paragraph("Converted through real LibreOffice UI flow.")] }],
  });
  const docx = Buffer.from(await Packer.toBuffer(word));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [excelMarker, "Value"],
    ["Beam", 300],
    ["MEP", 125],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Server UI");
  const xlsx = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

  const pptxDoc = new PptxGenJS();
  const slide = pptxDoc.addSlide();
  slide.addText(pptMarker, { x: 0.8, y: 0.8, w: 8, h: 0.8 });
  slide.addText("Converted through real LibreOffice UI flow.", { x: 0.8, y: 2, w: 8, h: 0.6 });
  const pptArrayBuffer = await pptxDoc.write({ outputType: "arraybuffer" });
  if (!(pptArrayBuffer instanceof ArrayBuffer)) {
    throw new Error("Unable to generate PPTX fixture.");
  }
  const pptx = Buffer.from(pptArrayBuffer);

  return {
    docx: { name: "server-ui-word.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: docx, marker: wordMarker },
    xlsx: { name: "server-ui-excel.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: xlsx, marker: excelMarker },
    pptx: { name: "server-ui-slides.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: pptx, marker: pptMarker },
  } as const;
}

export function buildTestP12(passphrase = "opdf-ci") {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attrs = [
    { name: "commonName", value: "OPDF Server UI CI" },
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
  return Buffer.from(der, "binary");
}
