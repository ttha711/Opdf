import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function extractPdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim());
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

export async function inspectPdfBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const textPages = await extractPdfText(data).catch(() => []);
  return {
    byteLength: data.byteLength,
    sha256: sha256Bytes(data),
    pageCount,
    textPages,
    text: textPages.join("\n"),
  };
}

export async function inspectPdfFile(path) {
  return inspectPdfBytes(await readFile(path));
}

export async function inspectZipFile(path) {
  const bytes = await readFile(path);
  const entries = unzipSync(new Uint8Array(bytes));
  const files = [];
  for (const [name, data] of Object.entries(entries)) {
    files.push({
      name,
      ...(name.toLowerCase().endsWith(".pdf") ? await inspectPdfBytes(data) : { byteLength: data.byteLength }),
    });
  }
  return {
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
    files,
  };
}
