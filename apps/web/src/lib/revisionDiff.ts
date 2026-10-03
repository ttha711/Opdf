import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type DiffAlignment = {
  dx: number;
  dy: number;
  score: number;
};

export type DiffRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  tiles: number;
};

export type RevisionReportInput = {
  baseFileName: string;
  revisionFileName: string;
  page: number;
  threshold: number;
  alignment: DiffAlignment;
  regions: DiffRegion[];
};

function deltaAt(base: RgbaImage, revision: RgbaImage, x: number, y: number, dx: number, dy: number) {
  const rx = x + dx;
  const ry = y + dy;
  if (rx < 0 || ry < 0 || rx >= revision.width || ry >= revision.height) return 255;
  const bi = (y * base.width + x) * 4;
  const ri = (ry * revision.width + rx) * 4;
  return (
    Math.abs(base.data[bi] - revision.data[ri]) +
    Math.abs(base.data[bi + 1] - revision.data[ri + 1]) +
    Math.abs(base.data[bi + 2] - revision.data[ri + 2])
  ) / 3;
}

export function estimateTranslation(
  base: RgbaImage,
  revision: RgbaImage,
  maxShift = 12,
  sampleStep = 10,
): DiffAlignment {
  if (base.width !== revision.width || base.height !== revision.height) {
    return { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };
  }

  let best: DiffAlignment = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };
  const margin = maxShift + 2;

  for (let dy = -maxShift; dy <= maxShift; dy += 2) {
    for (let dx = -maxShift; dx <= maxShift; dx += 2) {
      let sum = 0;
      let count = 0;
      for (let y = margin; y < base.height - margin; y += sampleStep) {
        for (let x = margin; x < base.width - margin; x += sampleStep) {
          sum += deltaAt(base, revision, x, y, dx, dy);
          count += 1;
        }
      }
      const score = count > 0 ? sum / count : Number.POSITIVE_INFINITY;
      if (score < best.score) best = { dx, dy, score };
    }
  }

  return best;
}

export function detectDiffRegions(
  base: RgbaImage,
  revision: RgbaImage,
  threshold = 34,
  alignment: DiffAlignment = { dx: 0, dy: 0, score: 0 },
  tileSize = 18,
  minTiles = 2,
): DiffRegion[] {
  if (base.width !== revision.width || base.height !== revision.height) return [];

  const cols = Math.ceil(base.width / tileSize);
  const rows = Math.ceil(base.height / tileSize);
  const changed = new Uint8Array(cols * rows);
  const scores = new Float32Array(cols * rows);

  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const startX = tx * tileSize;
      const startY = ty * tileSize;
      const endX = Math.min(base.width, startX + tileSize);
      const endY = Math.min(base.height, startY + tileSize);
      let sum = 0;
      let count = 0;
      for (let y = startY; y < endY; y += 3) {
        for (let x = startX; x < endX; x += 3) {
          sum += deltaAt(base, revision, x, y, alignment.dx, alignment.dy);
          count += 1;
        }
      }
      const score = count > 0 ? sum / count : 0;
      const index = ty * cols + tx;
      scores[index] = score;
      if (score >= threshold) changed[index] = 1;
    }
  }

  const visited = new Uint8Array(changed.length);
  const regions: DiffRegion[] = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const startIndex = ty * cols + tx;
      if (!changed[startIndex] || visited[startIndex]) continue;

      const queue: Array<[number, number]> = [[tx, ty]];
      visited[startIndex] = 1;
      let minX = tx;
      let minY = ty;
      let maxX = tx;
      let maxY = ty;
      let tileCount = 0;
      let scoreTotal = 0;

      while (queue.length) {
        const current = queue.shift();
        if (!current) break;
        const [cx, cy] = current;
        const index = cy * cols + cx;
        tileCount += 1;
        scoreTotal += scores[index];
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        for (const [ox, oy] of neighbors) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (!changed[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queue.push([nx, ny]);
        }
      }

      if (tileCount < minTiles) continue;
      const x = minX * tileSize;
      const y = minY * tileSize;
      const width = Math.min(base.width, (maxX + 1) * tileSize) - x;
      const height = Math.min(base.height, (maxY + 1) * tileSize) - y;
      regions.push({
        id: "change-" + (regions.length + 1),
        x: x / base.width,
        y: y / base.height,
        width: width / base.width,
        height: height / base.height,
        score: scoreTotal / tileCount,
        tiles: tileCount,
      });
    }
  }

  return regions
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((region, index) => ({ ...region, id: "change-" + (index + 1) }));
}

export async function buildRevisionReportPdf(input: RevisionReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const draw = (text: string, size = 10, isBold = false) => {
    page.drawText(text, {
      x: 42,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 7;
  };

  draw("OPDF Revision Comparison Report", 18, true);
  y -= 6;
  draw("Current: " + input.baseFileName, 10);
  draw("Revision: " + input.revisionFileName, 10);
  draw("Page: " + input.page, 10);
  draw("Sensitivity threshold: " + input.threshold, 10);
  draw(
    "Auto alignment: dx " + input.alignment.dx + " px, dy " + input.alignment.dy +
      " px, score " + input.alignment.score.toFixed(1),
    10,
  );
  draw("Detected change regions: " + input.regions.length, 10, true);
  y -= 5;

  input.regions.slice(0, 32).forEach((region, index) => {
    if (y < 70) return;
    const pct = (value: number) => (value * 100).toFixed(1) + "%";
    draw(
      (index + 1) + ". x " + pct(region.x) + ", y " + pct(region.y) +
      ", w " + pct(region.width) + ", h " + pct(region.height) +
      ", score " + region.score.toFixed(1),
      9,
    );
  });

  if (input.regions.length > 32 && y >= 70) {
    draw("... " + (input.regions.length - 32) + " additional regions omitted.", 9);
  }

  page.drawText("Generated locally by OPDF", {
    x: 42,
    y: 30,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  return doc.save();
}
