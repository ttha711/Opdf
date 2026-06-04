import { type PageResult } from "../types";

export const PDF_TO_HTML_STORAGE_KEY = "pdf_to_html_pages";
export const MAX_PERSISTED_PDF_PAGES_BYTES = 4_000_000;

export function getClosestHTMLElement(
  target: EventTarget | null,
  selector: string
): HTMLElement | null {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return null;
  }

  const match = target.closest(selector);
  return match instanceof HTMLElement ? match : null;
}

export function serializePdfPagesForStorage(
  pages: PageResult[],
  maxBytes = MAX_PERSISTED_PDF_PAGES_BYTES
): string | null {
  if (!Array.isArray(pages) || pages.length === 0) {
    return null;
  }

  const serialized = JSON.stringify(pages);
  return new Blob([serialized]).size <= maxBytes ? serialized : null;
}
