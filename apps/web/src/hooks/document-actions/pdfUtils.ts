export function isLikelyPdf(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // PDF
    bytes[4] === 0x2d // -
  );
}

export function clonePdfBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export async function isParseablePdf(bytes: Uint8Array): Promise<boolean> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const doc = await pdfjs.getDocument({ data: clonePdfBytes(bytes) }).promise;
    const ok = doc.numPages > 0;
    doc.destroy();
    return ok;
  } catch {
    return false;
  }
}
