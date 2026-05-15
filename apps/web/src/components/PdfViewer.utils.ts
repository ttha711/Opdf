import type { Annotation } from "@opdf/core";

export function getNormalizedRect(container: HTMLDivElement, clientX: number, clientY: number) {
  const bounds = container.getBoundingClientRect();
  const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
  const y = Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1);
  return { x, y };
}

export function normalizeUsableRect(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width < 0.005 ? 0 : rect.width,
    height: rect.height < 0.005 ? 0 : rect.height,
  };
}

export function isRenderingCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export function drawAnnotationsToCanvas(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  page: number,
  width: number,
  height: number
) {
  const pageAnns = annotations.filter((a) => a.page === page);
  for (const ann of pageAnns) {
    const payload = ann.payload as any;
    if (!payload) continue;

    const { x, y, width: w, height: h, color, stroke, opacity } = payload;
    const absX = (x || 0) * width;
    const absY = (y || 0) * height;
    const absW = (w || 0) * width;
    const absH = (h || 0) * height;

    ctx.save();
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;

    if (ann.kind === "highlight") {
      ctx.fillStyle = color || "#facc15";
      ctx.globalAlpha = opacity !== undefined ? opacity : 0.4;
      ctx.fillRect(absX, absY, absW, absH);
    } else if (ann.kind === "shape") {
      ctx.strokeStyle = stroke || "#ef4444";
      ctx.lineWidth = Math.max(1, 2 * (width / 200));
      ctx.strokeRect(absX, absY, absW, absH);
    } else if (ann.kind === "redact") {
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 1;
      ctx.fillRect(absX, absY, absW, absH);
    }
    ctx.restore();
  }
}
