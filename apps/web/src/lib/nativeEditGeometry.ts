import type { PdfContentObject, PdfMatrix, PdfPoint } from "@opdf/core";

export type NativeResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type NativeObjectGeometry = {
  center: PdfPoint;
  width: number;
  height: number;
  u: PdfPoint;
  v: PdfPoint;
  corners: [PdfPoint, PdfPoint, PdfPoint, PdfPoint];
};

const EPSILON = 0.0001;

function length(point: PdfPoint) {
  return Math.hypot(point.x, point.y);
}

function normalize(point: PdfPoint, fallback: PdfPoint): PdfPoint {
  const magnitude = length(point);
  if (magnitude < EPSILON) return fallback;
  return { x: point.x / magnitude, y: point.y / magnitude };
}

function dot(a: PdfPoint, b: PdfPoint) {
  return a.x * b.x + a.y * b.y;
}

function add(a: PdfPoint, b: PdfPoint): PdfPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(point: PdfPoint, factor: number): PdfPoint {
  return { x: point.x * factor, y: point.y * factor };
}

function boundsPoints(object: PdfContentObject): PdfPoint[] {
  if (object.rotatedBounds?.length === 4) return [...object.rotatedBounds];
  const { x, y, width, height } = object.bounds;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function geometryForObject(object: PdfContentObject): NativeObjectGeometry {
  const points = boundsPoints(object);
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const matrixX = { x: object.matrix[0], y: object.matrix[1] };
  const u = normalize(matrixX, { x: 1, y: 0 });
  const matrixY = { x: object.matrix[2], y: object.matrix[3] };
  let v = { x: -u.y, y: u.x };
  if (dot(v, matrixY) < 0) v = scale(v, -1);

  const projectedU = points.map((point) => dot({ x: point.x - center.x, y: point.y - center.y }, u));
  const projectedV = points.map((point) => dot({ x: point.x - center.x, y: point.y - center.y }, v));
  const halfWidth = Math.max(EPSILON, Math.max(...projectedU.map(Math.abs)));
  const halfHeight = Math.max(EPSILON, Math.max(...projectedV.map(Math.abs)));

  const corner = (xSign: number, ySign: number) =>
    add(center, add(scale(u, halfWidth * xSign), scale(v, halfHeight * ySign)));

  return {
    center,
    width: halfWidth * 2,
    height: halfHeight * 2,
    u,
    v,
    corners: [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)],
  };
}

export function transformPoint(matrix: PdfMatrix, point: PdfPoint): PdfPoint {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

export function transformGeometry(
  geometry: NativeObjectGeometry,
  matrix: PdfMatrix,
): NativeObjectGeometry {
  const corners = geometry.corners.map((point) => transformPoint(matrix, point)) as NativeObjectGeometry["corners"];
  const center = transformPoint(matrix, geometry.center);
  const uPoint = transformPoint(matrix, add(geometry.center, geometry.u));
  const vPoint = transformPoint(matrix, add(geometry.center, geometry.v));
  const u = normalize({ x: uPoint.x - center.x, y: uPoint.y - center.y }, geometry.u);
  const v = normalize({ x: vPoint.x - center.x, y: vPoint.y - center.y }, geometry.v);
  const width = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const height = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  return { center, width, height, u, v, corners };
}

export function translationMatrix(dx: number, dy: number): PdfMatrix {
  return [1, 0, 0, 1, dx, dy];
}

export function rotationMatrix(center: PdfPoint, radians: number): PdfMatrix {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine,
    sine,
    -sine,
    cosine,
    center.x - cosine * center.x + sine * center.y,
    center.y - sine * center.x - cosine * center.y,
  ];
}

const HANDLE_SIGNS: Record<NativeResizeHandle, [number, number]> = {
  nw: [-1, 1],
  n: [0, 1],
  ne: [1, 1],
  e: [1, 0],
  se: [1, -1],
  s: [0, -1],
  sw: [-1, -1],
  w: [-1, 0],
};

export function handlePdfPoint(
  geometry: NativeObjectGeometry,
  handle: NativeResizeHandle,
): PdfPoint {
  const [xSign, ySign] = HANDLE_SIGNS[handle];
  return add(
    geometry.center,
    add(scale(geometry.u, geometry.width * xSign / 2), scale(geometry.v, geometry.height * ySign / 2)),
  );
}

export function resizeMatrix(
  geometry: NativeObjectGeometry,
  handle: NativeResizeHandle,
  pointer: PdfPoint,
  minSize = 2,
): PdfMatrix {
  const [xSign, ySign] = HANDLE_SIGNS[handle];
  const current = handlePdfPoint(geometry, handle);
  const delta = { x: pointer.x - current.x, y: pointer.y - current.y };
  const projectedX = dot(delta, geometry.u);
  const projectedY = dot(delta, geometry.v);
  const width = xSign ? Math.max(minSize, geometry.width + xSign * projectedX) : geometry.width;
  const height = ySign ? Math.max(minSize, geometry.height + ySign * projectedY) : geometry.height;
  const scaleX = width / geometry.width;
  const scaleY = height / geometry.height;
  const anchor = add(
    geometry.center,
    add(
      scale(geometry.u, xSign ? -xSign * geometry.width / 2 : 0),
      scale(geometry.v, ySign ? -ySign * geometry.height / 2 : 0),
    ),
  );
  const { x: ux, y: uy } = geometry.u;
  const a = scaleX * ux * ux + scaleY * uy * uy;
  const b = (scaleX - scaleY) * ux * uy;
  const c = b;
  const d = scaleX * uy * uy + scaleY * ux * ux;
  return [
    a,
    b,
    c,
    d,
    anchor.x - a * anchor.x - c * anchor.y,
    anchor.y - b * anchor.x - d * anchor.y,
  ];
}

export function pdfPointFromClient(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  pageWidth: number,
  pageHeight: number,
): PdfPoint {
  const x = (clientX - rect.left) * pageWidth / rect.width;
  const domY = (clientY - rect.top) * pageHeight / rect.height;
  return { x, y: pageHeight - domY };
}

export function pdfPointToDom(
  point: PdfPoint,
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
) {
  return {
    x: point.x * width / pageWidth,
    y: (pageHeight - point.y) * height / pageHeight,
  };
}
