import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class PdfFontSupport {
  private unicodeFontCache: Uint8Array | null = null;

  private async loadUnicodeFontBytes(): Promise<Uint8Array | null> {
    if (this.unicodeFontCache) return this.unicodeFontCache;
    try {
      const filename = fileURLToPath(import.meta.url);
      const fontPath = resolve(dirname(filename), "../assets/VietnameseFont.ttf");
      this.unicodeFontCache = new Uint8Array(await readFile(fontPath));
      return this.unicodeFontCache;
    } catch {
      return null;
    }
  }

  toWinAnsiSafeText(value: unknown): string {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7E]/g, "?");
  }

  async embedUnicodeFont(doc: any): Promise<any | null> {
    const fontBytes = await this.loadUnicodeFontBytes();
    if (!fontBytes) return null;
    const fontkitModule = await import("@pdf-lib/fontkit");
    const fontkit = (fontkitModule as any).default ?? fontkitModule;
    doc.registerFontkit(fontkit);
    return doc.embedFont(fontBytes);
  }

  parseCssColor(value: unknown, module: any) {
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
    if (namedRgb) {
      return module.rgb(namedRgb[0] / 255, namedRgb[1] / 255, namedRgb[2] / 255);
    }

    const rgbMatch = normalized.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return module.rgb(Number(rgbMatch[1]) / 255, Number(rgbMatch[2]) / 255, Number(rgbMatch[3]) / 255);
    }

    const hex = normalized.replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return module.rgb(
        Number.parseInt(hex[0] + hex[0], 16) / 255,
        Number.parseInt(hex[1] + hex[1], 16) / 255,
        Number.parseInt(hex[2] + hex[2], 16) / 255,
      );
    }
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return module.rgb(
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    );
  }

  normalizeTextAlign(value: unknown) {
    if (typeof value !== "string") return "left";
    const normalized = value.trim().toLowerCase();
    if (normalized === "start") return "left";
    if (normalized === "end") return "right";
    if (["left", "center", "right", "justify"].includes(normalized)) return normalized;
    return "left";
  }

  resolveAlignedTextX(textAlign: string, x: number, width: number, lineWidth: number) {
    if (textAlign === "center") return x + Math.max(2, (width - lineWidth) / 2);
    if (textAlign === "right") return x + Math.max(2, width - lineWidth - 2);
    return x + 2;
  }

  parseHexColor(hex: string, module: any) {
    return this.parseCssColor(hex, module) ?? module.rgb(0, 0, 0);
  }
}
