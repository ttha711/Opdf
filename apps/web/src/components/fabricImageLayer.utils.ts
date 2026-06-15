export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function extractGeneratedImageDataUrl(value: unknown): string | null {
  const seen = new Set<unknown>();

  const normalize = (raw: string): string | null => {
    const valueTrimmed = raw.trim();
    if (!valueTrimmed) return null;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(valueTrimmed)) return valueTrimmed;
    if (/^https?:\/\//i.test(valueTrimmed) || /^blob:/i.test(valueTrimmed)) return valueTrimmed;
    if (/^[A-Za-z0-9+/=]+$/.test(valueTrimmed) && valueTrimmed.length >= 16) {
      return `data:image/png;base64,${valueTrimmed}`;
    }
    return null;
  };

  const walk = (input: unknown): string | null => {
    if (input == null || seen.has(input)) return null;
    if (typeof input === "string") return normalize(input);
    if (typeof input !== "object") return null;
    seen.add(input);

    if (Array.isArray(input)) {
      for (const item of input) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    const record = input as Record<string, unknown>;
    const directKeys = ["image", "data_url", "dataUrl", "imageUrl", "image_url", "result", "base64", "b64_json", "url"];
    for (const key of directKeys) {
      const found = walk(record[key]);
      if (found) return found;
    }

    const nestedKeys = ["output", "outputs", "data", "items", "content", "response"];
    for (const key of nestedKeys) {
      const found = walk(record[key]);
      if (found) return found;
    }

    return null;
  };

  return walk(value);
}

export function getDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl.trim());
  return match?.[1] ?? null;
}

export async function cropImageRegionFromUrl(
  imageUrl: string,
  rect: SelectionRect,
  canvasWidth: number,
  canvasHeight: number,
): Promise<string | null> {
  try {
    const img = await loadImage(imageUrl);
    const scaleX = img.naturalWidth / Math.max(1, canvasWidth);
    const scaleY = img.naturalHeight / Math.max(1, canvasHeight);
    const srcX = Math.max(0, Math.floor(rect.left * scaleX));
    const srcY = Math.max(0, Math.floor(rect.top * scaleY));
    const srcW = Math.max(1, Math.ceil(rect.width * scaleX));
    const srcH = Math.max(1, Math.ceil(rect.height * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("[cropImageRegionFromUrl]", error);
    return null;
  }
}

export function toImageLayerPayload(args: {
  rect: SelectionRect;
  canvasWidth: number;
  canvasHeight: number;
  imageDataUrl: string;
  prompt: string;
  selectedRegionImage?: string | null;
  referenceImage?: string | null;
}) {
  const { rect, canvasWidth, canvasHeight, imageDataUrl, prompt, selectedRegionImage, referenceImage } = args;
  const centerX = (rect.left + rect.width / 2) / Math.max(1, canvasWidth);
  const centerY = (rect.top + rect.height / 2) / Math.max(1, canvasHeight);
  return {
    kind: "image" as const,
    x: Math.min(Math.max(centerX, 0), 1),
    y: Math.min(Math.max(centerY, 0), 1),
    width: Math.min(Math.max(rect.width / Math.max(1, canvasWidth), 0), 1),
    height: Math.min(Math.max(rect.height / Math.max(1, canvasHeight), 0), 1),
    angle: 0,
    image: imageDataUrl,
    imageType: getDataUrlMimeType(imageDataUrl)?.split("/")[1] || "png",
    prompt,
    selectedRegionImage: selectedRegionImage ?? undefined,
    referenceImage: referenceImage ?? undefined,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    if (!/^blob:/i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}
