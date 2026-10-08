import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfMatrix } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../../lib/pdfiumContentEngine";
import {
  geometryForObject,
  pdfPointFromClient,
  transformGeometry,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";
import {
  applyNativeEditPatches,
  consumeNativeInlineTextEdit,
  emitNativeEditSelection,
  registerNativeEditSelectionListener,
  registerNativeInlineCommitter,
} from "../../lib/nativeEditRuntime";
import { NativeEditSelectionLayer, nativeEditObjectIsEditable } from "./NativeEditSelectionLayer";
import { getNativeEditOverlayObjects } from "./nativeEditOverlayObjects";
import { NativeInlineTextEditor } from "./NativeInlineTextEditor";
import { useNativeEditKeyboardMove } from "./useNativeEditKeyboardMove";
import { useNativeInlineCommit } from "./useNativeInlineCommit";
import {
  matrixForPointer,
  matrixIsIdentity,
  type NativeEditDragState,
} from "./nativeEditPointerTransform";

type Props = {
  pageIndex: number;
  enabled: boolean;
  width: number;
  height: number;
  revisionKey: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
};

export function NativeEditPageOverlay({
  pageIndex,
  enabled,
  width,
  height,
  revisionKey,
  getDocumentBytes,
}: Props) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const [objects, setObjects] = useState<PdfContentObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<NativeEditDragState | null>(null);
  const [previewMatrix, setPreviewMatrix] = useState<PdfMatrix | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setObjects([]);
      return () => { cancelled = true; };
    }
    setError(null);
    void getDocumentBytes()
      .then((bytes) => !cancelled && bytes ? pdfiumContentEditingEngine.inspectPage(bytes, pageIndex) : [])
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
  }, [enabled, getDocumentBytes, pageIndex, revisionKey]);

  const refreshObjectsFromBytes = useCallback(async (bytes: Uint8Array) => {
    const next = await pdfiumContentEditingEngine.inspectPage(bytes, pageIndex);
    setObjects(next);
    setSelectedId((current) => next.some((item) => item.id === current) ? current : null);
  }, [pageIndex]);
  const visibleObjects = useMemo(() => getNativeEditOverlayObjects(objects, selectedId), [objects, selectedId]);
  const selected = useMemo(() => objects.find((object) => object.id === selectedId) ?? null, [objects, selectedId]); const baseGeometry = useMemo(() => selected ? geometryForObject(selected) : null, [selected]);
  const displayGeometry = useMemo(() =>
    baseGeometry && previewMatrix ? transformGeometry(baseGeometry, previewMatrix) : baseGeometry,
  [baseGeometry, previewMatrix]);

  const clientToPdf = (state: NativeEditDragState | PdfContentObject, clientX: number, clientY: number) => {
    if (!overlayRef.current) return null;
    return pdfPointFromClient(
      clientX,
      clientY,
      overlayRef.current.getBoundingClientRect(),
      state.pageWidth,
      state.pageHeight,
    );
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
      const clickDistance = drag.startClientX === undefined || drag.startClientY === undefined
        ? Number.POSITIVE_INFINITY
        : Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      if (mode === "move" && clickDistance < 4) {
        if (drag.clickText !== undefined) setEditingText(drag.clickText);
        return;
      }
      if (!matrix || matrixIsIdentity(matrix)) {
        setPreviewMatrix(null);
        return;
      }
      const message = mode === "move" ? "Object moved on page." :
        mode === "resize" ? "Object resized on page." :
        "Object rotated on page.";
      void applyNativeEditPatches(
        [{ type: "relative-transform", objectId, matrix }],
        message,
      ).then(async (bytes) => {
        if (bytes) await refreshObjectsFromBytes(bytes);
        setPreviewMatrix(null);
      }).catch((reason) => {
        setPreviewMatrix(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
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
    if (!nativeEditObjectIsEditable(object) || event.button !== 0) {
      selectObject(object);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const clientX = event.clientX;
    const clientY = event.clientY;
    const beginMove = () => {
      selectObject(object);
      const point = clientToPdf(object, clientX, clientY);
      if (!point) return;
      setDrag({
      mode: "move",
      objectId: object.id,
      pageWidth: object.pageWidth,
      pageHeight: object.pageHeight,
      start: point,
      geometry: geometryForObject(object),
        startClientX: clientX,
        startClientY: clientY,
        clickText: object.kind === "text" ? object.text ?? "" : undefined,
      });
      setPreviewMatrix(null);
    };
    if (editingText !== null) {
      void commitInlineText().catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)));
    }
    beginMove();
  };

  const startResize = (event: React.PointerEvent, handle: NativeResizeHandle) => {
    if (!baseGeometry || !selected || !nativeEditObjectIsEditable(selected)) return;
    event.preventDefault();
    event.stopPropagation();
    const beginResize = () => setDrag({
      mode: "resize",
      objectId: selected.id,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      handle,
      geometry: baseGeometry,
    });
    if (editingText !== null) {
      void commitInlineText().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }
    beginResize();
    setPreviewMatrix(null);
  };

  const startRotate = (event: React.PointerEvent) => {
    if (!baseGeometry || !selected || !nativeEditObjectIsEditable(selected)) return;
    const point = clientToPdf(selected, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const beginRotate = () => setDrag({
      mode: "rotate",
      objectId: selected.id,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      startAngle: Math.atan2(point.y - baseGeometry.center.y, point.x - baseGeometry.center.x),
      geometry: baseGeometry,
    });
    if (editingText !== null) {
      void commitInlineText().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }
    beginRotate();
    setPreviewMatrix(null);
  };

  useNativeEditKeyboardMove({
    objectId: selected?.id ?? null,
    enabled: Boolean(selected && nativeEditObjectIsEditable(selected) && editingText === null && !drag),
    setPreviewMatrix,
    setError,
    onPersistedBytes: refreshObjectsFromBytes,
  });

  const commitInlineText = useNativeInlineCommit({ selected, editingText, setEditingText, refreshObjectsFromBytes });
  useEffect(() => registerNativeInlineCommitter(commitInlineText), [commitInlineText]);
  useEffect(() => registerNativeEditSelectionListener((selection) => {
    if (selection.pageIndex === pageIndex) {
      setSelectedId(selection.objectId);
      return;
    }
    const clearSelection = () => setSelectedId(null);
    if (editingText !== null) void commitInlineText().then(clearSelection);
    else clearSelection();
  }), [commitInlineText, editingText, pageIndex]);

  return (
    <>
      <NativeEditSelectionLayer
        svgRef={overlayRef}
        pageIndex={pageIndex}
        width={width}
        height={height}
        objects={visibleObjects}
        selected={selected}
        displayGeometry={displayGeometry}
        geometryFor={geometryForObject}
        onEmptyPointerDown={() => {
          const deselect = () => {
            setSelectedId(null);
            emitNativeEditSelection({ pageIndex, objectId: null });
          };
          if (editingText !== null) {
            void commitInlineText().then(deselect).catch((reason) =>
              setError(reason instanceof Error ? reason.message : String(reason)));
            return;
          }
          deselect();
        }}
        onObjectPointerDown={startMove}
        onObjectDoubleClick={(event, object) => {
          event.stopPropagation();
          const beginEdit = () => {
            selectObject(object);
            if (object.kind === "text" && nativeEditObjectIsEditable(object)) setEditingText(object.text ?? "");
          };
          if (editingText !== null && selected?.id !== object.id) void commitInlineText().then(beginEdit);
          else beginEdit();
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
