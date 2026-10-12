import { OPS } from "pdfjs-dist";

export type Point = { x: number; y: number };
export type Segment = { a: Point; b: Point };
export type SnapKind = "endpoint" | "midpoint" | "intersection" | "path";
export type SnapOptions = Record<SnapKind, boolean>;
export type SnapHit = { point: Point; kind: SnapKind; distance: number };
type Matrix = [number, number, number, number, number, number];
type PdfOps = { fnArray: number[]; argsArray: any[][] };
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export type Geometry = { segments: Segment[]; truncated: boolean; unsupportedCurves: boolean };

/** Reuse PDF.js parsed operators, without interpreting PDF streams ourselves.
 * Only painted straight paths/rectangles enter snap geometry. Beziers are not
 * treated as straight lines; images and raster scans cannot provide CAD snaps.
 */
export function extractPdfPathSegments(list: PdfOps, limit = 20_000): Geometry {
  const segments: Segment[] = [];
  let matrix: Matrix = [...IDENTITY], pending: Segment[] = [], cursor: Point | null = null;
  let first: Point | null = null, truncated = false, unsupportedCurves = false;
  const stack: Matrix[] = [];
  const push = (a: Point | null, b: Point) => {
    if (a && (a.x !== b.x || a.y !== b.y)) pending.push({ a, b });
  };
  const flush = (paint: boolean) => {
    if (paint) for (const segment of pending) {
      if (segments.length >= limit) { truncated = true; break; }
      segments.push(segment);
    }
    pending = []; cursor = null; first = null;
  };
  for (let index = 0; index < list.fnArray.length; index++) {
    const fn = list.fnArray[index], args = list.argsArray[index] ?? [];
    if (fn === OPS.save) stack.push([...matrix]);
    else if (fn === OPS.restore) { matrix = stack.pop() ?? [...IDENTITY]; flush(false); }
    else if (fn === OPS.transform) matrix = multiply(matrix, args.slice(0, 6) as Matrix);
    else if (fn === OPS.constructPath) {
      const commands = args[0] as number[] | undefined, coords = args[1] as number[] | undefined;
      if (!commands || !coords) continue;
      let offset = 0;
      const get = (): Point => applyMatrix(matrix, { x: Number(coords[offset++]), y: Number(coords[offset++]) });
      for (const command of commands) {
        if (command === OPS.moveTo) { cursor = get(); first = cursor; }
        else if (command === OPS.lineTo) { const next = get(); push(cursor, next); cursor = next; }
        else if (command === OPS.rectangle) {
          const x = Number(coords[offset++]), y = Number(coords[offset++]);
          const w = Number(coords[offset++]), h = Number(coords[offset++]);
          const corners = [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(p => applyMatrix(matrix,p));
          for (let k = 0; k < 4; k++) push(corners[k], corners[(k+1)%4]);
          cursor = corners[0]; first = corners[0];
        } else if (command === OPS.closePath) { if (cursor && first) push(cursor, first); cursor = first; }
        else if (command === OPS.curveTo || command === OPS.curveTo2 || command === OPS.curveTo3) {
          unsupportedCurves = true;
          offset += command === OPS.curveTo ? 6 : 4;
          cursor = null; first = null; // do not snap from a guessed Bezier endpoint
        }
      }
    } else if (fn === OPS.closePath) { if (cursor && first) push(cursor, first); cursor = first; }
    else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fillStroke ||
      fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) flush(true);
    else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) flush(false);
  }
  return { segments, truncated, unsupportedCurves };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function snapToVector(segments: Segment[], near: Point, tolerance: number, options: SnapOptions): SnapHit | null {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || segments.length === 0) return null;
  let best: SnapHit | null = null;
  const penalty: Record<SnapKind, number> = {
    endpoint: 0, intersection: 0, midpoint: tolerance * 0.2, path: tolerance * 0.75,
  };
  const offer = (point: Point, kind: SnapKind) => {
    const d = distance(near, point);
    const score = d + penalty[kind];
    const bestScore = best ? best.distance + penalty[best.kind] : Infinity;
    if (d <= tolerance && (score < bestScore - 0.001 ||
      (Math.abs(score - bestScore) <= 0.001 && kind === "endpoint")))
      best = { point, kind, distance: d };
  };
  const nearby = segments.filter(({a,b}) =>
    near.x >= Math.min(a.x,b.x)-tolerance && near.x <= Math.max(a.x,b.x)+tolerance &&
    near.y >= Math.min(a.y,b.y)-tolerance && near.y <= Math.max(a.y,b.y)+tolerance);
  for (const {a,b} of nearby) {
    if (options.endpoint) { offer(a,"endpoint"); offer(b,"endpoint"); }
    if (options.midpoint) offer({x:(a.x+b.x)/2,y:(a.y+b.y)/2},"midpoint");
    if (options.path) {
      const dx = b.x-a.x, dy = b.y-a.y, denom = dx*dx+dy*dy;
      if (denom > 1e-12) {
        const u = Math.max(0,Math.min(1,((near.x-a.x)*dx+(near.y-a.y)*dy)/denom));
        offer({x:a.x+u*dx,y:a.y+u*dy},"path");
      }
    }
  }
  if (options.intersection && nearby.length <= 120) {
    for (let i=0;i<nearby.length;i++) for (let j=i+1;j<nearby.length;j++) {
      const {a,b}=nearby[i], {a:c,b:d}=nearby[j];
      const rx=b.x-a.x, ry=b.y-a.y, sx=d.x-c.x, sy=d.y-c.y;
      const denom=rx*sy-ry*sx;
      if (Math.abs(denom)<1e-10) continue;
      const u=((c.x-a.x)*sy-(c.y-a.y)*sx)/denom;
      const v=((c.x-a.x)*ry-(c.y-a.y)*rx)/denom;
      if (u>=0 && u<=1 && v>=0 && v<=1) offer({x:a.x+u*rx,y:a.y+u*ry},"intersection");
    }
  }
  return best;
}
