import type { PdfContentObject } from "@tpdf/core";

const verifiedPages = new WeakMap<Uint8Array, Map<number, PdfContentObject[]>>();

/** Reuse objects already inspected while verifying a freshly edited revision. */
export function rememberVerifiedNativeEditPage(
  bytes: Uint8Array,
  pageIndex: number,
  objects: PdfContentObject[],
) {
  let pages = verifiedPages.get(bytes);
  if (!pages) {
    pages = new Map();
    verifiedPages.set(bytes, pages);
  }
  pages.set(pageIndex, objects);
}

export function takeVerifiedNativeEditPage(bytes: Uint8Array, pageIndex: number) {
  const pages = verifiedPages.get(bytes);
  const objects = pages?.get(pageIndex);
  if (!pages || !objects) return null;
  pages.delete(pageIndex);
  if (pages.size === 0) verifiedPages.delete(bytes);
  return objects;
}
