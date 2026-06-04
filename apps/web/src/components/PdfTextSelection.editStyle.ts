import type { RenderedTextItem } from "./PdfViewer.types";

export interface EditStyleSnapshot {
  patchFontSize: number;
  patchFontFamily: string;
  patchFontWeight: string;
  patchFontStyle: string;
  patchTextColorMode: string;
  customTextColorInput: string;
  maskColor: string;
  customColorInput: string;
}

export interface EditStyleResolutionInput {
  pageNumber: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  matchedItems: RenderedTextItem[];
  layerEl?: HTMLDivElement | null;
  imageUrl?: string;
  fallbackFontSize?: number;
  fallbackFontFamily?: string;
  fallbackFontWeight?: string;
  fallbackFontStyle?: string;
  fallbackTextColor?: string;
}

export async function resolveEditStyleSnapshot({
  rects,
  matchedItems,
  layerEl,
  imageUrl,
  fallbackFontSize,
  fallbackFontFamily,
  fallbackFontWeight,
  fallbackFontStyle,
  fallbackTextColor,
}: EditStyleResolutionInput): Promise<EditStyleSnapshot> {
  const matchedFontSize = matchedItems.length > 0 ? Math.max(...matchedItems.map((item) => item.fontSize)) : 0;
  const resolvedFontSize = matchedFontSize > 8
    ? matchedFontSize
    : fallbackFontSize && fallbackFontSize > 8
      ? fallbackFontSize
      : 14;

  const bestSpan = findBestSpan(layerEl, rects);
  const spanStyle = bestSpan ? window.getComputedStyle(bestSpan) : null;

  const detectedFontFamily = (spanStyle?.fontFamily || fallbackFontFamily || matchedItems[0]?.fontName || "Helvetica, Arial, sans-serif").trim();
  const detectedFontWeight = normalizeFontWeight(
    spanStyle?.fontWeight || fallbackFontWeight || (matchedItems[0] as any)?.fontWeight || "normal",
  );
  const detectedFontStyle = normalizeFontStyle(
    spanStyle?.fontStyle || fallbackFontStyle || (matchedItems[0] as any)?.fontStyle || "normal",
  );

  const { detectedBgColor: sampledBgColor, detectedTextColor: sampledTextColor } = await sampleColorsFromImage(imageUrl, rects);
  const detectedTextColor = normalizeCssColor(
    sampledTextColor
      || spanStyle?.color
      || fallbackTextColor
      || (matchedItems[0] as any)?.textColor
      || "black",
  );
  const detectedBgColor = normalizeCssColor(
    sampledBgColor
      || (spanStyle && !isTransparentColor(spanStyle.backgroundColor) ? spanStyle.backgroundColor : "")
      || "white",
  );

  return {
    patchFontSize: resolvedFontSize,
    patchFontFamily: detectedFontFamily,
    patchFontWeight: detectedFontWeight,
    patchFontStyle: detectedFontStyle,
    patchTextColorMode: colorToMode(detectedTextColor),
    customTextColorInput: colorToHex(detectedTextColor),
    maskColor: colorToMode(detectedBgColor),
    customColorInput: colorToHex(detectedBgColor),
  };
}

function findBestSpan(layerEl: HTMLDivElement | null | undefined, rects: Array<{ x: number; y: number; width: number; height: number }>) {
  if (!layerEl || rects.length === 0) return null;

  const layerBounds = layerEl.getBoundingClientRect();
  const spans = Array.from(layerEl.querySelectorAll("span"));
  let bestSpan: HTMLSpanElement | null = null;
  let bestOverlap = 0;

  for (const span of spans) {
    const spanRect = span.getBoundingClientRect();
    const localSpan = {
      x: (spanRect.left - layerBounds.left) / layerBounds.width,
      y: (spanRect.top - layerBounds.top) / layerBounds.height,
      width: spanRect.width / layerBounds.width,
      height: spanRect.height / layerBounds.height,
    };

    for (const rect of rects) {
      const xOverlap = Math.max(0, Math.min(rect.x + rect.width, localSpan.x + localSpan.width) - Math.max(rect.x, localSpan.x));
      const yOverlap = Math.max(0, Math.min(rect.y + rect.height, localSpan.y + localSpan.height) - Math.max(rect.y, localSpan.y));
      const overlap = xOverlap * yOverlap;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpan = span;
      }
    }
  }

  return bestSpan;
}

async function sampleColorsFromImage(
  imageUrl: string | undefined,
  rects: Array<{ x: number; y: number; width: number; height: number }>,
): Promise<{ detectedBgColor: string; detectedTextColor: string }> {
  const fallback = { detectedBgColor: "", detectedTextColor: "" };
  if (!imageUrl || rects.length === 0) return fallback;

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0);

    const union = rects.reduce(
      (acc, rect) => ({
        minX: Math.min(acc.minX, rect.x),
        minY: Math.min(acc.minY, rect.y),
        maxX: Math.max(acc.maxX, rect.x + rect.width),
        maxY: Math.max(acc.maxY, rect.y + rect.height),
      }),
      { minX: 1, minY: 1, maxX: 0, maxY: 0 },
    );

    const pxX = Math.round(union.minX * img.naturalWidth);
    const pxY = Math.round(union.minY * img.naturalHeight);
    const pxW = Math.round((union.maxX - union.minX) * img.naturalWidth);
    const pxH = Math.round((union.maxY - union.minY) * img.naturalHeight);
    const gapX = Math.max(4, Math.round(pxW * 0.12));
    const gapY = Math.max(4, Math.round(pxH * 0.18));

    const samplePoints = [
      { x: pxX - gapX, y: pxY - gapY },
      { x: pxX + pxW + gapX, y: pxY - gapY },
      { x: pxX - gapX, y: pxY + pxH + gapY },
      { x: pxX + pxW + gapX, y: pxY + pxH + gapY },
      { x: pxX + Math.round(pxW / 2), y: pxY - gapY },
      { x: pxX + Math.round(pxW / 2), y: pxY + pxH + gapY },
    ];

    const rgbTotals = [0, 0, 0];
    let count = 0;
    for (const point of samplePoints) {
      if (point.x < 0 || point.y < 0 || point.x >= canvas.width || point.y >= canvas.height) continue;
      const px = ctx.getImageData(point.x, point.y, 1, 1).data;
      rgbTotals[0] += px[0];
      rgbTotals[1] += px[1];
      rgbTotals[2] += px[2];
      count += 1;
    }

    const detectedBgColor = count
      ? rgbToHex(
      Math.round(rgbTotals[0] / count),
      Math.round(rgbTotals[1] / count),
      Math.round(rgbTotals[2] / count),
      )
      : "";

    const textColor = detectForegroundColor(ctx, canvas, rects, detectedBgColor);
    return { detectedBgColor, detectedTextColor: textColor };
  } catch {
    return fallback;
  }
}

function detectForegroundColor(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  detectedBgColor: string,
) {
  const bgRgb = hexToRgb(detectedBgColor);
  const union = rects.reduce(
    (acc, rect) => ({
      minX: Math.min(acc.minX, rect.x),
      minY: Math.min(acc.minY, rect.y),
      maxX: Math.max(acc.maxX, rect.x + rect.width),
      maxY: Math.max(acc.maxY, rect.y + rect.height),
    }),
    { minX: 1, minY: 1, maxX: 0, maxY: 0 },
  );

  const pxX = Math.max(0, Math.round(union.minX * canvas.width));
  const pxY = Math.max(0, Math.round(union.minY * canvas.height));
  const pxW = Math.max(1, Math.round((union.maxX - union.minX) * canvas.width));
  const pxH = Math.max(1, Math.round((union.maxY - union.minY) * canvas.height));

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(pxX, pxY, pxW, pxH);
  } catch {
    return "";
  }

  const colorCounts = new Map<string, number>();
  const threshold = bgRgb ? 72 : 96;
  for (let i = 0; i < imageData.data.length; i += 4) {
    const a = imageData.data[i + 3];
    if (a < 32) continue;

    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    if (bgRgb && colorDistance([r, g, b], bgRgb) < threshold) {
      continue;
    }

    const qr = Math.round(r / 16) * 16;
    const qg = Math.round(g / 16) * 16;
    const qb = Math.round(b / 16) * 16;
    const key = `${qr},${qg},${qb}`;
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  }

  if (colorCounts.size === 0) {
    if (bgRgb) {
      const bgBrightness = brightness(bgRgb);
      return bgBrightness < 128 ? "#ffffff" : "#000000";
    }
    return "";
  }

  let bestKey = "";
  let bestCount = -1;
  let bestBrightness = 999;
  for (const [key, count] of colorCounts.entries()) {
    const rgb = key.split(",").map(Number) as [number, number, number];
    const currentBrightness = brightness(rgb);
    if (count > bestCount || (count === bestCount && currentBrightness < bestBrightness)) {
      bestKey = key;
      bestCount = count;
      bestBrightness = currentBrightness;
    }
  }

  const [r, g, b] = bestKey.split(",").map(Number);
  return rgbToHex(r, g, b);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function colorToMode(color: string) {
  const hex = colorToHex(color);
  if (hex === "#000000") return "black";
  if (hex === "#ffffff") return "white";
  return "custom";
}

function normalizeFontWeight(raw: string) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "normal";
  return String(raw).trim();
}

function normalizeFontStyle(raw: string) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "normal";
  return String(raw).trim();
}

function normalizeCssColor(raw: string) {
  const hex = colorToHex(raw);
  return hex || raw || "#ffffff";
}

function colorToHex(raw: string) {
  if (!raw) return "";
  const value = raw.trim().toLowerCase();
  if (value === "transparent") return "";
  if (value === "black") return "#000000";
  if (value === "white") return "#ffffff";
  if (value.startsWith("#")) {
    if (value.length === 4) {
      const [r, g, b] = value.slice(1).split("");
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (value.length === 7) return value;
  }

  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return "";
  return rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isTransparentColor(raw: string) {
  return !raw || raw.trim().toLowerCase() === "transparent" || /rgba\(.+,\s*0\s*\)$/.test(raw.trim().toLowerCase());
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(raw: string): [number, number, number] | null {
  const hex = colorToHex(raw);
  if (!hex) return null;
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function brightness(rgb: [number, number, number]) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}
