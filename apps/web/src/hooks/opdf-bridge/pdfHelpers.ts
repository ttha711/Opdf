export async function loadPdfLib() {
  return import("pdf-lib");
}

export async function loadPdfLibWithFontkit() {
  const [pdfLib, fontkit] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit")]);
  return { pdfLib, fontkit: fontkit.default ?? fontkit };
}

let _unicodeFontCache: Uint8Array | null = null;

export async function loadUnicodeFontBytes(): Promise<Uint8Array | null> {
  if (_unicodeFontCache) return _unicodeFontCache;
  try {
    const res = await fetch("/fonts/VietnameseFont.ttf");
    if (!res.ok) return null;
    _unicodeFontCache = new Uint8Array(await res.arrayBuffer());
    return _unicodeFontCache;
  } catch {
    return null;
  }
}

export function parseColor(hex: string, pdfLib: any) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return pdfLib.rgb(0, 0, 0);
  const value = match[1];
  return pdfLib.rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}
