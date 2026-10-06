import type { HeaderFooterLine, PageNumbers } from "../types/index.js";
import { PdfFontSupport } from "./pdf-font-support.js";

export class PdfTextMarkupService {
  constructor(private readonly fonts: PdfFontSupport) {}

  async watermarkPdf(pdfBytes: Uint8Array, text: string): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const font = await this.fonts.embedUnicodeFont(doc);
    const drawText = font ? text : this.fonts.toWinAnsiSafeText(text);

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(drawText, {
        x: width / 4,
        y: height / 2,
        size: 48,
        ...(font ? { font } : {}),
        color: module.rgb(0.5, 0.5, 0.5),
        opacity: 0.3,
        rotate: module.degrees(45),
      });
    }
    return doc.save();
  }

  async addPageNumbers(pdfBytes: Uint8Array, opts: PageNumbers): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    const font = await this.fonts.embedUnicodeFont(doc);
    const fontSize = opts.fontSize || 12;
    const color = this.fonts.parseHexColor(opts.fontColor || "#000000", module);
    const pageStart = Math.max(1, opts.pages?.start ?? 1);
    const pageEnd = Math.min(pages.length, opts.pages?.end ?? pages.length);
    let counter = opts.startNumber ?? 1;

    for (let i = pageStart - 1; i < pageEnd; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const rawText = `${opts.prefix || ""}${counter}${opts.suffix || ""}`;
      const text = font ? rawText : this.fonts.toWinAnsiSafeText(rawText);
      const textWidth = font ? font.widthOfTextAtSize(text, fontSize) : fontSize * text.length * 0.45;
      let x = width / 2 - textWidth / 2;
      if (opts.position.includes("left")) x = 40;
      else if (opts.position.includes("right")) x = width - 40 - textWidth;
      const y = opts.position.startsWith("top") ? height - 28 : 20;

      page.drawText(text, {
        x, y,
        size: fontSize,
        ...(font ? { font } : {}),
        color,
      });
      counter++;
    }
    return doc.save();
  }

  async addHeaderFooter(
    pdfBytes: Uint8Array,
    lines: HeaderFooterLine[],
    isHeader: boolean,
  ): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const font = await this.fonts.embedUnicodeFont(doc);

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const fontSize = line.fontSize || 10;
        const color = this.fonts.parseHexColor(line.fontColor || "#555555", module);
        const rawText = line.text;
        const text = font ? rawText : this.fonts.toWinAnsiSafeText(rawText);
        const textWidth = font ? font.widthOfTextAtSize(text, fontSize) : fontSize * text.length * 0.45;
        let x = width / 2 - textWidth / 2;
        if (line.align === "left") x = 40;
        else if (line.align === "right") x = width - 40 - textWidth;
        const y = isHeader
          ? height - 24 - index * (fontSize + 3)
          : 18 + index * (fontSize + 3);
        page.drawText(text, { x, y, size: fontSize, ...(font ? { font } : {}), color });
      }
    }
    return doc.save();
  }

  async addBatesNumbering(
    pdfBytes: Uint8Array,
    prefix: string,
    startNumber: number,
    suffix = "",
  ): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const font = await this.fonts.embedUnicodeFont(doc);
    const color = module.rgb(0, 0, 0);

    for (let i = 0; i < doc.getPages().length; i++) {
      const page = doc.getPages()[i];
      const { width } = page.getSize();
      const rawText = `${prefix}${(startNumber + i).toString().padStart(6, "0")}${suffix}`;
      const text = font ? rawText : this.fonts.toWinAnsiSafeText(rawText);
      page.drawText(text, {
        x: width - 120,
        y: 20,
        size: 8,
        ...(font ? { font } : {}),
        color,
      });
    }
    return doc.save();
  }
}
