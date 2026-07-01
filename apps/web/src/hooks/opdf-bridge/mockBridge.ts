import type {
  Annotation, AnnotationCreateInput, OcrJob, OpenDocumentResult,
  RecentDocument, SessionSnapshot, PasswordOptions, PageNumbers,
  HeaderFooterLine, CropOptions, InsertOptions,
} from "@opdf/core";
import type { OpdfBridge } from "../../types/opdf";
import { loadPdfLib, loadPdfLibWithFontkit, loadUnicodeFontBytes, parseColor } from "./pdfHelpers";
import { runBrowserOcrWithTextLayer } from "./ocrHelpers";

export function createMockBridge(): OpdfBridge {
  let recents: RecentDocument[] = [];
  let session: SessionSnapshot = {
    activeFilePath: null,
    openTabs: [],
    activeTabIndex: 0,
    updatedAt: Date.now(),
  };
  const annotations = new Map<string, Annotation[]>();
  const undoStacks = new Map<string, Annotation[][]>();
  const redoStacks = new Map<string, Annotation[][]>();
  const lastCommittedGroupKeys = new Map<string, string | null>();
  const ocrJobs = new Map<string, OcrJob>();

  function getGroupKey(payload: Record<string, unknown> | undefined | null) {
    const groupId = payload?.groupId;
    return typeof groupId === "string" && groupId.trim().length > 0 ? groupId : null;
  }

  function toWinAnsiSafeText(value: unknown) {
    const raw = String(value ?? "");
    return raw
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  }

  function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
    const paragraphs = text.split("\n");
    const lines: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) { lines.push(""); continue; }
      let current = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = current + " " + words[i];
        const w = font.widthOfTextAtSize(test, fontSize);
        if (w <= maxWidth) {
          current = test;
        } else {
          lines.push(current);
          current = words[i];
        }
      }
      lines.push(current);
    }
    return lines;
  }

  function renderPatchTextToImage(text: string, opts: {
    width: number; height: number; fontSize: number; lineHeight: number;
    fontFamily: string; fontWeight: string; fontStyle: string;
    textAlign: string; textColor: string; bgColor?: string;
  }): { png: Uint8Array; descentPad: number } | null {
    try {
      const scale = 3;
      const cW = Math.round(opts.width * scale);
      const descentPx = Math.ceil(opts.fontSize * 0.35 * scale);
      const cH = Math.round(opts.height * scale) + descentPx;
      if (cW < 1 || cH < 1) return null;
      const canvas = document.createElement("canvas");
      canvas.width = cW;
      canvas.height = cH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = opts.textColor;
      ctx.font = `${opts.fontStyle} ${opts.fontWeight} ${opts.fontSize * scale}px ${opts.fontFamily}`;
      ctx.textBaseline = "top";
      ctx.textAlign = (opts.textAlign as CanvasTextAlign) || "left";

      const padX = 5 * scale;
      const maxTextW = cW - padX * 2;
      const lines = wrapTextCanvas(ctx, text, maxTextW);
      const lhPx = opts.lineHeight * scale;
      const drawX = opts.textAlign === "center" ? cW / 2
        : opts.textAlign === "right" ? cW - padX
        : padX;

      for (let i = 0; i < lines.length; i++) {
        const ly = 4 * scale + i * lhPx;
        if (ly > cH) break;
        ctx.fillText(lines[i], drawX, ly);
      }

      const dataUrl = canvas.toDataURL("image/png");
      const b64 = dataUrl.split(",")[1];
      const raw = atob(b64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return { png: arr, descentPad: opts.fontSize * 0.35 };
    } catch (e) {
      console.error("[renderPatchTextToImage]", e);
      return null;
    }
  }

  function wrapTextCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const paragraphs = text.split("\n");
    const lines: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) { lines.push(""); continue; }
      let current = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = current + " " + words[i];
        if (ctx.measureText(test).width <= maxWidth) {
          current = test;
        } else {
          lines.push(current);
          current = words[i];
        }
      }
      lines.push(current);
    }
    return lines;
  }

  async function drawNoteTextFallback(page: any, doc: any, pdfLib: any, textVal: string, fs: number, lineH: number, absX: number, absY: number, absW: number, absH: number, payload: any) {
    let textFont;
    let finalText: string;
    try {
      const unicodeFontBytes = await loadUnicodeFontBytes();
      if (unicodeFontBytes) {
        textFont = await doc.embedFont(unicodeFontBytes);
        finalText = textVal;
      } else {
        textFont = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
        finalText = toWinAnsiSafeText(textVal);
      }
    } catch {
      textFont = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
      finalText = toWinAnsiSafeText(textVal);
    }
    const textColor = parseCssColor(payload?.textColor, pdfLib) || pdfLib.rgb(0, 0, 0);
    const maxW = absW - 10;
    const wrappedLines = wrapText(finalText, textFont, fs, maxW);
    const startY = absY + absH - fs - 4;
    for (let li = 0; li < wrappedLines.length; li++) {
      const ly = startY - li * lineH;
      if (ly < absY - lineH) break;
      page.drawText(wrappedLines[li], {
        x: absX + 5,
        y: Math.max(absY, ly),
        size: fs,
        font: textFont,
        color: textColor,
      });
    }
  }

  function parseCssColor(value: unknown, pdfLib: any) {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "transparent" || normalized === "none") return null;

    const named: Record<string, [number, number, number]> = {
      black: [0, 0, 0],
      white: [255, 255, 255],
      red: [255, 0, 0],
      green: [0, 128, 0],
      blue: [0, 0, 255],
      yellow: [255, 255, 0],
      gray: [128, 128, 128],
      grey: [128, 128, 128],
      orange: [255, 165, 0],
      purple: [128, 0, 128],
      pink: [255, 192, 203],
      brown: [165, 42, 42],
      cyan: [0, 255, 255],
      magenta: [255, 0, 255],
    };
    const namedRgb = named[normalized];
    if (namedRgb) return pdfLib.rgb(namedRgb[0] / 255, namedRgb[1] / 255, namedRgb[2] / 255);

    // rgb() / rgba() — produced by sampleColorsFromImage
    const rgbMatch = normalized.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return pdfLib.rgb(Number(rgbMatch[1]) / 255, Number(rgbMatch[2]) / 255, Number(rgbMatch[3]) / 255);
    }

    const hex = normalized.replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return pdfLib.rgb(
        Number.parseInt(hex[0] + hex[0], 16) / 255,
        Number.parseInt(hex[1] + hex[1], 16) / 255,
        Number.parseInt(hex[2] + hex[2], 16) / 255,
      );
    }
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return pdfLib.rgb(
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    );
  }

  function commitSnapshot(documentId: string, groupKey?: string | null) {
    if (groupKey && lastCommittedGroupKeys.get(documentId) === groupKey) {
      return;
    }

    const current = annotations.get(documentId) ?? [];
    const stack = undoStacks.get(documentId) ?? [];
    stack.push(current.map(a => ({ ...a, payload: { ...(a.payload as object) } })));
    if (stack.length > 50) stack.shift();
    undoStacks.set(documentId, stack);
    redoStacks.set(documentId, []);
    lastCommittedGroupKeys.set(documentId, groupKey ?? null);
  }

  return {
    // Browser runtime: these features are stubbed (compress returns input unchanged,
    // encrypt/decrypt/bookmarks/PDF-A throw). Only available on the desktop build.
    capabilities: { compress: false, encrypt: false, bookmarksPersist: false, pdfA: false },
    async openProjectFolder() { return false; },
    async pickAndOpenDocument() { return null; },
    async openDocument(_filePath: string): Promise<OpenDocumentResult> {
      throw new Error("openDocument requires desktop runtime. Use local file input in web dev.");
    },
    async saveDocument() {},
    async exportFlattened(bytes, annotations) {
      console.log("[MockBridge] exportFlattened", bytes.length, annotations.length);
      const { pdfLib, fontkit } = await loadPdfLibWithFontkit();
      const doc = await pdfLib.PDFDocument.load(bytes);
      doc.registerFontkit(fontkit);
      const pages = doc.getPages();
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
        if (!ann.payload || ann.page > pages.length) continue;
        const page = pages[ann.page - 1];
        const { width, height } = page.getSize();
        const { x, y, width: w, height: h, color, stroke, opacity, text, signer, fontSize } = (ann.payload ?? {}) as any;

        const absX = (x || 0) * width;
        const absY = height - (y || 0) * height - (h || 0.05) * height;
        const absW = (w || 0.1) * width;
        const absH = (h || 0.05) * height;

        if (ann.kind === "highlight") {
          page.drawRectangle({
            x: absX, y: absY, width: absW, height: absH,
            color: parseColor(color || "#facc15", pdfLib),
            opacity: opacity || 0.4,
          });
        } else if (ann.kind === "shape") {
          page.drawRectangle({
            x: absX, y: absY, width: absW, height: absH,
            borderColor: parseColor(stroke || "#ef4444", pdfLib),
            borderWidth: 2,
            opacity: opacity || 1,
          });
        } else if (ann.kind === "redact") {
          page.drawRectangle({
            x: absX, y: absY, width: absW, height: absH,
            color: parseCssColor(color || "#000000", pdfLib) || pdfLib.rgb(0, 0, 0),
            opacity: opacity !== undefined ? opacity : 1,
          });
        } else if (ann.kind === "note") {
          const bgColor = parseCssColor(color, pdfLib);
          if (bgColor) {
            page.drawRectangle({
              x: absX, y: absY, width: absW, height: absH,
              color: bgColor,
              opacity: opacity !== undefined ? opacity : 1,
            });
          }
          const payload = ann.payload as any;
          const textVal = String(text || "Note");
          const fs = Math.max(8, Math.min(Number(fontSize) || 14, 64));
          const lineH = fs * 1.2;

          if (payload.isPatch) {
            const imgResult = renderPatchTextToImage(textVal, {
              width: absW, height: absH, fontSize: fs, lineHeight: lineH,
              fontFamily: payload.fontFamily || "Helvetica, Arial, sans-serif",
              fontWeight: payload.fontWeight || "normal",
              fontStyle: payload.fontStyle || "normal",
              textAlign: payload.textAlign || "left",
              textColor: payload.textColor || "black",
              bgColor: color,
            });
            if (imgResult) {
              try {
                const img = await doc.embedPng(imgResult.png);
                const dp = imgResult.descentPad;
                page.drawImage(img, { x: absX, y: absY - dp, width: absW, height: absH + dp });
              } catch (imgErr) {
                console.error("[MockBridge] embedPng failed, falling back to drawText:", imgErr);
                await drawNoteTextFallback(page, doc, pdfLib, textVal, fs, lineH, absX, absY, absW, absH, payload);
              }
            } else {
              await drawNoteTextFallback(page, doc, pdfLib, textVal, fs, lineH, absX, absY, absW, absH, payload);
            }
          } else {
            await drawNoteTextFallback(page, doc, pdfLib, textVal, fs, lineH, absX, absY, absW, absH, payload);
          }
        } else if (ann.kind === "signature") {
          let sigFont;
          let sigText: string;
          try {
            const unicodeFontBytes = await loadUnicodeFontBytes();
            if (unicodeFontBytes) {
              sigFont = await doc.embedFont(unicodeFontBytes);
              sigText = String(signer || "Signature");
            } else {
              sigFont = await doc.embedFont(pdfLib.StandardFonts.TimesRomanItalic);
              sigText = toWinAnsiSafeText(signer || "Signature");
            }
          } catch {
            sigFont = await doc.embedFont(pdfLib.StandardFonts.TimesRomanItalic);
            sigText = toWinAnsiSafeText(signer || "Signature");
          }
          page.drawText(sigText, {
            x: absX,
            y: absY + 5,
            size: 20,
            font: sigFont,
            color: pdfLib.rgb(0, 0, 0.8),
          });
        }
      }
      return doc.save();
    },
    async compressPdf(bytes) {
      console.log("[MockBridge] compressPdf", bytes.length);
      return bytes;
    },
    async watermarkPdf(bytes, text) {
      console.log("[MockBridge] watermarkPdf", bytes.length, text);
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const pages = doc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();
        page.drawText(text, {
          x: width / 4,
          y: height / 2,
          size: 48,
          color: pdfLib.rgb(0.5, 0.5, 0.5),
          opacity: 0.3,
          rotate: pdfLib.degrees(45),
        });
      }

      return doc.save();
    },
    async mergePdfs(bytesList) {
      console.log("[MockBridge] mergePdfs", bytesList.length);
      const pdfLib = await loadPdfLib();
      const outDoc = await pdfLib.PDFDocument.create();

      for (const bytes of bytesList) {
        const source = await pdfLib.PDFDocument.load(bytes);
        const copiedPages = await outDoc.copyPages(source, source.getPageIndices());
        copiedPages.forEach((page) => outDoc.addPage(page));
      }

      return outDoc.save();
    },
    async splitPdf(bytes, pages) {
      console.log("[MockBridge] splitPdf", bytes.length, pages);
      const pdfLib = await loadPdfLib();
      const source = await pdfLib.PDFDocument.load(bytes);
      const out: Uint8Array[] = [];

      for (const index of pages) {
        const child = await pdfLib.PDFDocument.create();
        const [copiedPage] = await child.copyPages(source, [index]);
        child.addPage(copiedPage);
        out.push(await child.save());
      }

      return out;
    },
    async saveDocumentAs() { return null; },
    async saveFile(bytes, defaultName, extensions) {
      console.log("[MockBridge] saveFile", bytes.length, defaultName, extensions);
      return defaultName;
    },
    async getRecent() { return recents; },
    async pushRecent(filePath) {
      recents = [{ filePath, openedAt: Date.now() }, ...recents.filter((r) => r.filePath !== filePath)];
    },
    async restoreSession() { return session; },
    async writeSession(nextSession) { session = nextSession; },
    async listAnnotations(documentId) { return annotations.get(documentId) ?? []; },
    async replaceAnnotations(documentId, next) {
      annotations.set(documentId, next);
      undoStacks.set(documentId, []);
      redoStacks.set(documentId, []);
      lastCommittedGroupKeys.set(documentId, null);
      return next;
    },
    async createAnnotation(documentId, input: AnnotationCreateInput) {
      commitSnapshot(documentId, getGroupKey(input.payload));
      const next: Annotation = {
        id: crypto.randomUUID(),
        kind: input.kind,
        page: input.page,
        payload: input.payload,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const current = annotations.get(documentId) ?? [];
      annotations.set(documentId, [...current, next]);
      return next;
    },
    async deleteAnnotation(documentId, id) {
      const current = annotations.get(documentId) ?? [];
      const target = current.find((a) => a.id === id);
      if (!target) return false;
      const groupKey = getGroupKey(target.payload as Record<string, unknown>);
      commitSnapshot(documentId, groupKey);
      annotations.set(
        documentId,
        groupKey ? current.filter((a) => getGroupKey(a.payload as Record<string, unknown>) !== groupKey) : current.filter((a) => a.id !== id),
      );
      return true;
    },
    async updateAnnotation(documentId, id, payload) {
      const current = annotations.get(documentId) ?? [];
      const index = current.findIndex((a) => a.id === id);
      if (index === -1) return null;
      commitSnapshot(documentId);
      const updated: Annotation = {
        ...current[index],
        payload: { ...(current[index].payload as object), ...payload },
        updatedAt: Date.now(),
      };
      const next = [...current];
      next[index] = updated;
      annotations.set(documentId, next);
      return updated;
    },
    async undoAnnotation(documentId) {
      const stack = undoStacks.get(documentId) ?? [];
      const previous = stack.pop();
      if (!previous) return annotations.get(documentId) ?? [];
      
      const current = annotations.get(documentId) ?? [];
      const redoStack = redoStacks.get(documentId) ?? [];
      redoStack.push(current.map(a => ({ ...a, payload: { ...(a.payload as object) } })));
      redoStacks.set(documentId, redoStack);

      annotations.set(documentId, previous);
      lastCommittedGroupKeys.set(documentId, null);
      return previous;
    },
    async redoAnnotation(documentId) {
      const stack = redoStacks.get(documentId) ?? [];
      const next = stack.pop();
      if (!next) return annotations.get(documentId) ?? [];

      const current = annotations.get(documentId) ?? [];
      const undoStack = undoStacks.get(documentId) ?? [];
      undoStack.push(current.map(a => ({ ...a, payload: { ...(a.payload as object) } })));
      undoStacks.set(documentId, undoStack);

      annotations.set(documentId, next);
      lastCommittedGroupKeys.set(documentId, null);
      return next;
    },
    async enqueueOcr(filePath, language = "eng+vie") {
      const job: OcrJob = { id: crypto.randomUUID(), filePath, language, status: "queued", progress: 0 };
      ocrJobs.set(job.id, job);
      return job;
    },
    async runOcr(jobId, inputBytes) {
      const job = ocrJobs.get(jobId);
      if (!job) return null;
      if (!inputBytes || inputBytes.length === 0) {
        job.status = "failed";
        job.error = "OCR requires loaded PDF bytes.";
        return job;
      }
      job.status = "running";
      job.progress = 5;
      job.error = undefined;
      try {
        const outputBytes = await runBrowserOcrWithTextLayer(inputBytes, job.language, (progress) => {
          job.progress = progress;
        });
        job.outputBytes = outputBytes;
        job.status = "done";
        job.progress = 100;
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "OCR failed";
      }
      return job;
    },
    async listOcrJobs() { return [...ocrJobs.values()]; },

    /* ----- NEW MOCK BRIDGE ----- */
    async encryptPdf(_bytes, _opts: PasswordOptions) {
      throw new Error("Password encryption requires the desktop runtime.");
    },
    async decryptPdf(_bytes, _password: string) {
      throw new Error("Password decryption requires the desktop runtime.");
    },
    async insertPages(bytes, opts: InsertOptions) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const source = await pdfLib.PDFDocument.load(opts.bytes);
      const copiedPages = await doc.copyPages(source, source.getPageIndices());
      let insertAt = Math.max(0, Math.min(doc.getPageCount(), opts.targetPage - 1 + (opts.position === "after" ? 1 : 0)));
      copiedPages.forEach((page) => doc.insertPage(insertAt++, page));
      return doc.save();
    },
    async deletePages(bytes, pageNumbers: number[]) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const toRemove = new Set(pageNumbers.map((n) => n - 1));
      const keep = doc.getPageIndices().filter((index) => !toRemove.has(index));
      if (keep.length === 0) throw new Error("Cannot delete all pages");
      const output = await pdfLib.PDFDocument.create();
      const copiedPages = await output.copyPages(doc, keep);
      copiedPages.forEach((page) => output.addPage(page));
      return output.save();
    },
    async cropPage(bytes, opts: CropOptions) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const page = doc.getPage(opts.page - 1);
      const { width, height } = page.getSize();
      const x = opts.x * width;
      const y = height - opts.y * height - opts.height * height;
      page.setMediaBox(x, y, opts.width * width, opts.height * height);
      page.setCropBox(x, y, opts.width * width, opts.height * height);
      return doc.save();
    },
    async addPageNumbers(bytes, opts: PageNumbers) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const pages = doc.getPages();
      const color = parseColor(opts.fontColor || "#000000", pdfLib);
      const start = Math.max(1, opts.pages?.start ?? 1);
      const end = Math.min(pages.length, opts.pages?.end ?? pages.length);
      let counter = opts.startNumber ?? 1;
      for (let i = start - 1; i < end; i += 1) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const text = `${opts.prefix || ""}${counter}${opts.suffix || ""}`;
        const textWidth = (opts.fontSize || 12) * text.length * 0.45;
        let x = width / 2 - textWidth / 2;
        if (opts.position.includes("left")) x = 40;
        if (opts.position.includes("right")) x = width - 40 - textWidth;
        const y = opts.position.startsWith("top") ? height - 28 : 20;
        page.drawText(text, { x, y, size: opts.fontSize || 12, color });
        counter += 1;
      }
      return doc.save();
    },
    async addHeaderFooter(bytes, lines: HeaderFooterLine[], isHeader: boolean) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const fontSize = line.fontSize || 10;
          const textWidth = fontSize * line.text.length * 0.45;
          let x = width / 2 - textWidth / 2;
          if (line.align === "left") x = 40;
          if (line.align === "right") x = width - 40 - textWidth;
          const y = isHeader ? height - 24 - index * (fontSize + 3) : 18 + index * (fontSize + 3);
          page.drawText(line.text, { x, y, size: fontSize, color: parseColor(line.fontColor || "#555555", pdfLib) });
        }
      }
      return doc.save();
    },
    async addBookmarks(_bytes, _bookmarks) {
      throw new Error("Bookmark outline creation requires a desktop PDF engine that is not bundled yet.");
    },
    async addBatesNumbering(bytes, prefix: string, startNumber: number, suffix = "") {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      const pages = doc.getPages();
      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        const { width } = page.getSize();
        const text = `${prefix}${String(startNumber + i).padStart(6, "0")}${suffix}`;
        page.drawText(text, { x: width - 130, y: 20, size: 8, color: pdfLib.rgb(0, 0, 0) });
      }
      return doc.save();
    },
    async convertToPdfA(_bytes) {
      throw new Error("PDF/A conversion is not available in the browser runtime.");
    },
    async rotatePages(bytes, pageNumbers: number[], degrees: number) {
      const pdfLib = await loadPdfLib();
      const doc = await pdfLib.PDFDocument.load(bytes);
      for (const pageNumber of pageNumbers) {
        const page = doc.getPage(pageNumber - 1);
        page.setRotation(pdfLib.degrees(page.getRotation().angle + degrees));
      }
      return doc.save();
    },
    async showItemInFolder(filePath) {
      console.log("[MockBridge] showItemInFolder", filePath);
    },
  };
}
