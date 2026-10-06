import { PdfFontSupport } from "./pdf-font-support.js";

export class PdfFlattenService {
  constructor(private readonly fonts: PdfFontSupport) {}

  async exportFlattened(pdfBytes: Uint8Array, annotations: any[] = []): Promise<Uint8Array> {
    const module = await import("pdf-lib");
    const doc = await module.PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    let noteFont: any | null | undefined;

    const orderedAnnotations = [...annotations].sort((a, b) => {
      const aPatch = Boolean((a?.payload as any)?.isPatch);
      const bPatch = Boolean((b?.payload as any)?.isPatch);
      if (a.kind === "redact" && b.kind !== "redact") return -1;
      if (a.kind !== "redact" && b.kind === "redact") return 1;
      if (aPatch && !bPatch) return 1;
      if (!aPatch && bPatch) return -1;
      return 0;
    });

    for (const ann of orderedAnnotations) {
      const pageIndex = ann.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const payload = (ann.payload ?? {}) as Record<string, unknown>;
      const uiX = Number(payload.x ?? 0);
      const uiY = Number(payload.y ?? 0);
      const uiW = Number(payload.width ?? 0.1);
      const uiH = Number(payload.height ?? 0.05);
      const x = uiX * width;
      const objW = uiW * width;
      const objH = uiH * height;
      const y = height - (uiY * height) - objH;

      if (ann.kind === "highlight") {
        page.drawRectangle({
          x, y, width: objW, height: objH,
          color: module.rgb(1, 0.8, 0.1),
          opacity: 0.4,
        });
        continue;
      }

      if (ann.kind === "note") {
        if (noteFont === undefined) noteFont = await this.fonts.embedUnicodeFont(doc);
        const rawText = String(payload.text ?? "Note");
        const fontSize = Number(payload.fontSize ?? 16) || 16;
        const textColor = typeof payload.textColor === "string" ? payload.textColor : "#000000";
        const textAlign = payload.isPatch ? "left" : this.fonts.normalizeTextAlign(payload.textAlign);
        const rgb = this.fonts.parseCssColor(textColor, module) ?? module.rgb(0, 0, 0);
        const noteText = noteFont ? rawText : this.fonts.toWinAnsiSafeText(rawText);
        const size = Math.max(8, Math.min(fontSize, 64));
        const lineHeight = Math.max(size * 1.2, size + 2);
        const lines = noteText.split(/\r?\n/);
        let currentY = y + Math.max(2, objH - fontSize - 2);
        for (const line of lines) {
          const lineWidth = noteFont
            ? noteFont.widthOfTextAtSize(line || " ", size)
            : Math.max(1, (line || "").length * size * 0.5);
          const drawX = this.fonts.resolveAlignedTextX(textAlign, x, objW, lineWidth);
          page.drawText(line, {
            x: drawX,
            y: currentY,
            size,
            ...(noteFont ? { font: noteFont } : {}),
            color: rgb,
          });
          currentY -= lineHeight;
        }
        continue;
      }

      if (ann.kind === "shape") {
        page.drawRectangle({
          x, y, width: objW, height: objH,
          borderColor: module.rgb(1, 0, 0),
          borderWidth: 2,
        });
        continue;
      }

      if (ann.kind === "signature") {
        page.drawText(this.fonts.toWinAnsiSafeText(payload.signer ?? "Signature"), {
          x, y: y + objH - 24, size: 24, color: module.rgb(0, 0, 1),
        });
        continue;
      }

      if (ann.kind === "redact") {
        const redactColor = this.fonts.parseCssColor(payload.color, module) ?? module.rgb(0, 0, 0);
        const redactOpacity = typeof payload.opacity === "number" ? payload.opacity : 1;
        page.drawRectangle({
          x, y, width: objW, height: objH,
          color: redactColor,
          opacity: redactOpacity,
        });
        continue;
      }

      if (ann.kind === "image" && payload.image) {
        let base64Data = payload.image as string;
        if (base64Data.startsWith("data:")) base64Data = base64Data.split(",")[1];
        const imgBytes = Buffer.from(base64Data, "base64");
        const embeddedImage = payload.imageType === "jpg" || payload.imageType === "jpeg"
          ? await doc.embedJpg(imgBytes)
          : await doc.embedPng(imgBytes);
        page.drawImage(embeddedImage, { x, y, width: objW, height: objH });
      }
    }

    return doc.save();
  }
}
