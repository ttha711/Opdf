import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const targetMb = Math.max(1, Number(readArg("mb", "250")));
const pageCount = Math.max(1, Number(readArg("pages", "300")));
const outPath = resolve(readArg("out", `tmp/opdf-stress-${targetMb}mb-${pageCount}pages.pdf`));
const targetBytes = Math.floor(targetMb * 1024 * 1024);

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
  // A1 landscape in PDF points (approx. 841 x 594 mm).
  const page = doc.addPage([2384, 1684]);
  page.drawText(`OPDF STRUCTURAL DRAWING S-${String(pageNumber).padStart(3, "0")}`, {
    x: 60,
    y: 1600,
    size: 28,
    font,
  });
  for (let x = 80; x < 2300; x += 80) {
    page.drawLine({
      start: { x, y: 100 },
      end: { x, y: 1560 },
      thickness: x % 400 === 0 ? 1.4 : 0.35,
      color: rgb(0.25, 0.25, 0.25),
    });
  }
  for (let y = 120; y < 1560; y += 80) {
    page.drawLine({
      start: { x: 80, y },
      end: { x: 2300, y },
      thickness: y % 400 === 0 ? 1.4 : 0.35,
      color: rgb(0.25, 0.25, 0.25),
    });
  }
  for (let i = 0; i < 80; i += 1) {
    const x = 100 + (i % 10) * 210;
    const y = 1450 - Math.floor(i / 10) * 150;
    page.drawText(`C${pageNumber}-${i + 1}  300x600  EL +${(i * 0.125).toFixed(3)}`, {
      x,
      y,
      size: 12,
      font,
    });
  }
}

const base = await doc.save({ useObjectStreams: true });
await mkdir(dirname(outPath), { recursive: true });

const baseBuffer = Buffer.from(base);
const startXrefIndex = baseBuffer.lastIndexOf(Buffer.from("startxref"));
if (startXrefIndex < 0) throw new Error("Generated PDF is missing startxref");

const prefix = baseBuffer.subarray(0, startXrefIndex);
const trailer = baseBuffer.subarray(startXrefIndex);
const stream = createWriteStream(outPath);
stream.write(prefix);

// Add legal PDF comment bytes after the xref data but before startxref.
// Existing object/xref offsets remain valid, while startxref/%%EOF stay near
// the physical end of the file so strict readers still accept the document.
let remaining = Math.max(0, targetBytes - baseBuffer.length);
const chunk = Buffer.alloc(1024 * 1024, 0x20);
chunk[0] = 0x25; // %
chunk[chunk.length - 1] = 0x0a;
while (remaining > 0) {
  const size = Math.min(chunk.length, remaining);
  stream.write(chunk.subarray(0, size));
  remaining -= size;
}
stream.write(trailer);

await new Promise((resolvePromise, reject) => {
  stream.end(resolvePromise);
  stream.on("error", reject);
});

console.log(`Generated ${outPath}: target=${targetMb} MB pages=${pageCount} base=${(base.length / 1024 / 1024).toFixed(2)} MB`);
