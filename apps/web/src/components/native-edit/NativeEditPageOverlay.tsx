import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfMatrix } from "@tpdf/core";
import {
  geometryForObject,
  pdfPointFromClient,
  transformGeometry,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";
import {
  emitNativeEditSelection,
  registerNativeInlineCommitter,
  registerNativeInlineTextEditRequestListener,
} from "../../lib/nativeEditRuntime";
import { NativeEditSelectionLayer, nativeEditObjectIsEditable } from "./NativeEditSelectionLayer";
import { getNativeEditOverlayObjects } from "./nativeEditOverlayObjects";
import { getNativeEditInteractiveObjects } from "./nativeEditInteractiveObjects";
import { nativeEditTextRun } from "./nativeEditTextRun";
import type { NativeEditTextLine } from "./nativeEditTextRun";
import { useNativeEditCanvasTextDoubleClick } from "./nativeEditCanvasTextEdit";
import { useNativeEditPageObjects } from "./useNativeEditPageObjects";
import { NativeInlineTextEditor } from "./NativeInlineTextEditor";
import { useNativeInlineTextFrame } from "./useNativeInlineTextFrame";
import { useNativeEditKeyboardMove } from "./useNativeEditKeyboardMove";
import { useNativeInlineCommit } from "./useNativeInlineCommit";
import { useNativeEditSelectionSync } from "./useNativeEditSelectionSync";
import type { NativeEditDragState } from "./nativeEditPointerTransform";
import { useNativeEditPointerGesture } from "./useNativeEditPointerGesture";
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
  const [editingObject, setEditingObject] = useState<PdfContentObject | null>(null);
  const [groupedTextLines, setGroupedTextLines] = useState<NativeEditTextLine[]>([]);
  const [isApplyingText, setIsApplyingText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshObjectsFromBytes = useNativeEditPageObjects({
    pageIndex, enabled, revisionKey, getDocumentBytes, setObjects, setSelectedId,
    setEditingText, setEditingObject, setGroupedTextLines, setError,
  });
  const interactiveObjects = useMemo(() => getNativeEditInteractiveObjects(objects), [objects]);
  const selectedItem = useMemo(() => interactiveObjects.find((item) =>
    item.object.id === selectedId || item.objectIds.includes(selectedId ?? "")), [interactiveObjects, selectedId]);
  const visibleObjects = useMemo(() => getNativeEditOverlayObjects(
    interactiveObjects.map((item) => item.object), selectedItem?.object.id ?? selectedId,
  ), [interactiveObjects, selectedId, selectedItem]);
  const selected = useMemo(() => editingText !== null && editingObject?.id === selectedId
    ? editingObject : selectedItem?.object ?? null,
  [editingObject, editingText, selectedId, selectedItem]);
  const selectedObjectIds = useMemo(() => selectedItem?.objectIds ?? (selected ? [selected.id] : []), [selected, selectedItem]);
  const objectIdsFor = useCallback((object: PdfContentObject) =>
    interactiveObjects.find((item) => item.object.id === object.id)?.objectIds ?? [object.id], [interactiveObjects]);
  const baseGeometry = useMemo(() => selected ? geometryForObject(selected) : null, [selected]);
  const coverSelectedText = editingText !== null;
  const inlineFrame = useNativeInlineTextFrame(selected, baseGeometry, width, height, editingText ?? "", coverSelectedText);
  const displayGeometry = useMemo(() => inlineFrame.geometry && previewMatrix
    ? transformGeometry(inlineFrame.geometry, previewMatrix) : inlineFrame.geometry, [inlineFrame.geometry, previewMatrix]);
  const clientToPdf = (state: NativeEditDragState | PdfContentObject, clientX: number, clientY: number) => {
    if (!overlayRef.current) return null;
    return pdfPointFromClient(clientX, clientY,
      overlayRef.current.getBoundingClientRect(), state.pageWidth, state.pageHeight,
      "pageOrigin" in state ? state.pageOrigin : undefined);
  };
  // Keep pointer listeners attached for the entire gesture, not for each
  // optimistic matrix frame. A gap could lose pointerup during busy renders.
  useNativeEditPointerGesture({
    drag, overlayRef, setDrag, setPreviewMatrix, setError,
    onPersistedBytes: refreshObjectsFromBytes,
  });

  const selectObject = (object: PdfContentObject, objectIds = [object.id]) => {
    setEditingObject(null);
    const item = interactiveObjects.find((entry) => entry.object.id === object.id);
    setGroupedTextLines(object.kind === "text" ? item?.lines ?? [{ object, objectIds }] : []);
    setSelectedId(object.id);
    emitNativeEditSelection({ pageIndex, objectId: object.id });
  };

  const startMove = (event: React.PointerEvent, object: PdfContentObject, objectIds: string[]) => {
    if (!nativeEditObjectIsEditable(object) || event.button !== 0) {
      selectObject(object, objectIds);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const clientX = event.clientX;
    const clientY = event.clientY;
    const beginMove = () => {
      selectObject(object, objectIds);
      const point = clientToPdf(object, clientX, clientY);
      if (!point) return;
      setDrag({
        mode: "move",
        objectIds,
        pageWidth: object.pageWidth,
        pageHeight: object.pageHeight,
        pageOrigin: object.pageOrigin,
        start: point,
        geometry: geometryForObject(object),
        startClientX: clientX,
        startClientY: clientY,
      });
      setPreviewMatrix(null);
    };
    if (editingText !== null) {
      // A pointer click must not switch objects while the previous draft saves.
      void commitInlineText().then(() => selectObject(object, objectIds)).catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)));
      return;
    }
    beginMove();
  };
  const startResize = (event: React.PointerEvent, handle: NativeResizeHandle) => {
    if (!baseGeometry || !selected || !nativeEditObjectIsEditable(selected)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const beginResize = () => setDrag({
      mode: "resize", objectIds: selectedObjectIds,
      pageWidth: selected.pageWidth, pageHeight: selected.pageHeight,
      pageOrigin: selected.pageOrigin,
      handle, geometry: baseGeometry,
    });
    if (editingText !== null) {
      // Do not start a pointer gesture after its pointer-up has already fired.
      void commitInlineText().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
      return;
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
    event.currentTarget.setPointerCapture(event.pointerId);
    const beginRotate = () => setDrag({
      mode: "rotate",
      objectIds: selectedObjectIds,
      pageWidth: selected.pageWidth,
      pageHeight: selected.pageHeight,
      pageOrigin: selected.pageOrigin,
      startAngle: Math.atan2(point.y - baseGeometry.center.y, point.x - baseGeometry.center.x),
      geometry: baseGeometry,
    });
    if (editingText !== null) {
      void commitInlineText().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
      return;
    }
    beginRotate();
    setPreviewMatrix(null);
  };
  useNativeEditKeyboardMove({
    objectIds: selectedObjectIds,
    enabled: Boolean(selected && nativeEditObjectIsEditable(selected) && editingText === null && !drag),
    setPreviewMatrix,
    setError,
    onPersistedBytes: refreshObjectsFromBytes,
  });

  const commitInlineText = useNativeInlineCommit({
    selected, editingText, groupedTextLines,
    setEditingText, setEditingObject, setGroupedTextLines,
    setIsApplying: setIsApplyingText,
  });
  const handleCanvasDoubleClick = useNativeEditCanvasTextDoubleClick({
    overlayRef, objects, interactiveObjects, selected, editingText, setSelectedId, setEditingText,
    setEditingObject, setGroupedTextLines, commitInlineText, setError, pageIndex,
  });
  useEffect(() => enabled ? registerNativeInlineCommitter(commitInlineText) : undefined,
    [commitInlineText, enabled]);
  useEffect(() => registerNativeInlineTextEditRequestListener((request) => {
    if (request.pageIndex !== pageIndex) return;
    const object = objects.find((item) => item.id === request.objectId);
    if (!object || object.kind !== "text" || !nativeEditObjectIsEditable(object)) return;
    const beginEdit = () => {
      const run = nativeEditTextRun(objects, object);
      setSelectedId(run.object.id);
      setEditingObject(run.object);
      setGroupedTextLines(run.lines);
      emitNativeEditSelection({ pageIndex, objectId: run.object.id });
      setEditingText(run.object.text ?? "");
    };
    if (editingText !== null) {
      void commitInlineText().then(beginEdit).catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)));
    } else beginEdit();
  }), [commitInlineText, editingText, objects, pageIndex]);
  useNativeEditSelectionSync({
    pageIndex, enabled, selectedId, editingText, setSelectedId, commitInlineText, setError,
  });
  return (
    <>
      <NativeEditSelectionLayer
        svgRef={overlayRef}
        pageIndex={pageIndex}
        width={width}
        height={height}
        objects={visibleObjects}
        selected={selected}
        coverSelectedText={coverSelectedText}
        objectIdsFor={objectIdsFor}
        displayGeometry={displayGeometry}
        geometryFor={geometryForObject}
        onCanvasDoubleClickCapture={handleCanvasDoubleClick}
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
        onResizePointerDown={startResize}
        onRotatePointerDown={startRotate}
      />
      {selected?.kind === "text" && editingText !== null && displayGeometry ? (
        <NativeInlineTextEditor
          object={selected}
          layout={inlineFrame.layout!}
          value={editingText}
          coverSelectedText={coverSelectedText}
          onChange={(value) => { setError(null); setEditingText(value); }}
          onCommit={commitInlineText}
          isApplying={isApplyingText}
          externalError={error}
          onCancel={() => {
            setEditingText(null);
            setEditingObject(null);
            setGroupedTextLines([]);
          }}
          onError={setError}
        />
      ) : null}
      {error ? <div className="native-content-editor__message">{error}</div> : null}
    </>
  );
}
