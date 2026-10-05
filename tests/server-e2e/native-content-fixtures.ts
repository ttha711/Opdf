import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export async function buildTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Original OPDF text", { x: 70, y: 180, size: 24, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function buildObjectPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  page.drawRectangle({
    x: 50,
    y: 80,
    width: 120,
    height: 70,
    color: rgb(0.2, 0.6, 0.9),
    borderColor: rgb(0.1, 0.2, 0.3),
    borderWidth: 2,
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl8sAAAAASUVORK5CYII=",
    "base64",
  );
  const image = await doc.embedPng(png);
  page.drawImage(image, { x: 230, y: 90, width: 90, height: 90 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function buildRotatedTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rotated OPDF text", {
    x: 90,
    y: 120,
    size: 28,
    font,
    rotate: degrees(30),
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export function buildFormPdf() {
  const pageContent = "q\n1 0 0 1 100 100 cm\n/Fm0 Do\nQ";
  const formContent = [
    "q",
    "0.2 0.6 0.9 rg",
    "20 10 60 20 re f",
    "Q",
    "q",
    "20 0 0 20 120 20 cm",
    "/Im0 Do",
    "Q",
    "BT",
    "/F1 20 Tf",
    "20 55 Td",
    "(Form child text) Tj",
    "ET",
  ].join("\n");
  const imageContent = "FF0000>";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Resources << /XObject << /Fm0 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(pageContent, "ascii")} >>\nstream\n${pageContent}\nendstream`,
    `<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 220 100] /Resources << /Font << /F1 6 0 R >> /XObject << /Im0 7 0 R >> >> /Length ${Buffer.byteLength(formContent, "ascii")} >>\nstream\n${formContent}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${Buffer.byteLength(imageContent, "ascii")} >>\nstream\n${imageContent}\nendstream`,
  ];

  let body = "%PDF-1.7\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = Buffer.byteLength(body, "ascii");
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}
