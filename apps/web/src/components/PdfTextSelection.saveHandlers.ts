export async function applyEditPatch({
  editTextState,
  editedInputText,
  maskColor,
  customColorInput,
  patchTextColorMode,
  customTextColorInput,
  patchFontSize,
  patchFontFamily,
  patchFontWeight,
  patchFontStyle,
  patchTextAlign,
  width,
  height,
  pageNumber,
  createToolAnnotation,
  onAnnotationUpdated,
}: {
  editTextState: { id?: string; text: string; rects: Array<{ x: number; y: number; width: number; height: number }>; matchedItems?: any[] };
  editedInputText: string;
  maskColor: string;
  customColorInput: string;
  patchTextColorMode?: string;
  customTextColorInput?: string;
  patchFontSize?: number;
  patchFontFamily?: string;
  patchFontWeight?: string;
  patchFontStyle?: string;
  patchTextAlign?: string;
  width: number;
  height: number;
  pageNumber: number;
  createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void>;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
}) {
  const groupId = crypto.randomUUID();
  if (editTextState.id && onAnnotationUpdated) {
    await onAnnotationUpdated(editTextState.id, {
      text: editedInputText,
      color: maskColor === "custom" ? customColorInput : maskColor,
      textColor: patchTextColorMode === "custom" ? customTextColorInput : patchTextColorMode,
      fontSize: patchFontSize,
      fontFamily: patchFontFamily,
      fontWeight: patchFontWeight,
      fontStyle: patchFontStyle,
      textAlign: resolvePatchTextAlign(patchTextAlign, editTextState.matchedItems ?? editTextState.rects),
    });
    return;
  }

  if (!createToolAnnotation) return;
  const targetsToCover = (editTextState.matchedItems && editTextState.matchedItems.length > 0)
    ? editTextState.matchedItems
    : editTextState.rects;

  const { minX, minY, unionW, unionH } = computeUnion(targetsToCover);

  const finalFontSize = computeFontSize(editTextState.matchedItems, unionH, height);
  const finalMaskColor = maskColor === "custom" ? customColorInput : maskColor;

  for (const r of targetsToCover) {
    const { paddedX, paddedY, paddedW, paddedH } = computePaddedRect(r, finalFontSize, height, width);
    await createToolAnnotation("redact", pageNumber, {
      groupId,
      groupType: "text-edit",
      groupLabel: "Sửa text",
      x: paddedX,
      y: paddedY,
      width: paddedW,
      height: paddedH,
      color: finalMaskColor,
      opacity: 1,
    });
  }

  await createToolAnnotation("note", pageNumber, {
    isPatch: true,
    groupId,
    groupType: "text-edit",
    groupLabel: "Sửa text",
    groupSummary: editedInputText,
    text: editedInputText,
    color: finalMaskColor,
    textColor: patchTextColorMode === "custom" ? customTextColorInput : patchTextColorMode,
    fontSize: patchFontSize,
    fontFamily: patchFontFamily,
    fontWeight: patchFontWeight,
    fontStyle: patchFontStyle,
    textAlign: resolvePatchTextAlign(patchTextAlign, targetsToCover),
    x: minX,
    y: minY,
    width: unionW,
    height: unionH,
  });
}

export async function applyRewritePatch({
  rewriteText,
  rewriteResult,
  rewriteRects,
  rewriteMatchedItems,
  maskColor,
  customColorInput,
  patchTextColorMode,
  customTextColorInput,
  patchFontSize,
  patchFontFamily,
  patchFontWeight,
  patchFontStyle,
  width,
  height,
  pageNumber,
  createToolAnnotation,
  imageUrl,
  patchTextAlign,
}: {
  rewriteText: string;
  rewriteResult: string;
  rewriteRects: Array<{ x: number; y: number; width: number; height: number }>;
  rewriteMatchedItems: any[];
  maskColor: string;
  customColorInput: string;
  patchTextColorMode?: string;
  customTextColorInput?: string;
  patchFontSize?: number;
  patchFontFamily?: string;
  patchFontWeight?: string;
  patchFontStyle?: string;
  width: number;
  height: number;
  pageNumber: number;
  createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void>;
  imageUrl?: string;
  patchTextAlign?: string;
}) {
  const groupId = crypto.randomUUID();
  if (!rewriteText || !createToolAnnotation) return;

  const targetsToCover = (rewriteMatchedItems && rewriteMatchedItems.length > 0) ? rewriteMatchedItems : rewriteRects;
  const { minX, minY, unionW, unionH } = computeUnion(targetsToCover);
  const finalFontSize = computeFontSize(rewriteMatchedItems, unionH, height);

  // Sample background and text colors from the rendered page image
  const { detectedBgColor, detectedTextColor } = await sampleColorsFromImage(
    imageUrl, width, height, minX, minY, unionW, unionH
  );

  const finalMaskColor = maskColor === "custom"
    ? customColorInput
    : maskColor || detectedBgColor || "white";
  const finalTextColor = patchTextColorMode === "custom"
    ? customTextColorInput || detectedTextColor || "black"
    : patchTextColorMode || detectedTextColor || "black";

  for (const r of targetsToCover) {
    const { paddedX, paddedY, paddedW, paddedH } = computePaddedRect(r, finalFontSize, height, width);
    await createToolAnnotation("redact", pageNumber, {
      groupId,
      groupType: "text-rewrite",
      groupLabel: "Viết lại text",
      x: paddedX,
      y: paddedY,
      width: paddedW,
      height: paddedH,
      color: finalMaskColor,
      opacity: 1,
    });
  }

  await createToolAnnotation("note", pageNumber, {
    isPatch: true,
    groupId,
    groupType: "text-rewrite",
    groupLabel: "Viết lại text",
    groupSummary: rewriteResult,
    text: rewriteResult,
    color: finalMaskColor,
    textColor: finalTextColor,
    fontSize: patchFontSize || finalFontSize,
    fontFamily: patchFontFamily || "Helvetica, Arial, sans-serif",
    fontWeight: patchFontWeight || "normal",
    fontStyle: patchFontStyle || "normal",
    textAlign: resolvePatchTextAlign(patchTextAlign, targetsToCover),
    x: minX,
    y: minY,
    width: unionW,
    height: unionH,
  });
}

export async function applyTranslatePatch({
  translateText,
  translationResult,
  translateRects,
  translateMatchedItems,
  maskColor,
  customColorInput,
  patchTextColorMode,
  customTextColorInput,
  patchFontSize,
  patchFontFamily,
  patchFontWeight,
  patchFontStyle,
  width,
  height,
  pageNumber,
  createToolAnnotation,
  imageUrl,
  patchTextAlign,
}: {
  translateText: string;
  translationResult: string;
  translateRects: Array<{ x: number; y: number; width: number; height: number }>;
  translateMatchedItems: any[];
  maskColor: string;
  customColorInput: string;
  patchTextColorMode: string;
  customTextColorInput: string;
  patchFontSize: number;
  patchFontFamily: string;
  patchFontWeight: string;
  patchFontStyle: string;
  width: number;
  height: number;
  pageNumber: number;
  createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void>;
  imageUrl?: string;
  patchTextAlign?: string;
}) {
  const groupId = crypto.randomUUID();
  if (!translateText || !createToolAnnotation) return;

  const targetsToCover = (translateMatchedItems && translateMatchedItems.length > 0) ? translateMatchedItems : translateRects;
  const { minX, minY, unionW, unionH } = computeUnion(targetsToCover);
  const finalFontSize = computeFontSize(translateMatchedItems, unionH, height);

  // Sample background and text colors from the rendered page image
  const { detectedBgColor, detectedTextColor } = await sampleColorsFromImage(
    imageUrl, width, height, minX, minY, unionW, unionH
  );

  const finalMaskColor = maskColor === "custom"
    ? customColorInput
    : detectedBgColor || (maskColor || "white");
  const finalTextColor = patchTextColorMode === "custom"
    ? customTextColorInput
    : patchTextColorMode || detectedTextColor || "black";

  for (const r of targetsToCover) {
    const { paddedX, paddedY, paddedW, paddedH } = computePaddedRect(r, finalFontSize, height, width);
    await createToolAnnotation("redact", pageNumber, {
      groupId,
      groupType: "text-translate",
      groupLabel: "Dịch text",
      x: paddedX,
      y: paddedY,
      width: paddedW,
      height: paddedH,
      color: finalMaskColor,
      opacity: 1,
    });
  }

  await createToolAnnotation("note", pageNumber, {
    isPatch: true,
    groupId,
    groupType: "text-translate",
    groupLabel: "Dịch text",
    groupSummary: translationResult,
    text: translationResult,
    color: finalMaskColor,
    textColor: finalTextColor,
    fontSize: patchFontSize || finalFontSize,
    fontFamily: patchFontFamily,
    fontWeight: patchFontWeight,
    fontStyle: patchFontStyle,
    textAlign: resolvePatchTextAlign(patchTextAlign, targetsToCover),
    x: minX,
    y: minY,
    width: unionW,
    height: unionH,
  });
}

function resolvePatchTextAlign(
  explicitTextAlign: string | undefined,
  targets: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const normalized = normalizeTextAlign(explicitTextAlign);
  if (normalized !== "left" || typeof explicitTextAlign === "string") return normalized;
  return inferTextAlignFromRects(targets);
}

function inferTextAlignFromRects(targets: Array<{ x: number; y: number; width: number; height: number }>) {
  if (targets.length < 2) return "left";

  const lines = groupRectsIntoLines(targets);
  if (lines.length < 2) return "left";

  const lefts = lines.map((line) => line.left);
  const centers = lines.map((line) => line.left + line.width / 2);
  const rights = lines.map((line) => line.left + line.width);

  const leftSpread = standardDeviation(lefts);
  const centerSpread = standardDeviation(centers);
  const rightSpread = standardDeviation(rights);
  const bestSpread = Math.min(leftSpread, centerSpread, rightSpread);
  const tolerance = Math.max(0.01, Math.max(...lines.map((line) => line.width)) * 0.02);

  if (bestSpread === centerSpread && centerSpread + tolerance < leftSpread && centerSpread + tolerance < rightSpread) {
    return "center";
  }

  if (bestSpread === rightSpread && rightSpread + tolerance < leftSpread && rightSpread + tolerance < centerSpread) {
    return "right";
  }

  return "left";
}

function groupRectsIntoLines(targets: Array<{ x: number; y: number; width: number; height: number }>) {
  const sorted = [...targets].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<{ left: number; right: number; width: number; top: number }> = [];
  for (const item of sorted) {
    const existing = lines.find((line) => Math.abs(line.top - item.y) <= Math.max(0.01, item.height * 0.5));
    if (existing) {
      existing.left = Math.min(existing.left, item.x);
      existing.right = Math.max(existing.right, item.x + item.width);
      existing.width = existing.right - existing.left;
    } else {
      lines.push({ left: item.x, right: item.x + item.width, width: item.width, top: item.y });
    }
  }
  return lines;
}

function normalizeTextAlign(value: unknown) {
  if (typeof value !== "string") return "left";
  const normalized = value.trim().toLowerCase();
  if (normalized === "start") return "left";
  if (normalized === "end") return "right";
  if (normalized === "left" || normalized === "center" || normalized === "right" || normalized === "justify") {
    return normalized;
  }
  return "left";
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function computeUnion(targets: Array<{ x: number; y: number; width: number; height: number }>) {
  const minX = Math.min(...targets.map(r => r.x));
  const minY = Math.min(...targets.map(r => r.y));
  const maxX = Math.max(...targets.map(r => r.x + r.width));
  const maxY = Math.max(...targets.map(r => r.y + r.height));
  return { minX, minY, unionW: maxX - minX, unionH: maxY - minY };
}

function computeFontSize(matchedItems: any[] | undefined, unionH: number, height: number) {
  const matchedFontSize = (matchedItems && matchedItems.length > 0)
    ? Math.max(...matchedItems.map((item: any) => item.fontSize))
    : 0;
  return matchedFontSize > 8
    ? matchedFontSize
    : Math.round(unionH * height * 0.78) > 8
      ? Math.round(unionH * height * 0.78)
      : 14;
}

function computePaddedRect(r: any, finalFontSize: number, height: number, width: number) {
  const itemFontSize = r.fontSize || finalFontSize || 12;
  const normFontSize = itemFontSize / height;
  const normPaddingTop = normFontSize * 0.20;
  const normPaddingBottom = normFontSize * 0.30;
  const normPaddingX = 4 / width;
  return {
    paddedX: Math.max(0, r.x - normPaddingX),
    paddedY: Math.max(0, r.y - normPaddingTop),
    paddedW: Math.min(1 - (r.x - normPaddingX), r.width + normPaddingX * 2),
    paddedH: Math.min(1 - (r.y - normPaddingTop), r.height + normPaddingTop + normPaddingBottom),
  };
}

/**
 * Sample background and text colors from the rendered page image.
 * - Background: average color sampled from 4 corners just outside the text bounding box
 * - Text: most frequent dark color inside the text area
 */
async function sampleColorsFromImage(
  imageUrl: string | undefined,
  pageWidth: number,
  pageHeight: number,
  normX: number,
  normY: number,
  normW: number,
  normH: number,
): Promise<{ detectedBgColor: string; detectedTextColor: string }> {
  const fallback = { detectedBgColor: "", detectedTextColor: "" };
  if (!imageUrl) return fallback;

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0);

    // Convert normalized coordinates to pixel coordinates
    const pxX = Math.round(normX * pageWidth);
    const pxY = Math.round(normY * pageHeight);
    const pxW = Math.round(normW * pageWidth);
    const pxH = Math.round(normH * pageHeight);

    // Sample background from 4 corners outside the text bounding box
    const sampleGap = Math.max(4, Math.round(pxH * 0.15));
    const sampleR = Math.max(2, Math.round(Math.min(pxW, pxH) * 0.08));

    const bgSamples: number[][] = [];
    const corners = [
      { x: pxX - sampleGap, y: pxY - sampleGap },
      { x: pxX + pxW + sampleGap, y: pxY - sampleGap },
      { x: pxX - sampleGap, y: pxY + pxH + sampleGap },
      { x: pxX + pxW + sampleGap, y: pxY + pxH + sampleGap },
    ];

    for (const corner of corners) {
      const cx = Math.max(0, Math.min(canvas.width - 1, corner.x));
      const cy = Math.max(0, Math.min(canvas.height - 1, corner.y));
      try {
        const pixel = ctx.getImageData(cx, cy, 1, 1).data;
        bgSamples.push([pixel[0], pixel[1], pixel[2]]);
      } catch { /* skip out-of-bounds */ }
    }

    // Average background samples
    let bgR = 255, bgG = 255, bgB = 255;
    if (bgSamples.length > 0) {
      bgR = Math.round(bgSamples.reduce((s, c) => s + c[0], 0) / bgSamples.length);
      bgG = Math.round(bgSamples.reduce((s, c) => s + c[1], 0) / bgSamples.length);
      bgB = Math.round(bgSamples.reduce((s, c) => s + c[2], 0) / bgSamples.length);
    }
    const detectedBgColor = `rgb(${bgR},${bgG},${bgB})`;

    // Sample text color from inside the text area
    const textAreaW = Math.max(1, pxW);
    const textAreaH = Math.max(1, pxH);
    let pixelData: ImageData;
    try {
      pixelData = ctx.getImageData(pxX, pxY, textAreaW, textAreaH);
    } catch {
      return { detectedBgColor, detectedTextColor: "" };
    }

    // Find the most common dark color (text) vs light color (background)
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < pixelData.data.length; i += 4) {
      const r = pixelData.data[i];
      const g = pixelData.data[i + 1];
      const b = pixelData.data[i + 2];
      // Quantize to reduce noise
      const qr = Math.round(r / 24) * 24;
      const qg = Math.round(g / 24) * 24;
      const qb = Math.round(b / 24) * 24;
      const key = `${qr},${qg},${qb}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    // Sort by frequency, pick the darkest among top colors
    const sorted: [string, number][] = [];
    colorCounts.forEach((count, key) => sorted.push([key, count]));
    sorted.sort((a, b) => b[1] - a[1]);
    const topColors = sorted.slice(0, 3);
    
    // Among top 3, pick the darkest one as text color
    let bestTextColor = topColors[0];
    for (const c of topColors) {
      const [r, g, b] = c[0].split(",").map(Number);
      const brightness = r * 0.299 + g * 0.587 + b * 0.114;
      if (brightness < 128) {
        bestTextColor = c;
        break;
      }
    }

    const [tr, tg, tb] = bestTextColor[0].split(",").map(Number);
    const detectedTextColor = `rgb(${tr},${tg},${tb})`;

    return { detectedBgColor, detectedTextColor };
  } catch {
    return fallback;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
