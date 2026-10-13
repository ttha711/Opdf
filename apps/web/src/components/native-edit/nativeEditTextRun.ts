import type { PdfContentObject, PdfMatrix, PdfPoint, PdfQuad } from "@tpdf/core";
import { multiplyMatrices } from "../../lib/pdfiumObjectTree";

export type NativeEditTextRun = {
  object: PdfContentObject;
  objectIds: string[];
  lines: NativeEditTextLine[];
};

export type NativeEditTextLine = {
  object: PdfContentObject;
  objectIds: string[];
};

type TextFrame = {
  matrix: PdfMatrix;
  direction: PdfPoint;
  normal: PdfPoint;
  baseline: number;
  angle: number;
};

type TextProjection = {
  start: number;
  end: number;
  crossStart: number;
  crossEnd: number;
};

const LINE_BASELINE_BUCKET_SIZE = 16;
const LINE_ANGLE_BUCKET_SIZE = 0.025;

function frameFor(object: PdfContentObject): TextFrame {
  const matrix = object.parentMatrix
    ? multiplyMatrices(object.parentMatrix, object.matrix)
    : object.matrix;
  const magnitude = Math.hypot(matrix[0], matrix[1]);
  const direction = magnitude > 0.0001
    ? { x: matrix[0] / magnitude, y: matrix[1] / magnitude }
    : { x: 1, y: 0 };
  const normal = { x: -direction.y, y: direction.x };
  return {
    matrix,
    direction,
    normal,
    baseline: matrix[4] * normal.x + matrix[5] * normal.y,
    angle: Math.atan2(direction.y, direction.x),
  };
}

function visualTextSize(object: PdfContentObject) {
  return Math.max(1, object.fontSize ?? 0, object.bounds.height);
}

export function createNativeEditTextRunCandidateLookup(objects: PdfContentObject[]) {
  const bins = new Map<string, PdfContentObject[]>();
  const angleBuckets = Math.ceil(Math.PI * 2 / LINE_ANGLE_BUCKET_SIZE);
  const bucketFor = (object: PdfContentObject) => {
    const frame = frameFor(object);
    return {
      angle: Math.floor((frame.angle + Math.PI) / LINE_ANGLE_BUCKET_SIZE) % angleBuckets,
      baseline: Math.floor(frame.baseline / LINE_BASELINE_BUCKET_SIZE),
    };
  };
  for (const object of objects) {
    if (object.kind !== "text") continue;
    const { angle, baseline } = bucketFor(object);
    const key = `${object.pageIndex}:${angle}:${baseline}`;
    const bucket = bins.get(key) ?? [];
    bucket.push(object);
    bins.set(key, bucket);
  }
  return (target: PdfContentObject) => {
    const { angle, baseline } = bucketFor(target);
    const radius = Math.ceil(Math.max(64, visualTextSize(target) * 2.5) / LINE_BASELINE_BUCKET_SIZE) + 1;
    const candidates = new Map<string, PdfContentObject>();
    for (let angleOffset = -1; angleOffset <= 1; angleOffset += 1) {
      const nearbyAngle = (angle + angleOffset + angleBuckets) % angleBuckets;
      for (let baselineOffset = -radius; baselineOffset <= radius; baselineOffset += 1) {
        const key = `${target.pageIndex}:${nearbyAngle}:${baseline + baselineOffset}`;
        for (const candidate of bins.get(key) ?? []) candidates.set(candidate.id, candidate);
      }
    }
    return [...candidates.values()];
  };
}

function baselineTolerance(a: PdfContentObject, b: PdfContentObject) {
  return Math.max(1.5, Math.min(visualTextSize(a), visualTextSize(b)) * 0.35);
}

function sameTextLine(a: PdfContentObject, b: PdfContentObject) {
  if (a.pageIndex !== b.pageIndex || a.kind !== "text" || b.kind !== "text") return false;
  const frameA = frameFor(a);
  const frameB = frameFor(b);
  const angleDelta = Math.atan2(Math.sin(frameA.angle - frameB.angle), Math.cos(frameA.angle - frameB.angle));
  return Math.abs(angleDelta) < 0.025
    && Math.abs(frameA.baseline - frameB.baseline) <= baselineTolerance(a, b);
}

function objectPoints(object: PdfContentObject): PdfPoint[] {
  if (object.rotatedBounds?.length === 4) return object.rotatedBounds;
  const { x, y, width, height } = object.bounds;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function projectObject(object: PdfContentObject, frame: TextFrame): TextProjection {
  const points = objectPoints(object);
  const along = points.map((point) => point.x * frame.direction.x + point.y * frame.direction.y);
  const across = points.map((point) => point.x * frame.normal.x + point.y * frame.normal.y);
  return {
    start: Math.min(...along),
    end: Math.max(...along),
    crossStart: Math.min(...across),
    crossEnd: Math.max(...across),
  };
}

function gapBetween(left: PdfContentObject, right: PdfContentObject, frame: TextFrame) {
  return projectObject(right, frame).start - projectObject(left, frame).end;
}

function canJoin(left: PdfContentObject, right: PdfContentObject) {
  if (!sameTextLine(left, right)) return false;
  const frame = frameFor(left);
  const gap = gapBetween(left, right, frame);
  const size = Math.max(visualTextSize(left), visualTextSize(right));
  return gap >= -Math.min(12, size * 0.5)
    && gap <= Math.max(8, Math.min(16, size * 0.5));
}

function unionTextRun(run: PdfContentObject[], frame: TextFrame) {
  const projections = run.map((object) => projectObject(object, frame));
  const minAlong = Math.min(...projections.map((item) => item.start));
  const maxAlong = Math.max(...projections.map((item) => item.end));
  const minAcross = Math.min(...projections.map((item) => item.crossStart));
  const maxAcross = Math.max(...projections.map((item) => item.crossEnd));
  const point = (along: number, across: number): PdfPoint => ({
    x: frame.direction.x * along + frame.normal.x * across,
    y: frame.direction.y * along + frame.normal.y * across,
  });
  const rotatedBounds: PdfQuad = [
    point(minAlong, maxAcross),
    point(maxAlong, maxAcross),
    point(maxAlong, minAcross),
    point(minAlong, minAcross),
  ];
  const xs = rotatedBounds.map((item) => item.x);
  const ys = rotatedBounds.map((item) => item.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    rotatedBounds,
  };
}

export function nativeEditTextRun(
  objects: PdfContentObject[],
  target: PdfContentObject,
  lineCandidates?: PdfContentObject[],
): NativeEditTextRun {
  const single = (object: PdfContentObject): NativeEditTextRun => ({
    object, objectIds: [object.id], lines: [{ object, objectIds: [object.id] }],
  });
  if (target.kind !== "text" || !target.text) return single(target);
  const candidates = lineCandidates ?? createNativeEditTextRunCandidateLookup(objects)(target);
  const lines = buildTextLines(candidates);
  const targetLine = lines.find((line) => line.objectIds.includes(target.id));
  if (!targetLine) return single(target);

  const paragraph = new Set<NativeEditTextLine>([targetLine]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of lines) {
      if (paragraph.has(candidate)) continue;
      if ([...paragraph].some((line) => canJoinParagraphLines(line, candidate))) {
        paragraph.add(candidate);
        changed = true;
      }
    }
  }
  const textLines = [...paragraph].sort((a, b) => {
    const frame = frameFor(a.object);
    const baselineA = frame.baseline;
    const baselineB = frameFor(b.object).baseline;
    // PDFium page coordinates increase upward, so positive vertical normals read downward.
    return (baselineA - baselineB) * -Math.sign(frame.normal.y || 1);
  });
  if (textLines.length === 1 && textLines[0].objectIds.length === 1) return single(target);
  const run = textLines.flatMap((line) => line.objectIds.map((id) =>
    candidates.find((item) => item.id === id)).filter((item): item is PdfContentObject => Boolean(item)));
  const frame = frameFor(targetLine.object);
  const bounds = unionTextRun(run, frame);
  return {
    object: {
      ...textLines[0].object,
      id: textLines[0].object.id,
      text: textLines.map((line) => line.object.text ?? "").join("\n"),
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      rotatedBounds: bounds.rotatedBounds,
      localBounds: undefined,
    },
    objectIds: textLines.flatMap((line) => line.objectIds),
    lines: textLines,
  };
}

function buildTextLines(objects: PdfContentObject[]): NativeEditTextLine[] {
  const assigned = new Set<string>();
  const result: NativeEditTextLine[] = [];
  for (const seed of objects) {
    if (seed.kind !== "text" || !seed.text || assigned.has(seed.id)) continue;
    const frame = frameFor(seed);
    const row = objects.filter((item) => !assigned.has(item.id) && sameTextLine(seed, item))
      .sort((a, b) => projectObject(a, frame).start - projectObject(b, frame).start);
    row.forEach((item) => assigned.add(item.id));
    let current: PdfContentObject[] = [];
    for (const item of row) {
      if (current.length && !canJoin(current[current.length - 1], item)) {
        result.push(createTextLine(current));
        current = [];
      }
      current.push(item);
    }
    if (current.length) result.push(createTextLine(current));
  }
  return result;
}

function createTextLine(run: PdfContentObject[]): NativeEditTextLine {
  const frame = frameFor(run[0]);
  const text = run.reduce((value, item, index) => {
    const raw = item.text ?? "";
    const fragment = raw.trim();
    if (!fragment) return value;
    if (!value) return fragment;
    const previous = run[index - 1];
    const hasSpace = /\s$/.test(previous?.text ?? "") || /^\s/.test(raw);
    const needsSpace = hasSpace || gapBetween(previous, item, frame) > visualTextSize(run[0]) * 0.25;
    return `${value.trimEnd()}${needsSpace ? " " : ""}${fragment}`;
  }, "");
  const bounds = unionTextRun(run, frame);
  return {
    object: {
      ...run[0], text,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      rotatedBounds: bounds.rotatedBounds,
      localBounds: undefined,
    },
    objectIds: run.map((item) => item.id),
  };
}

function canJoinParagraphLines(a: NativeEditTextLine, b: NativeEditTextLine) {
  const frame = frameFor(a.object);
  const frameB = frameFor(b.object);
  const angle = Math.atan2(Math.sin(frame.angle - frameB.angle), Math.cos(frame.angle - frameB.angle));
  if (Math.abs(angle) >= 0.025) return false;
  const first = projectObject(a.object, frame);
  const second = projectObject(b.object, frame);
  const height = Math.max(first.crossEnd - first.crossStart, second.crossEnd - second.crossStart);
  const centerA = (first.crossStart + first.crossEnd) / 2;
  const centerB = (second.crossStart + second.crossEnd) / 2;
  const centerGap = Math.abs(centerA - centerB);
  if (centerGap < height * 0.55 || centerGap > height * 1.8) return false;
  const gap = Math.max(0, Math.max(first.crossStart, second.crossStart) - Math.min(first.crossEnd, second.crossEnd));
  if (gap > height * 0.45) return false;
  const fontA = Math.max(1, a.object.fontSize ?? 0);
  const fontB = Math.max(1, b.object.fontSize ?? 0);
  if (Math.min(fontA, fontB) / Math.max(fontA, fontB) < 0.65) return false;
  const alignment = Math.max(4, height * 0.6);
  const alignedStart = Math.abs(first.start - second.start) <= alignment;
  const alignedEnd = Math.abs(first.end - second.end) <= alignment;
  const overlap = Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start));
  const minWidth = Math.min(first.end - first.start, second.end - second.start);
  return alignedStart || alignedEnd || (minWidth > 0 && overlap / minWidth >= 0.55);
}
