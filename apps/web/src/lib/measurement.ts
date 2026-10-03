export type MeasurementUnit = "mm" | "cm" | "m";

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
  if (unit === "m") return `${(millimeters / 1000).toFixed(3)} m`;
  if (unit === "cm") return `${(millimeters / 10).toFixed(1)} cm`;
  return `${millimeters.toFixed(1)} mm`;
}

export function canvasDistanceToPdfPoints(canvasDistance: number, pageScale: number): number {
  return canvasDistance / Math.max(pageScale, 0.0001);
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
