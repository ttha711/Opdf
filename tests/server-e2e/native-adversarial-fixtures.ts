import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";

const ENCRYPTED_PDF_BASE64 =
  "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPGJlNmNmNDhjYzRlMjc2OWEyMDI3OWFjNmNmYjViMTNhZDE5ZWQ3NjkxNzEyYWM3NDBkMWJiZWJlMWViMGUwOGY+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA1IDAgUgovTWVkaWFCb3ggWyAwIDAgNDIwIDMwMCBdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgNiAwIFIKL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4KL1JvdGF0ZSAwCi9UcmFucyA8PAo+PgovVHlwZSAvUGFnZQovUGFyZW50IDIgMCBSCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXQovTGVuZ3RoIDE0NAo+PgpzdHJlYW0KjkqKau4enqjv6NMrEc6MARncnj17iafn5vwSZxNd1TLm6KG3JqgcfCIIA77OcKmoOVPjvQ55ZG4a9mDTrne9mKlGkcD6GhF/KCtYkvaykDGWuUxkdDDJxSRgk+AAclDpW7n2NsoPWkAl+RBRVLi+Y+ggb5UtjshYOOZzV3TVBlMvt+7q09M97/JHGygbpzv4CmVuZHN0cmVhbQplbmRvYmoKNiAwIG9iago8PAovRjEgNyAwIFIKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL05hbWUgL0YxCi9TdWJ0eXBlIC9UeXBlMQovVHlwZSAvRm9udAo+PgplbmRvYmoKOCAwIG9iago8PAovViA1Ci9SIDYKL0xlbmd0aCAyNTYKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8MjgxMjFjOTdhYjAyNjNkZWFlMTZhZWNjNTRkYmFkZWNhZjY1OTQ0MDY1ZDk1ZDJmN2ZiNGU0M2YzYzI5MTk5NGIyNDlhODY2MjhmMzU4MmI1ZTUyMGQzMDgxNmUwMmRiPgovVSA8OWUzYzQ1M2ZjZWE0Y2QyYmFiY2I0ODBhMWViZTIzMGUyMzYyODc0NWMzODUwOTBkNTZjMDQxZmE2OWYwNmM1Yjk2Njc5YzljN2IxMzE5YTEwYTYwNzg1Y2VhMjVkMjZjPgovQ0YgPDwKL1N0ZENGIDw8Ci9BdXRoRXZlbnQgL0RvY09wZW4KL0NGTSAvQUVTVjMKL0xlbmd0aCAzMgo+Pgo+PgovU3RtRiAvU3RkQ0YKL1N0ckYgL1N0ZENGCi9PRSA8NTRlNDI4N2FmZDEzNmRkNTgzNzRlNTNhZGRiODZjZTk2YjUwMTIwYzFmZDQ3MWI4NTBiNDU1M2FiNjExNDVlMz4KL1VFIDxjYjkyNjMyYTljZjg4M2QxYWQ5MjRlMTdiZjdkY2IxM2EwOTZiYjgzOWZkNTgzMWMxYTA5YmIzZjU1MjQ1YWMwPgovUGVybXMgPGRmNTBjYzgyZDdjZDgzNWEyZmNkODhkNGJkMWIxOGQ3Pgo+PgplbmRvYmoKeHJlZgowIDkKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAxMTMgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjIxIDAwMDAwIG4gCjAwMDAwMDA0MTAgMDAwMDAgbiAKMDAwMDAwMDY0NSAwMDAwMCBuIAowMDAwMDAwNjc2IDAwMDAwIG4gCjAwMDAwMDA3ODMgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA5Ci9Sb290IDMgMCBSCi9JbmZvIDEgMCBSCi9JRCBbIDwzODM1NjUzODMxMzQzMjM2NjIzMzMwNjEzMDYyNjEzNTMwMzYzNzYxMzEzNzM0NjMzMDM3NjEzNTY2NjQ2MTY0PiA8MzgzNTY1MzgzMTM0MzIzNjYyMzMzMDYxMzA2MjYxMzUzMDM2Mzc2MTMxMzczNDYzMzAzNzYxMzU2NjY0NjE2ND4gXQovRW5jcnlwdCA4IDAgUgo+PgpzdGFydHhyZWYKMTMzOAolJUVPRgo=";

export async function buildSubsetFontPdf() {
  const fontPath = resolve(
    process.cwd(),
    "apps",
    "web",
    "public",
    "fonts",
    "NotoSans-VietnameseMerged.ttf",
  );

  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(fontPath);
  const font = await document.embedFont(fontBytes, { subset: true });
  const page = document.addPage([595, 420]);
  page.drawText("Subset font source 01", {
    x: 72,
    y: 240,
    size: 26,
    font,
  });
  page.drawText("A1 STRUCTURAL DRAWING / VIETNAMESE", {
    x: 72,
    y: 200,
    size: 14,
    font,
  });

  return Buffer.from(await document.save({ useObjectStreams: false }));
}

export function buildEncryptedPdf() {
  return Buffer.from(ENCRYPTED_PDF_BASE64, "base64");
}

export function buildMalformedPdf() {
  return Buffer.from(
    [
      "%PDF-1.7",
      "1 0 obj",
      "<< /Type /Catalog /Pages 2 0 R >>",
      "endobj",
      "2 0 obj",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "endobj",
      "3 0 obj",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 420]",
      "/Contents 4 0 R >>",
      "endobj",
      "4 0 obj",
      "<< /Length 200 >>",
      "stream",
      "BT /F1 24 Tf 72 300 Td (TRUNCATED ENGINEERING PDF)",
      "",
    ].join("\n"),
    "ascii",
  );
}

export async function buildDigitsOnlySubsetPdf() {
  const fontPath = resolve(process.cwd(), "apps", "web", "public", "fonts", "NotoSans-VietnameseMerged.ttf");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(fontPath), {
    subset: true,
    customName: "ABCDEF+NotoSansCAD",
  });
  const page = pdf.addPage([595, 420]);
  page.drawText("12345", { x: 72, y: 240, size: 32, font });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
