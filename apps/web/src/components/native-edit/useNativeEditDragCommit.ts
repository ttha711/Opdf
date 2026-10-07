import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { PdfMatrix, PdfPoint } from "@opdf/core";
import {
  pdfPointFromClient,
  resizeMatrix,
  rotationMatrix,
  translationMatrix,
  type NativeObjectGeometry,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";
import { applyNativeEditPatches } from "../../lib/nativeEditRuntime";

const TRANSFORM_EPSILON = 0.0005;

function matrixIsIdentity(matrix: PdfMatrix) {
  const identity: PdfMatrix = [1, 0, 0, 1, 0, 0];
  return matrix.every((value, index) => Math.abs(value - identity[index]) < TRANSFORM_EPSILON);
}

export type NativeEditDragState = {
  mode: "move" | "resize" | "rotate";
  objectId: string;
  pageWidth: number;
  pageHeight: number;
  geometry: NativeObjectGeometry;
  beforeMutation?: Promise<void>;
  start?: PdfPoint;
  handle?: NativeResizeHandle;
  startAngle?: number;
  startClientX?: number;
  startClientY?: number;
  clickText?: string;
};

function matrixForPointer(state: NativeEditDragState, pointer: PdfPoint): PdfMatrix {
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

type Props = {
  drag: NativeEditDragState | null;
  previewMatrix: PdfMatrix | null;
  overlayRef: RefObject<SVGSVGElement | null>;
  mountedRef: RefObject<boolean>;
  setDrag: Dispatch<SetStateAction<NativeEditDragState | null>>;
  setPreviewMatrix: Dispatch<SetStateAction<PdfMatrix | null>>;
  setEditingText: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useNativeEditDragCommit({
  drag,
  previewMatrix,
  overlayRef,
  mountedRef,
  setDrag,
  setPreviewMatrix,
  setEditingText,
  setError,
}: Props) {
  useEffect(() => {
    if (!drag) return;

    const clientToPdf = (clientX: number, clientY: number) => {
      if (!overlayRef.current) return null;
      return pdfPointFromClient(
        clientX,
        clientY,
        overlayRef.current.getBoundingClientRect(),
        drag.pageWidth,
        drag.pageHeight,
      );
    };

    const onMove = (event: PointerEvent) => {
      const pointer = clientToPdf(event.clientX, event.clientY);
      if (pointer) setPreviewMatrix(matrixForPointer(drag, pointer));
    };

    const onUp = (event: PointerEvent) => {
      const pointer = clientToPdf(event.clientX, event.clientY);
      const matrix = pointer ? matrixForPointer(drag, pointer) : previewMatrix;
      const beforeMutation = drag.beforeMutation;
      setDrag(null);

      const clickDistance = drag.startClientX === undefined || drag.startClientY === undefined
        ? Number.POSITIVE_INFINITY
        : Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);

      if (drag.mode === "move" && clickDistance < 4) {
        setPreviewMatrix(null);
        void (async () => {
          await beforeMutation;
          if (mountedRef.current && drag.clickText !== undefined) setEditingText(drag.clickText);
        })();
        return;
      }
      if (!matrix || matrixIsIdentity(matrix)) {
        setPreviewMatrix(null);
        return;
      }

      setPreviewMatrix(matrix);
      const message = drag.mode === "move" ? "Object moved on page." :
        drag.mode === "resize" ? "Object resized on page." :
        "Object rotated on page.";

      void (async () => {
        try {
          await beforeMutation;
          await applyNativeEditPatches(
            [{ type: "relative-transform", objectId: drag.objectId, matrix }],
            message,
          );
          if (mountedRef.current) setPreviewMatrix(null);
        } catch (reason) {
          if (mountedRef.current) {
            setPreviewMatrix(null);
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        }
      })();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    drag,
    mountedRef,
    overlayRef,
    previewMatrix,
    setDrag,
    setEditingText,
    setError,
    setPreviewMatrix,
  ]);
}
