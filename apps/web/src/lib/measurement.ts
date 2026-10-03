export type MeasurementUnit = "mm" | "cm" | "m";
export type MeasurementMode = "distance" | "perimeter" | "area";
export type MeasurementPoint = { x: number; y: number };

export const PDF_POINT_TO_MM = 25.4 / 72;

export function presetMmPerPdfPoint(drawingScale: number): number {
  const safeScale = Number.isFinite(drawingScale) && drawingScale > 0 ? drawingScale : 1;
  return PDF_POINT_TO_MM * safeScale;
}

export function calibrateMmPerPdfPoint(pdfPoints: number, knownMillimeters: number): number | null {
  if (!Number.isFinite(pdfPoints) || !Number.isFinite(knownMillimeters)) return null;
  if (pdfPoints <= 0 || knownMillimeters <= 0) return null;
  return knownMillimeters / pdfPoints;
}

export function toMillimeters(value: number, unit: MeasurementUnit): number {
  if (unit === "m") return value * 1000;
  if (unit === "cm") return value * 10;
  return value;
}

export function formatMillimeters(millimeters: number, unit: MeasurementUnit): string {
  if (unit === "m") return (millimeters / 1000).toFixed(3) + " m";
  if (unit === "cm") return (millimeters / 10).toFixed(1) + " cm";
  return millimeters.toFixed(1) + " mm";
}

export function formatSquareMillimeters(squareMillimeters: number, unit: MeasurementUnit): string {
  if (unit === "m") return (squareMillimeters / 1_000_000).toFixed(3) + " m²";
  if (unit === "cm") return (squareMillimeters / 100).toFixed(1) + " cm²";
  return squareMillimeters.toFixed(1) + " mm²";
}

export function canvasDistanceToPdfPoints(canvasDistance: number, pageScale: number): number {
  return canvasDistance / Math.max(pageScale, 0.0001);
}

export function polylineCanvasDistance(points: MeasurementPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.hypot(dx, dy);
  }
  return total;
}

export function polygonCanvasArea(points: MeasurementPoint[]): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    twiceArea += points[i].x * points[next].y - points[next].x * points[i].y;
  }
  return Math.abs(twiceArea) / 2;
}

export function formatCanvasMeasurement(
  canvasDistance: number,
  pageScale: number,
  mmPerPdfPoint: number,
  unit: MeasurementUnit,
): string {
  const pdfPoints = canvasDistanceToPdfPoints(canvasDistance, pageScale);
  return formatMillimeters(pdfPoints * mmPerPdfPoint, unit);
}

export function formatPathMeasurement(
  points: MeasurementPoint[],
  pageScale: number,
  mmPerPdfPoint: number,
  unit: MeasurementUnit,
  mode: MeasurementMode,
): string {
  if (mode === "area") {
    const canvasArea = polygonCanvasArea(points);
    const pdfArea = canvasArea / Math.max(pageScale * pageScale, 0.00000001);
    return formatSquareMillimeters(pdfArea * mmPerPdfPoint * mmPerPdfPoint, unit);
  }
  const distance = polylineCanvasDistance(points);
  return formatCanvasMeasurement(distance, pageScale, mmPerPdfPoint, unit);
}
