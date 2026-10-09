import type { PdfMatrix, PdfPoint } from "@opdf/core";
import {
  resizeMatrix,
  rotationMatrix,
  translationMatrix,
  type NativeObjectGeometry,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";

const TRANSFORM_EPSILON = 0.0005;

export type NativeEditDragState = {
  mode: "move" | "resize" | "rotate";
  objectId: string;
  pageWidth: number;
  pageHeight: number;
  geometry: NativeObjectGeometry;
  start?: PdfPoint;
  handle?: NativeResizeHandle;
  startAngle?: number;
  startClientX?: number;
  startClientY?: number;
};

export function matrixIsIdentity(matrix: PdfMatrix) {
  const identity: PdfMatrix = [1, 0, 0, 1, 0, 0];
  return matrix.every((value, index) => Math.abs(value - identity[index]) < TRANSFORM_EPSILON);
}

export function matrixForPointer(state: NativeEditDragState, pointer: PdfPoint): PdfMatrix {
  if (state.mode === "move" && state.start) {
    return translationMatrix(pointer.x - state.start.x, pointer.y - state.start.y);
  }
  if (state.mode === "resize" && state.handle) {
    return resizeMatrix(state.geometry, state.handle, pointer);
  }
  const angle = Math.atan2(
    pointer.y - state.geometry.center.y,
    pointer.x - state.geometry.center.x,
  );
  return rotationMatrix(state.geometry.center, angle - (state.startAngle ?? angle));
}
