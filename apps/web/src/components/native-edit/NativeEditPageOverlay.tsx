import { useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfMatrix } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../../lib/pdfiumContentEngine";
import {
  geometryForObject,
  pdfPointFromClient,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";
import {
  consumeNativeInlineTextEdit,
  emitNativeEditSelection,
  getNativeEditWorkingBytes,
  registerNativeEditSelectionListener,
} from "../../lib/nativeEditRuntime";
import { NativeEditSelectionLayer, nativeEditObjectIsEditable } from "./NativeEditSelectionLayer";
import { NativeInlineTextEditor } from "./NativeInlineTextEditor";
import {
  useNativeEditDragCommit,
  type NativeEditDragState,
} from "./useNativeEditDragCommit";
import { useNativeEditKeyboardMove } from "./useNativeEditKeyboardMove";
import { useNativeInlineEditCommit } from "./useNativeInlineEditCommit";

type Props = {
  pageIndex: number;
  width: number;
  height: number;
  revisionKey: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
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
  const [drag, setDrag] = useState<NativeEditDragState | null>(null);
  const [previewMatrix, setPreviewMatrix] = useState<PdfMatrix | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => objects.find((object) => object.id === selectedId) ?? null,
    [objects, selectedId],
  );
  const {
    commitInlineText,
    editingTextRef,
    mountedRef,
  } = useNativeInlineEditCommit({
    selected,
    editingText,
    setEditingText,
  });

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const cached = getNativeEditWorkingBytes();
    void (cached ? Promise.resolve(cached) : getDocumentBytes())
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

  const baseGeometry = useMemo(
    () => selected ? geometryForObject(selected) : null,
    [selected],
  );
  const displayGeometry = useMemo(
    () => baseGeometry && previewMatrix
      ? {
          ...baseGeometry,
          ...(() => {
            const { transformGeometry } = requireGeometry();
            return transformGeometry(baseGeometry, previewMatrix);
          })(),
        }
      : baseGeometry,
    [baseGeometry, previewMatrix],
  );

  useNativeEditDragCommit({
    drag,
    previewMatrix,
    overlayRef,
    mountedRef,
    setDrag,
    setPreviewMatrix,
    setEditingText,
    setError,
  });

  const selectObject = (object: PdfContentObject) => {
    setSelectedId(object.id);
    emitNativeEditSelection({ pageIndex, objectId: object.id });
  };

  const pointFor = (object: PdfContentObject, clientX: number, clientY: number) => {
    if (!overlayRef.current) return null;
    return pdfPointFromClient(
      clientX,
      clientY,
      overlayRef.current.getBoundingClientRect(),
      object.pageWidth,
      object.pageHeight,
    );
  };

  const startMove = (event: React.PointerEvent, object: PdfContentObject) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const beforeMutation = editingTextRef.current !== null
      ? commitInlineText()
      : Promise.resolve();

    if (!nativeEditObjectIsEditable(object)) {
      void beforeMutation.then(() => {
        if (mountedRef.current) selectObject(object);
      });
      return;
    }

    const point = pointFor(object, event.clientX, event.clientY);
    if (!point) return;
    selectObject(object);
    setDrag({
      mode: "move",
      objectId: object.id,
      pageWidth: object.pageWidth,
      pageHeight: object.pageHeight,
      start: point,
      geometry: geometryForObject(object),
      beforeMutation,
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
    const beforeMutation = editingTextRef.current !== null
      ? commitInlineText()
      : Promise.resolve();
    setDrag({
      mode: "resize",
      objectId: selected.id,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      handle,
      geometry: baseGeometry,
      beforeMutation,
    });
    setPreviewMatrix(null);
  };

  const startRotate = (event: React.PointerEvent) => {
    if (!baseGeometry || !selected || !nativeEditObjectIsEditable(selected)) return;
    const point = pointFor(selected, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const beforeMutation = editingTextRef.current !== null
      ? commitInlineText()
      : Promise.resolve();
    setDrag({
      mode: "rotate",
      objectId: selected.id,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      startAngle: Math.atan2(
        point.y - baseGeometry.center.y,
        point.x - baseGeometry.center.x,
      ),
      geometry: baseGeometry,
      beforeMutation,
    });
    setPreviewMatrix(null);
  };

  useNativeEditKeyboardMove({
    objectId: selected?.id ?? null,
    enabled: Boolean(selected && nativeEditObjectIsEditable(selected) && editingText === null && !drag),
    setPreviewMatrix,
    setError,
  });

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
        onEmptyPointerDown={(event) => {
          event.preventDefault();
          void commitInlineText().then(() => {
            if (!mountedRef.current) return;
            setSelectedId(null);
            setEditingText(null);
            emitNativeEditSelection({ pageIndex, objectId: null });
          });
        }}
        onObjectPointerDown={startMove}
        onObjectDoubleClick={(event, object) => {
          event.preventDefault();
          event.stopPropagation();
          void commitInlineText().then(() => {
            if (!mountedRef.current) return;
            selectObject(object);
            if (object.kind === "text" && nativeEditObjectIsEditable(object)) {
              setEditingText(object.text ?? "");
            }
          });
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

function requireGeometry() {
  return {
    transformGeometry: (
      geometry: import("../../lib/nativeEditGeometry").NativeObjectGeometry,
      matrix: PdfMatrix,
    ) => {
      const apply = (point: { x: number; y: number }) => ({
        x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
        y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
      });
      const uEnd = apply({
        x: geometry.center.x + geometry.u.x,
        y: geometry.center.y + geometry.u.y,
      });
      const vEnd = apply({
        x: geometry.center.x + geometry.v.x,
        y: geometry.center.y + geometry.v.y,
      });
      const center = apply(geometry.center);
      return {
        ...geometry,
        center,
        u: { x: uEnd.x - center.x, y: uEnd.y - center.y },
        v: { x: vEnd.x - center.x, y: vEnd.y - center.y },
        corners: geometry.corners.map(apply),
      };
    },
  };
}
