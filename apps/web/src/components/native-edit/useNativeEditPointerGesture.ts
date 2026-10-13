import { useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { PdfMatrix } from "@tpdf/core";
import { pdfPointFromClient } from "../../lib/nativeEditGeometry";
import { applyNativeEditPatches } from "../../lib/nativeEditRuntime";
import { nativeEditTransformPatches } from "./nativeEditInteractiveObjects";
import { matrixForPointer, matrixIsIdentity, type NativeEditDragState } from "./nativeEditPointerTransform";

type Props = {
  drag: NativeEditDragState | null;
  overlayRef: RefObject<SVGSVGElement | null>;
  setDrag: Dispatch<SetStateAction<NativeEditDragState | null>>;
  setPreviewMatrix: Dispatch<SetStateAction<PdfMatrix | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  onPersistedBytes: (bytes: Uint8Array) => Promise<void>;
};

/** Complete a pointer gesture without reattaching pointerup on every preview paint. */
export function useNativeEditPointerGesture({
  drag, overlayRef, setDrag, setPreviewMatrix, setError, onPersistedBytes,
}: Props) {
  const latestPreview = useRef<PdfMatrix | null>(null);
  const persistedRef = useRef(onPersistedBytes);
  persistedRef.current = onPersistedBytes;

  useLayoutEffect(() => {
    if (!drag) return;
    latestPreview.current = null;
    const pointerFrom = (event: PointerEvent) => {
      const bounds = overlayRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
      return pdfPointFromClient(
        event.clientX, event.clientY, bounds, drag.pageWidth, drag.pageHeight,
        drag.pageOrigin,
      );
    };
    const onMove = (event: PointerEvent) => {
      const pointer = pointerFrom(event);
      if (!pointer) return;
      const matrix = matrixForPointer(drag, pointer);
      latestPreview.current = matrix;
      setPreviewMatrix(matrix);
    };
    const onUp = (event: PointerEvent) => {
      const pointer = pointerFrom(event);
      const matrix = pointer ? matrixForPointer(drag, pointer) : latestPreview.current;
      setDrag(null);
      const distance = drag.startClientX === undefined || drag.startClientY === undefined
        ? Number.POSITIVE_INFINITY
        : Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      if ((drag.mode === "move" && distance < 4) || !matrix || matrixIsIdentity(matrix)) {
        setPreviewMatrix(null);
        return;
      }
      // The final pointer position is authoritative even if pointermove was
      // coalesced under load. Preserve feedback while the edit is persisted.
      setPreviewMatrix(matrix);
      const message = drag.mode === "move" ? "Object moved on page."
        : drag.mode === "resize" ? "Object resized on page." : "Object rotated on page.";
      // Present at least one painted optimistic frame before PDFium edits
      // replace the document/selection subtree. Otherwise a fast revision
      // swap can remove the selection before users see the resized bounds.
      const commitAfterPaint = async () => {
        if (document.visibilityState === "visible") {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        }
        return applyNativeEditPatches(nativeEditTransformPatches(drag.objectIds, matrix), message);
      };
      void commitAfterPaint()
        .then(async (bytes) => {
          if (bytes) await persistedRef.current(bytes);
          setPreviewMatrix(null);
        }).catch((error: unknown) => {
          setPreviewMatrix(null);
          setError(error instanceof Error ? error.message : String(error));
        });
    };
    const onCancel = () => {
      setDrag(null);
      setPreviewMatrix(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onCancel, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag, overlayRef, setDrag, setPreviewMatrix, setError]);
}
