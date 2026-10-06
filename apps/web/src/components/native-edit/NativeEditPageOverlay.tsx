import { useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfContentPatch, PdfMatrix, PdfPoint } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../../lib/pdfiumContentEngine";
import {
  geometryForObject,
  pdfPointFromClient,
  resizeMatrix,
  rotationMatrix,
  transformGeometry,
  translationMatrix,
  type NativeObjectGeometry,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";
import {
  applyNativeEditPatches,
  consumeNativeInlineTextEdit,
  emitNativeEditSelection,
  registerNativeEditSelectionListener,
} from "../../lib/nativeEditRuntime";
import { NativeEditSelectionLayer, nativeEditObjectIsEditable } from "./NativeEditSelectionLayer";
import { NativeInlineTextEditor } from "./NativeInlineTextEditor";
import { useNativeEditKeyboardMove } from "./useNativeEditKeyboardMove";

type Props = {
  pageIndex: number;
  width: number;
  height: number;
  revisionKey: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
};

const TRANSFORM_EPSILON = 0.0005;

function matrixIsIdentity(matrix: PdfMatrix) {
  const identity: PdfMatrix = [1, 0, 0, 1, 0, 0];
  return matrix.every((value, index) => Math.abs(value - identity[index]) < TRANSFORM_EPSILON);
}

type DragState = {
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
  clickText?: string;
};

export function NativeEditPageOverlay({
  pageIndex,
  width,
  height,
  revisionKey,
  getDocumentBytes,
}: Props) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const [objects, setObjects] = useState<PdfContentObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewMatrix, setPreviewMatrix] = useState<PdfMatrix | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void getDocumentBytes()
      .then((bytes) => bytes ? pdfiumContentEditingEngine.inspectPage(bytes, pageIndex) : [])
      .then((next) => {
        if (cancelled) return;
        setObjects(next);
        const pending = consumeNativeInlineTextEdit(pageIndex);
        const target = pending ? next.find((item) =>
          item.kind === "text" && (item.text ?? "").includes(pending.text)
        ) : null;
        if (target) {
          setSelectedId(target.id);
          setEditingText(target.text ?? "");
          emitNativeEditSelection({ pageIndex, objectId: target.id });
        } else {
          setSelectedId((current) => next.some((item) => item.id === current) ? current : null);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to inspect PDF objects.");
      });
    return () => { cancelled = true; };
  }, [getDocumentBytes, pageIndex, revisionKey]);

  useEffect(() => registerNativeEditSelectionListener((selection) => {
    if (selection.pageIndex === pageIndex) setSelectedId(selection.objectId);
    else if (selection.objectId) setSelectedId(null);
  }), [pageIndex]);

  const selected = useMemo(
    () => objects.find((object) => object.id === selectedId) ?? null,
    [objects, selectedId],
  );
  const baseGeometry = useMemo(
    () => selected ? geometryForObject(selected) : null,
    [selected],
  );
  const displayGeometry = useMemo(
    () => baseGeometry && previewMatrix ? transformGeometry(baseGeometry, previewMatrix) : baseGeometry,
    [baseGeometry, previewMatrix],
  );

  const clientToPdf = (state: DragState | PdfContentObject, clientX: number, clientY: number) => {
    if (!overlayRef.current) return null;
    return pdfPointFromClient(
      clientX,
      clientY,
      overlayRef.current.getBoundingClientRect(),
      state.pageWidth,
      state.pageHeight,
    );
  };

  const matrixForPointer = (state: DragState, pointer: PdfPoint): PdfMatrix => {
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
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const pointer = clientToPdf(drag, event.clientX, event.clientY);
      if (pointer) setPreviewMatrix(matrixForPointer(drag, pointer));
    };
    const onUp = (event: PointerEvent) => {
      const pointer = clientToPdf(drag, event.clientX, event.clientY);
      const matrix = pointer ? matrixForPointer(drag, pointer) : previewMatrix;
      const mode = drag.mode;
      const objectId = drag.objectId;
      setDrag(null);
      setPreviewMatrix(null);
      const clickDistance = drag.startClientX === undefined || drag.startClientY === undefined
        ? Number.POSITIVE_INFINITY
        : Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      if (mode === "move" && clickDistance < 4) {
        if (drag.clickText !== undefined) setEditingText(drag.clickText);
        return;
      }
      if (!matrix || matrixIsIdentity(matrix)) return;
      const message = mode === "move" ? "Object moved on page." :
        mode === "resize" ? "Object resized on page." :
        "Object rotated on page.";
      void applyNativeEditPatches(
        [{ type: "relative-transform", objectId, matrix }],
        message,
      ).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, previewMatrix]);

  const selectObject = (object: PdfContentObject) => {
    setSelectedId(object.id);
    emitNativeEditSelection({ pageIndex, objectId: object.id });
  };

  const startMove = (event: React.PointerEvent, object: PdfContentObject) => {
    selectObject(object);
    if (!nativeEditObjectIsEditable(object) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const point = clientToPdf(object, event.clientX, event.clientY);
    if (!point) return;
    setEditingText(null);
    setDrag({
      mode: "move",
      objectId: object.id,
      pageWidth: object.pageWidth,
      pageHeight: object.pageHeight,
      start: point,
      geometry: geometryForObject(object),
      startClientX: event.clientX,
      startClientY: event.clientY,
      clickText: object.kind === "text" ? object.text ?? "" : undefined,
    });
    setPreviewMatrix(null);
  };

  const startResize = (event: React.PointerEvent, handle: NativeResizeHandle) => {
    if (!baseGeometry || !selected || !nativeEditObjectIsEditable(selected)) return;
    event.preventDefault();
    event.stopPropagation();
    setDrag({
      mode: "resize",
      objectId: selected.id,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      handle,
      geometry: baseGeometry,
    });
    setPreviewMatrix(null);
  };

  const startRotate = (event: React.PointerEvent) => {
    if (!baseGeometry || !selected || !nativeEditObjectIsEditable(selected)) return;
    const point = clientToPdf(selected, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    setDrag({
      mode: "rotate",
      objectId: selected.id,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      startAngle: Math.atan2(point.y - baseGeometry.center.y, point.x - baseGeometry.center.x),
      geometry: baseGeometry,
    });
    setPreviewMatrix(null);
  };

  useNativeEditKeyboardMove({
    objectId: selected?.id ?? null,
    enabled: Boolean(selected && nativeEditObjectIsEditable(selected) && editingText === null && !drag),
    setPreviewMatrix,
    setError,
  });

  const commitInlineText = async () => {
    if (!selected || selected.kind !== "text" || editingText === null) return;
    const nextText = editingText;
    setEditingText(null);
    if (nextText === (selected.text ?? "")) return;
    const unicodeFallback = /[^ -]/.test(nextText);
    const patches: PdfContentPatch[] = [];
    if (unicodeFallback) {
      patches.push({
        type: "style-text",
        objectId: selected.id,
        fontFamily: "__opdf_unicode__",
        fontSize: selected.fontSize,
      });
    }
    patches.push({ type: "replace-text", objectId: selected.id, text: nextText });
    await applyNativeEditPatches(
      patches,
      unicodeFallback ? "Inline text updated with Unicode fallback." : "Inline text updated.",
    );
  };

  return (
    <>
      <NativeEditSelectionLayer
        svgRef={overlayRef}
        pageIndex={pageIndex}
        width={width}
        height={height}
        objects={objects}
        selected={selected}
        displayGeometry={displayGeometry}
        geometryFor={geometryForObject}
        onEmptyPointerDown={() => {
          setSelectedId(null);
          setEditingText(null);
          emitNativeEditSelection({ pageIndex, objectId: null });
        }}
        onObjectPointerDown={startMove}
        onObjectDoubleClick={(event, object) => {
          event.stopPropagation();
          selectObject(object);
          if (object.kind === "text" && nativeEditObjectIsEditable(object)) {
            setEditingText(object.text ?? "");
          }
        }}
        onResizePointerDown={startResize}
        onRotatePointerDown={startRotate}
      />
      {selected?.kind === "text" && editingText !== null && displayGeometry ? (
        <NativeInlineTextEditor
          object={selected}
          geometry={displayGeometry}
          width={width}
          height={height}
          value={editingText}
          onChange={setEditingText}
          onCommit={commitInlineText}
          onCancel={() => setEditingText(null)}
          onError={setError}
        />
      ) : null}
      {error ? <div className="native-content-editor__message">{error}</div> : null}
    </>
  );
}
