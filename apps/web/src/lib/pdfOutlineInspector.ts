import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PdfSource } from "./documentSource";
import type { PdfBookmarkInput } from "./pdfAdvanced";

GlobalWorkerOptions.workerSrc = workerSrc;

type OutlineItem = {
  title: string;
  dest?: string | unknown[] | null;
  url?: string | null;
  action?: string | null;
  items?: OutlineItem[];
};

export type OutlineInspection = {
  bookmarks: PdfBookmarkInput[];
  unsupported: number;
  hasOutline: boolean;
};

async function findPage(pdf: PDFDocumentProxy, item: OutlineItem) {
  if (item.url || item.action || !item.dest) return null;
  const dest = typeof item.dest === "string"
    ? await pdf.getDestination(item.dest) : item.dest;
  if (!Array.isArray(dest) || dest.length < 1) return null;
  const ref = dest[0];
  const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0]);
  return Number.isSafeInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : null;
}

/** Parse existing outlines without flattening or writing the document. */
export async function inspectPdfBookmarks(source: PdfSource): Promise<OutlineInspection> {
  if (!source) throw new Error("No PDF loaded.");
  const options = typeof source === "string" ? { url: source, disableAutoFetch: true } :
    { data: source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source.slice() };
  const task = getDocument(options);
  let pdf: PDFDocumentProxy | undefined;
  try {
    pdf = await task.promise;
    const items = (await pdf.getOutline()) as OutlineItem[] | null;
    const result: PdfBookmarkInput[] = [];
    let unsupported = 0;
    async function visit(nodes: OutlineItem[], parent?: number) {
      for (const item of nodes) {
        if (result.length + unsupported >= 5_000) throw new Error("PDF has too many outline entries to edit safely.");
        const page = await findPage(pdf!, item).catch(() => null);
        const index = result.length;
        if (page === null || !item.title.trim()) unsupported++;
        else result.push({ title: item.title, page, parent });
        const nextParent = page === null ? parent : index;
        if (item.items?.length) await visit(item.items, nextParent);
      }
    }
    await visit(items ?? []);
    return { bookmarks: result, unsupported, hasOutline: Boolean(items?.length) };
  } finally {
    if (pdf) await pdf.destroy();
    else await task.destroy();
  }
}
