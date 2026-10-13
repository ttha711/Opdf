import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfContentPatch } from "@tpdf/core";
import { pdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";
import { applyVerifiedNativePatches } from "../lib/nativeEditPatchVerification";
import { pdfHasDigitalSignature } from "../lib/pdfSignatureDetection";
import { useConfirm } from "./ConfirmDialog";
import { registerNativeContentHistoryControls } from "../lib/nativeContentHistory";
import {
  clearNativeEditRuntime,
  commitPendingNativeInlineEdit,
  emitNativeEditSelection,
  registerNativeEditPatchApplier,
  setNativeEditPatchFailure,
  registerNativeEditSelectionListener,
} from "../lib/nativeEditRuntime";
import { NativeContentObjectList } from "./native-content-editor/NativeContentObjectList";
import { NativeContentProperties, type NativeContentDraft } from "./native-content-editor/NativeContentProperties";
import { NativeContentToolbar } from "./native-content-editor/NativeContentToolbar";
import { useNativeContentKeyboard } from "./native-content-editor/useNativeContentKeyboard";
import { useNativeContentPanelText } from "./native-content-editor/useNativeContentPanelText";

type Props = {
  page: number;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  onApplyBytes: (bytes: Uint8Array) => void;
  onClose: () => void;
};

function trimHistory(items: Uint8Array[], maxHistoryBytes: number) {
  const candidates = [...items];
  let total = candidates.reduce((sum, item) => sum + item.byteLength, 0);
  while (candidates.length > 10 || (candidates.length && total > maxHistoryBytes)) {
    total -= candidates[0].byteLength;
    candidates.shift();
  }
  return candidates;
}

function createSerialMutationQueue() {
  let tail = Promise.resolve();
  return <T,>(operation: () => Promise<T>) => {
    const run = tail.then(operation, operation);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

const DEFAULT_DRAFT: NativeContentDraft = {
  size: "12",
  color: "#000000",
  font: "",
  stroke: "#000000",
  strokeWidth: "1",
  renderMode: "fill",
  lineCap: "butt",
  lineJoin: "miter",
  dash: "",
  blendMode: "Normal",
};

export function NativeContentEditorPanel({ page, getDocumentBytes, onApplyBytes, onClose }: Props) {
  const [objects, setObjects] = useState<PdfContentObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraftState] = useState<NativeContentDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const signedEditAcknowledged = useRef(false);
  const confirm = useConfirm();
  const [undoStack, setUndoStack] = useState<Uint8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8Array[]>([]);
  const currentBytesRef = useRef<Uint8Array | null>(null);
  const undoStackRef = useRef<Uint8Array[]>([]);
  const redoStackRef = useRef<Uint8Array[]>([]);
  const enqueueMutation = useRef(createSerialMutationQueue()).current;
  const getDocumentBytesRef = useRef(getDocumentBytes);
  useEffect(() => { getDocumentBytesRef.current = getDocumentBytes; }, [getDocumentBytes]);

  const selected = useMemo(
    () => objects.find((object) => object.id === selectedId) ?? null,
    [objects, selectedId],
  );
  const deepFormReadOnly = Boolean(selected && (selected.depth ?? 0) > 1);
  const setDraft = useCallback((patch: Partial<NativeContentDraft>) => {
    setDraftState((current) => ({ ...current, ...patch }));
  }, []);

  const inspectBytes = useCallback(async (bytes: Uint8Array) => {
    const next = await pdfiumContentEditingEngine.inspectPage(bytes, Math.max(0, page - 1));
    setObjects(next);
    setSelectedId((current) => next.some((item) => item.id === current) ? current : null);
  }, [page]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const bytes = await getDocumentBytesRef.current();
      if (!bytes) throw new Error("Unable to read the current PDF.");
      currentBytesRef.current = bytes;
      setSigned(pdfHasDigitalSignature(bytes));
      await inspectBytes(bytes);
    } catch (error) {
      setObjects([]);
      setSelectedId(null);
      setMessage(error instanceof Error ? error.message : "Unable to inspect PDF content.");
    } finally {
      setLoading(false);
    }
  }, [inspectBytes]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => registerNativeEditSelectionListener((selection) => {
    if (selection.pageIndex === page - 1) setSelectedId(selection.objectId);
  }), [page]);
  useEffect(() => () => clearNativeEditRuntime(), []);

  useEffect(() => {
    if (!selected) return;
    setDraftState({
      size: String(Math.round((selected.fontSize ?? 12) * 100) / 100),
      color: selected.fillColor ?? "#000000",
      font: "",
      stroke: selected.strokeColor ?? "#000000",
      strokeWidth: String(selected.strokeWidth ?? 1),
      renderMode: selected.textRenderMode === "stroke" ||
        selected.textRenderMode === "fill-stroke" ||
        selected.textRenderMode === "invisible" ? selected.textRenderMode : "fill",
      lineCap: selected.lineCap ?? "butt",
      lineJoin: selected.lineJoin ?? "miter",
      dash: (selected.dashArray ?? []).join(" "),
      blendMode: "Normal",
    });
  }, [selected?.id]);

  const apply = useCallback((patches: PdfContentPatch[], success: string) => enqueueMutation(async () => {
    setLoading(true);
    setMessage(null);
    setNativeEditPatchFailure(null);
    try {
      const bytes = currentBytesRef.current ?? await getDocumentBytesRef.current();
      if (!bytes) throw new Error("Unable to read the current PDF.");
      if (!signedEditAcknowledged.current && pdfHasDigitalSignature(bytes)) {
        const proceed = await confirm({
          title: "Digitally signed PDF",
          message: "This PDF is digitally signed. Editing it will invalidate its signature(s). Edit anyway?",
          confirmLabel: "Edit anyway",
          danger: true,
        });
        if (!proceed) {
          setMessage("Edit cancelled: this PDF is digitally signed and was not changed.");
          return null;
        }
        signedEditAcknowledged.current = true;
      }
      const { edited, next } = await applyVerifiedNativePatches(
        bytes, patches, Math.max(0, page - 1),
      );
      const maxHistoryBytes = 128 * 1024 * 1024;
      undoStackRef.current = trimHistory([...undoStackRef.current, bytes], maxHistoryBytes);
      redoStackRef.current = [];
      setUndoStack(undoStackRef.current);
      setRedoStack([]);
      currentBytesRef.current = edited;
      setObjects(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : null);
      onApplyBytes(edited);
      setMessage(bytes.byteLength > maxHistoryBytes
        ? success + " Undo snapshot skipped for this large PDF."
        : success);
      return edited;
    } catch (error) {
      console.error("[tpdf:native-edit] PDF patch rejected:", error);
      setMessage(error instanceof Error ? error.message : "Unable to edit PDF content.");
      setNativeEditPatchFailure(error instanceof Error ? error.message : null);
      return null;
    } finally {
      setLoading(false);
    }
  }), [confirm, enqueueMutation, onApplyBytes, page]);

  useEffect(() => registerNativeEditPatchApplier(apply), [apply]);

  const transform = useCallback((
    matrix: [number, number, number, number, number, number],
    success: string,
  ) => {
    if (selected) void apply([{ type: "relative-transform", objectId: selected.id, matrix }], success);
  }, [apply, selected]);
  const move = useCallback(
    (dx: number, dy: number) => transform([1, 0, 0, 1, dx, dy], "Object moved."),
    [transform],
  );
  const centeredTransform = useCallback((
    a: number,
    b: number,
    c: number,
    d: number,
    success: string,
  ) => {
    if (!selected) return;
    const bounds = selected.localBounds ?? selected.bounds;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    transform([a, b, c, d, cx - a * cx - c * cy, cy - b * cx - d * cy], success);
  }, [selected, transform]);
  const scale = useCallback(
    (factor: number) => centeredTransform(factor, 0, 0, factor, "Object resized."),
    [centeredTransform],
  );
  const rotate = useCallback((degrees: number) => {
    const radians = degrees * Math.PI / 180;
    centeredTransform(
      Math.cos(radians),
      Math.sin(radians),
      -Math.sin(radians),
      Math.cos(radians),
      "Object rotated.",
    );
  }, [centeredTransform]);

  const undo = useCallback(() => enqueueMutation(async () => {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return;
    const current = currentBytesRef.current ?? await getDocumentBytesRef.current();
    if (!current) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-9), current];
    setUndoStack(undoStackRef.current);
    setRedoStack(redoStackRef.current);
    currentBytesRef.current = previous;
    onApplyBytes(previous);
    await inspectBytes(previous);
    setMessage("Native content edit undone.");
  }), [enqueueMutation, inspectBytes, onApplyBytes]);

  const redo = useCallback(() => enqueueMutation(async () => {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    const current = currentBytesRef.current ?? await getDocumentBytesRef.current();
    if (!current) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-9), current];
    setRedoStack(redoStackRef.current);
    setUndoStack(undoStackRef.current);
    currentBytesRef.current = next;
    onApplyBytes(next);
    await inspectBytes(next);
    setMessage("Native content edit redone.");
  }), [enqueueMutation, inspectBytes, onApplyBytes]);

  useEffect(() => registerNativeContentHistoryControls({
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  }), [redo, redoStack.length, undo, undoStack.length]);

  useNativeContentKeyboard({
    selected,
    loading,
    readOnly: deepFormReadOnly,
    apply,
    undo,
    redo,
  });

  const saveTextStyle = useCallback(() => {
    if (!selected || selected.kind !== "text") return;
    const size = Number(draft.size);
    void apply([
      {
        type: "style-text",
        objectId: selected.id,
        fontSize: !deepFormReadOnly && Number.isFinite(size) && size > 0 ? size : undefined,
        fillColor: draft.color,
        fontFamily: !deepFormReadOnly ? draft.font || undefined : undefined,
        strokeColor: draft.stroke,
        strokeWidth: Number.isFinite(Number(draft.strokeWidth)) ? Number(draft.strokeWidth) : undefined,
        renderMode: draft.renderMode,
      },
    ], "Text style updated. Save the document to keep this change.");
  }, [apply, deepFormReadOnly, draft, selected]);

  const selectFromPanel = useCallback((id: string) => {
    // Keep the inspector responsive on large CAD sheets while committing the
    // previous inline edit. The overlay receives the selection only after
    // the previous draft has been safely committed.
    setSelectedId(id);
    void commitPendingNativeInlineEdit()
      .then(() => emitNativeEditSelection({ pageIndex: page - 1, objectId: id }))
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [page]);
  const { editSelectedText, editObjectById, panelTextEditor } = useNativeContentPanelText({
    selected, objects, readOnly: deepFormReadOnly, apply,
  });

  return (
    <aside className="native-content-editor" data-tpdf-native-editor="true">
      <div className="native-content-editor__header">
        <div>
          <strong>Edit PDF Content</strong>
          <div className="native-content-editor__sub">Page {page} · canvas + native PDF objects</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Edit PDF">×</button>
      </div>
      {signed ? <p role="note" className="native-content-editor__message" data-tpdf-signed-note="true">Digitally signed PDF: editing will invalidate its signature(s).</p> : null}
      <NativeContentToolbar page={page} loading={loading} message={message} canUndo={undoStack.length > 0} canRedo={redoStack.length > 0} refresh={refresh} undo={undo} redo={redo} apply={apply} />
      <NativeContentObjectList objects={objects} selectedId={selectedId} loading={loading} onSelect={selectFromPanel} onEditText={editObjectById} />
      {panelTextEditor}
      {selected ? (
        <NativeContentProperties selected={selected} draft={draft} setDraft={setDraft} loading={loading} deepFormReadOnly={deepFormReadOnly} saveTextStyle={saveTextStyle} editSelectedText={editSelectedText} move={move} scale={scale} rotate={rotate} apply={apply} />
      ) : null}
    </aside>
  );
}
