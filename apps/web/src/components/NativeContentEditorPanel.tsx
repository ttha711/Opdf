import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";
import { registerNativeContentHistoryControls } from "../lib/nativeContentHistory";
import {
  clearNativeEditRuntime,
  commitNativeInlineEdit,
  emitNativeEditSelection,
  refreshNativeEditRenderer,
  registerNativeEditPatchApplier,
  registerNativeEditSelectionListener,
  setNativeEditWorkingBytes,
} from "../lib/nativeEditRuntime";
import { NativeContentObjectList } from "./native-content-editor/NativeContentObjectList";
import { NativeContentProperties, type NativeContentDraft } from "./native-content-editor/NativeContentProperties";
import { NativeContentToolbar } from "./native-content-editor/NativeContentToolbar";
import { useNativeContentKeyboard } from "./native-content-editor/useNativeContentKeyboard";

type Props = {
  page: number;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  onApplyBytes: (bytes: Uint8Array) => void;
  onClose: () => void;
};

const DEFAULT_DRAFT: NativeContentDraft = {
  text: "",
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
  const [undoStack, setUndoStack] = useState<Uint8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8Array[]>([]);
  const currentBytesRef = useRef<Uint8Array | null>(null);
  const undoStackRef = useRef<Uint8Array[]>([]);
  const redoStackRef = useRef<Uint8Array[]>([]);
  const mutationTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingMutationsRef = useRef(0);
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

  const enqueueMutation = useCallback((operation: () => Promise<void>) => {
    pendingMutationsRef.current += 1;
    setLoading(true);
    const run = mutationTailRef.current.then(operation, operation);
    mutationTailRef.current = run.catch(() => {});
    return run.finally(() => {
      pendingMutationsRef.current -= 1;
      if (pendingMutationsRef.current === 0) setLoading(false);
    });
  }, []);

  const syncUndoStack = useCallback((items: Uint8Array[]) => {
    undoStackRef.current = items;
    setUndoStack(items);
  }, []);
  const syncRedoStack = useCallback((items: Uint8Array[]) => {
    redoStackRef.current = items;
    setRedoStack(items);
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
      setNativeEditWorkingBytes(bytes);
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
      text: selected.text ?? "",
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
    setMessage(null);
    try {
      const bytes = currentBytesRef.current ?? await getDocumentBytesRef.current();
      if (!bytes) throw new Error("Unable to read the current PDF.");
      const edited = await pdfiumContentEditingEngine.applyPatches(bytes, patches);
      const maxHistoryBytes = 128 * 1024 * 1024;
      const candidates = [...undoStackRef.current, bytes];
      let total = candidates.reduce((sum, item) => sum + item.byteLength, 0);
      while (candidates.length > 10 || (candidates.length && total > maxHistoryBytes)) {
        total -= candidates[0].byteLength;
        candidates.shift();
      }
      syncUndoStack(candidates);
      syncRedoStack([]);
      currentBytesRef.current = edited;
      setNativeEditWorkingBytes(edited);
      await inspectBytes(edited);
      onApplyBytes(edited);
      await refreshNativeEditRenderer(edited);
      setMessage(bytes.byteLength > maxHistoryBytes
        ? success + " Undo snapshot skipped for this large PDF."
        : success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to edit PDF content.");
    }
  }), [enqueueMutation, inspectBytes, onApplyBytes, syncRedoStack, syncUndoStack]);

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
    syncUndoStack(undoStackRef.current.slice(0, -1));
    syncRedoStack([...redoStackRef.current.slice(-9), current]);
    currentBytesRef.current = previous;
    setNativeEditWorkingBytes(previous);
    await inspectBytes(previous);
    onApplyBytes(previous);
    await refreshNativeEditRenderer(previous);
    setMessage("Native content edit undone.");
  }), [enqueueMutation, inspectBytes, onApplyBytes, syncRedoStack, syncUndoStack]);

  const redo = useCallback(() => enqueueMutation(async () => {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    const current = currentBytesRef.current ?? await getDocumentBytesRef.current();
    if (!current) return;
    syncRedoStack(redoStackRef.current.slice(0, -1));
    syncUndoStack([...undoStackRef.current.slice(-9), current]);
    currentBytesRef.current = next;
    setNativeEditWorkingBytes(next);
    await inspectBytes(next);
    onApplyBytes(next);
    await refreshNativeEditRenderer(next);
    setMessage("Native content edit redone.");
  }), [enqueueMutation, inspectBytes, onApplyBytes, syncRedoStack, syncUndoStack]);

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

  const saveText = useCallback(() => {
    if (!selected || selected.kind !== "text") return;
    const size = Number(draft.size);
    const unicodeFallback = /[^\x00-\x7F]/.test(draft.text);
    const fontFamily = !deepFormReadOnly
      ? unicodeFallback ? "__opdf_unicode__" : draft.font || undefined
      : undefined;
    void apply([
      {
        type: "style-text",
        objectId: selected.id,
        fontSize: !deepFormReadOnly && Number.isFinite(size) && size > 0 ? size : undefined,
        fillColor: draft.color,
        fontFamily,
        strokeColor: draft.stroke,
        strokeWidth: Number.isFinite(Number(draft.strokeWidth)) ? Number(draft.strokeWidth) : undefined,
        renderMode: draft.renderMode,
      },
      { type: "replace-text", objectId: selected.id, text: draft.text },
    ], "Native PDF text updated.");
  }, [apply, deepFormReadOnly, draft, selected]);

  const selectFromPanel = useCallback((id: string) => {
    void commitNativeInlineEdit().then(() => {
      setSelectedId(id);
      emitNativeEditSelection({ pageIndex: page - 1, objectId: id });
    });
  }, [page]);

  return (
    <aside className="native-content-editor" data-opdf-native-editor="true">
      <div className="native-content-editor__header">
        <div>
          <strong>Edit PDF Content</strong>
          <div className="native-content-editor__sub">Page {page} · canvas + native PDF objects</div>
        </div>
        <button
          type="button"
          onClick={() => void commitNativeInlineEdit().then(onClose)}
          aria-label="Close Edit PDF"
        >×</button>
      </div>
      <NativeContentToolbar page={page} loading={loading} message={message} canUndo={undoStack.length > 0} canRedo={redoStack.length > 0} refresh={refresh} undo={undo} redo={redo} apply={apply} />
      <NativeContentObjectList objects={objects} selectedId={selectedId} loading={loading} onSelect={selectFromPanel} />
      {selected ? (
        <NativeContentProperties selected={selected} draft={draft} setDraft={setDraft} loading={loading} deepFormReadOnly={deepFormReadOnly} saveText={saveText} move={move} scale={scale} rotate={rotate} apply={apply} />
      ) : null}
    </aside>
  );
}
