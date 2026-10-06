import type { Bookmark, CropOptions, InsertOptions } from "../types/index.js";

export class PdfStructureService {
  async merge(pdfBytesList: Uint8Array[]): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const outDoc = await module.PDFDocument.create();
    for (const bytes of pdfBytesList) {
      const source = await module.PDFDocument.load(bytes);
      const copiedPages = await outDoc.copyPages(source, source.getPageIndices());
      copiedPages.forEach((page) => outDoc.addPage(page));
    }
    return outDoc.save();
  }

  async split(pdfBytes: Uint8Array, pageIndexes: number[]): Promise<Uint8Array[]> {
    const module = await import("pdf-lib");
    const source = await module.PDFDocument.load(pdfBytes);
    const out: Uint8Array[] = [];
    for (const index of pageIndexes) {
      const child = await module.PDFDocument.create();
      const [copiedPage] = await child.copyPages(source, [index]);
      child.addPage(copiedPage);
      out.push(await child.save());
    }
    return out;
  }

  async reorder(pdfBytes: Uint8Array, order: number[]): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const source = await module.PDFDocument.load(pdfBytes);
    const output = await module.PDFDocument.create();
    const copiedPages = await output.copyPages(source, order);
    copiedPages.forEach((page) => output.addPage(page));
    return output.save();
  }

  async insertPages(pdfBytes: Uint8Array, opts: InsertOptions): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const source = await module.PDFDocument.load(opts.bytes);
    const copiedPages = await doc.copyPages(source, source.getPageIndices());
    let insertAt = opts.targetPage - 1;
    if (opts.position === "after") insertAt += 1;
    copiedPages.forEach((page) => doc.insertPage(insertAt++, page));
    return doc.save();
  }

  async deletePages(pdfBytes: Uint8Array, pageNumbers: number[]): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const toRemove = new Set(pageNumbers.map((n) => n - 1));
    const keep = doc.getPageIndices().filter((i) => !toRemove.has(i));
    if (keep.length === 0) throw new Error("Cannot delete all pages");
    const output = await module.PDFDocument.create();
    const copiedPages = await output.copyPages(doc, keep);
    copiedPages.forEach((page) => output.addPage(page));
    return output.save();
  }

  async cropPage(pdfBytes: Uint8Array, opts: CropOptions): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const page = doc.getPage(opts.page - 1);
    const { width, height } = page.getSize();
    const x = opts.x * width;
    const y = height - (opts.y * height) - (opts.height * height);
    const cropW = opts.width * width;
    const cropH = opts.height * height;
    page.setMediaBox(x, y, cropW, cropH);
    page.setCropBox(x, y, cropW, cropH);
    return doc.save();
  }

  async addBookmarks(pdfBytes: Uint8Array, bookmarks: Bookmark[]): Promise<Uint8Array> {
    if (bookmarks.length === 0) return pdfBytes;
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    const cleaned = bookmarks
      .map((bookmark, originalIndex) => ({
        title: bookmark.title.trim(),
        page: Math.trunc(bookmark.page),
        originalIndex,
        parent: Number.isInteger(bookmark.parent) ? bookmark.parent : undefined,
      }))
      .filter((bookmark) => bookmark.title && bookmark.page >= 1 && bookmark.page <= pages.length);
    if (cleaned.length === 0) return pdfBytes;

    const originalToClean = new Map<number, number>();
    cleaned.forEach((bookmark, index) => originalToClean.set(bookmark.originalIndex, index));
    const normalized = cleaned.map((bookmark, index) => {
      const parentIndex = bookmark.parent === undefined ? undefined : originalToClean.get(bookmark.parent);
      return {
        ...bookmark,
        parent: parentIndex !== undefined && parentIndex >= 0 && parentIndex < index
          ? parentIndex
          : undefined,
      };
    });

    const context = doc.context;
    const outlinesRef = context.nextRef();
    const itemRefs = normalized.map(() => context.nextRef());
    const rootChildren: number[] = [];
    const childMap = new Map<number, number[]>();

    normalized.forEach((bookmark, index) => {
      if (bookmark.parent === undefined) {
        rootChildren.push(index);
        return;
      }
      const list = childMap.get(bookmark.parent) ?? [];
      list.push(index);
      childMap.set(bookmark.parent, list);
    });

    normalized.forEach((bookmark, index) => {
      const siblings = bookmark.parent === undefined
        ? rootChildren
        : (childMap.get(bookmark.parent) ?? []);
      const siblingIndex = siblings.indexOf(index);
      const ownChildren = childMap.get(index) ?? [];
      const destination = context.obj([pages[bookmark.page - 1].ref, module.PDFName.of("Fit")]);
      context.assign(itemRefs[index], context.obj({
        Title: module.PDFString.of(bookmark.title),
        Parent: bookmark.parent === undefined ? outlinesRef : itemRefs[bookmark.parent],
        Dest: destination,
        ...(siblingIndex > 0 ? { Prev: itemRefs[siblings[siblingIndex - 1]] } : {}),
        ...(siblingIndex >= 0 && siblingIndex < siblings.length - 1
          ? { Next: itemRefs[siblings[siblingIndex + 1]] }
          : {}),
        ...(ownChildren.length > 0
          ? {
              First: itemRefs[ownChildren[0]],
              Last: itemRefs[ownChildren[ownChildren.length - 1]],
              Count: module.PDFNumber.of(ownChildren.length),
            }
          : {}),
      }));
    });

    context.assign(outlinesRef, context.obj({
      Type: module.PDFName.of("Outlines"),
      First: itemRefs[rootChildren[0]],
      Last: itemRefs[rootChildren[rootChildren.length - 1]],
      Count: module.PDFNumber.of(normalized.length),
    }));
    doc.catalog.set(module.PDFName.of("Outlines"), outlinesRef);
    doc.catalog.set(module.PDFName.of("PageMode"), module.PDFName.of("UseOutlines"));
    return doc.save();
  }

  async rotatePages(pdfBytes: Uint8Array, pageNumbers: number[], degrees: number): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    for (const pn of pageNumbers) {
      const page = doc.getPage(pn - 1);
      page.setRotation(module.degrees(page.getRotation().angle + degrees));
    }
    return doc.save();
  }
}
