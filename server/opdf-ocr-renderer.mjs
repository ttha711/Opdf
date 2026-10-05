import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { init } from "@embedpdf/pdfium";
import { PdfiumNative, PdfEngine } from "@embedpdf/engines/pdfium";


function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.from(data);
  const out = Buffer.allocUnsafe(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  typeBytes.copy(out, 4);
  body.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, body])), 8 + body.length);
  return out;
}

function encodeRgbaPng(image) {
  const width = Number(image.width);
  const height = Number(image.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("PDFium returned invalid OCR image dimensions.");
  }
  const rgba = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  if (rgba.length < width * height * 4) {
    throw new Error("PDFium returned incomplete OCR image data.");
  }

  const scanlines = Buffer.allocUnsafe(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const target = y * (1 + width * 4);
    scanlines[target] = 0;
    rgba.copy(scanlines, target + 1, y * width * 4, (y + 1) * width * 4);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function createPdfiumOcrRenderer(pdfBytes) {
  const pdfiumModule = await init();
  const native = new PdfiumNative(pdfiumModule);
  const engine = new PdfEngine(native, {
    imageConverter: async (getImageData) => encodeRgbaPng(getImageData()),
  });

  const content = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  );
  const document = await engine.openDocumentBuffer({
    id: `ocr-${randomUUID()}`,
    content,
  }).toPromise();

  return {
    pageCount: document.pages.length,
    async getNativeText(pageIndex) {
      return engine.extractText(document, [pageIndex]).toPromise();
    },
    async renderPage(pageIndex) {
      const page = document.pages[pageIndex];
      if (!page) throw new Error(`OCR page ${pageIndex + 1} does not exist.`);
      const raw = await engine.renderPageRaw(document, page).toPromise();
      return {
        bytes: encodeRgbaPng(raw),
        width: raw.width,
        height: raw.height,
      };
    },
    async close() {
      await engine.closeDocument(document).toPromise().catch(() => {});
      await engine.destroy().toPromise().catch(() => {});
    },
  };
}
