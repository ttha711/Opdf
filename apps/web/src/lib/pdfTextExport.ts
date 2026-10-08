// Vite emits this URL as a hashed asset; the worker is only fetched when
// PDF.js is loaded by an explicit text-export action.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type PdfTextExportFormat = "txt" | "xml" | "html" | "rtf";

export type PdfTextExportResult = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
};

function fileBase(fileName: string) {
  const leaf = fileName.split(/[\\/]/).pop() || "document.pdf";
  return leaf.replace(/\.pdf$/i, "");
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[char] || char);
}

function escapeHtml(value: string) {
  return escapeXml(value);
}

function escapeRtf(value: string) {
  let output = "";
  for (const char of value) {
    if (char === "\\") output += "\\\\";
    else if (char === "{") output += "\\{";
    else if (char === "}") output += "\\}";
    else if (char === "\n") output += "\\par\n";
    else {
      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint >= 32 && codePoint <= 126) {
        output += char;
      } else {
        const signed = codePoint > 32767 ? codePoint - 65536 : codePoint;
        output += `\\u${signed}?`;
      }
    }
  }
  return output;
}

export function buildTextExportFromPages(
  pages: string[],
  sourceName: string,
  format: PdfTextExportFormat,
): PdfTextExportResult {
  const base = fileBase(sourceName);
  let content = "";
  let mimeType = "text/plain;charset=utf-8";

  if (format === "txt") {
    content = pages.map((text, index) => `--- Page ${index + 1} ---\n${text}\n`).join("\n");
  } else if (format === "xml") {
    mimeType = "application/xml;charset=utf-8";
    content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<document source="${escapeXml(sourceName)}">`,
      ...pages.map((text, index) => `  <page number="${index + 1}">${escapeXml(text)}</page>`),
      "</document>",
    ].join("\n");
  } else if (format === "html") {
    mimeType = "text/html;charset=utf-8";
    content = [
      "<!doctype html>",
      '<html><head><meta charset="utf-8"><title>' + escapeHtml(base) + "</title></head><body>",
      ...pages.map((text, index) => `<section data-page="${index + 1}"><h2>Page ${index + 1}</h2><p>${escapeHtml(text)}</p></section>`),
      "</body></html>",
    ].join("\n");
  } else {
    mimeType = "application/rtf";
    const body = pages
      .map((text, index) => `\\b Page ${index + 1}\\b0\\par\n${escapeRtf(text)}\\par\n`)
      .join("\n");
    content = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs22\n${body}}`;
  }

  return {
    bytes: new TextEncoder().encode(content),
    fileName: `${base}.${format}`,
    mimeType,
  };
}

export async function extractPdfTextPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  // Do not rely on PDF.js resolving "./pdf.worker.mjs" relative to the
  // generated app chunk: Vite renames and relocates worker assets.
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(text);
  }
  return pages;
}

export async function buildPdfTextExport(
  bytes: Uint8Array,
  sourceName: string,
  format: PdfTextExportFormat,
): Promise<PdfTextExportResult> {
  return buildTextExportFromPages(await extractPdfTextPages(bytes), sourceName, format);
}
