import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfContentObject, PdfContentPatch, PdfPoint, PdfQuad } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";
import { registerViewerContentAreaListener } from "../lib/viewer-runtime";
import { registerNativeContentHistoryControls } from "../lib/nativeContentHistory";
import { NativeContentObjectList } from "./native-content-editor/NativeContentObjectList";
import { NativeContentProperties, type NativeContentDraft } from "./native-content-editor/NativeContentProperties";
import { NativeContentToolbar } from "./native-content-editor/NativeContentToolbar";

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

function pointInQuad(point: PdfPoint, quad: PdfQuad) {
  let sign = 0;
  for (let index = 0; index < quad.length; index += 1) {
    const a = quad[index];
    const b = quad[(index + 1) % quad.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) < 0.0001) continue;
    const nextSign = Math.sign(cross);
    if (sign && nextSign !== sign) return false;
    sign = nextSign;
  }
  return true;
}

export function NativeContentEditorPanel({ page, getDocumentBytes, onApplyBytes, onClose }: Props) {
  const [objects, setObjects] = useState<PdfContentObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraftState] = useState<NativeContentDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Uint8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8Array[]>([]);
  const currentBytesRef = useRef<Uint8Array | null>(null);

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
    setSelectedId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
  }, [page]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const bytes = await getDocumentBytes();
      if (!bytes) throw new Error("Unable to read the current PDF.");
      currentBytesRef.current = bytes;
      await inspectBytes(bytes);
    } catch (error) {
      setObjects([]);
      setSelectedId(null);
      setMessage(error instanceof Error ? error.message : "Unable to inspect PDF content.");
    } finally {
      setLoading(false);
    }
  }, [getDocumentBytes, inspectBytes]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => registerViewerContentAreaListener((area) => {
    if (area.pageIndex !== page - 1 || objects.length === 0) return;
    const x1 = area.rect.origin.x;
    const x2 = x1 + area.rect.size.width;
    const top1 = area.rect.origin.y;
    const top2 = top1 + area.rect.size.height;
    const pickPoint = { x: (x1 + x2) / 2, y: objects[0].pageHeight - (top1 + top2) / 2 };
    let best: { id: string; score: number } | null = null;

    for (const object of objects) {
      const ox1 = object.bounds.x;
      const ox2 = object.bounds.x + object.bounds.width;
      const objectTop = object.pageHeight - object.bounds.y - object.bounds.height;
      const objectBottom = object.pageHeight - object.bounds.y;
      const overlapWidth = Math.max(0, Math.min(x2, ox2) - Math.max(x1, ox1));
      const overlapHeight = Math.max(0, Math.min(top2, objectBottom) - Math.max(top1, objectTop));
      const overlap = overlapWidth * overlapHeight;
      const objectArea = Math.max(1, object.bounds.width * object.bounds.height);
      const insideRotated = object.rotatedBounds ? pointInQuad(pickPoint, object.rotatedBounds) : false;
      const score = (insideRotated ? 10 : 0) + overlap / objectArea + (object.depth ?? 0) * 0.1 + 1 / objectArea;
      if ((insideRotated || overlap > 0) && (!best || score > best.score)) best = { id: object.id, score };
    }

    setSelectedId(best?.id ?? null);
    setMessage(best ? "Object selected from page." : "No editable object intersects that area.");
  }), [objects, page]);

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

  const apply = useCallback(async (patches: PdfContentPatch[], success: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const bytes = currentBytesRef.current ?? await getDocumentBytes();
      if (!bytes) throw new Error("Unable to read the current PDF.");
      const edited = await pdfiumContentEditingEngine.applyPatches(bytes, patches);
      const maxHistoryBytes = 128 * 1024 * 1024;
      setUndoStack((current) => {
        const candidates = [...current, bytes];
        let total = candidates.reduce((sum, item) => sum + item.byteLength, 0);
        while (candidates.length > 10 || (candidates.length > 0 && total > maxHistoryBytes)) {
          total -= candidates[0].byteLength;
          candidates.shift();
        }
        return candidates;
      });
      setRedoStack([]);
      currentBytesRef.current = edited;
      onApplyBytes(edited);
      await inspectBytes(edited);
      setMessage(bytes.byteLength > maxHistoryBytes ? success + " Undo snapshot skipped for this large PDF." : success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to edit PDF content.");
    } finally {
      setLoading(false);
    }
  }, [getDocumentBytes, inspectBytes, onApplyBytes]);

  const transform = useCallback((matrix: [number, number, number, number, number, number], success: string) => {
    if (selected) void apply([{ type: "relative-transform", objectId: selected.id, matrix }], success);
  }, [apply, selected]);
  const move = useCallback((dx: number, dy: number) => transform([1, 0, 0, 1, dx, dy], "Object moved."), [transform]);
  const centeredTransform = useCallback((a: number, b: number, c: number, d: number, success: string) => {
    if (!selected) return;
    const bounds = selected.localBounds ?? selected.bounds;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    transform([a, b, c, d, cx - a * cx - c * cy, cy - b * cx - d * cy], success);
  }, [selected, transform]);
  const scale = useCallback((factor: number) => centeredTransform(factor, 0, 0, factor, "Object resized."), [centeredTransform]);
  const rotate = useCallback((degrees: number) => {
    const radians = degrees * Math.PI / 180;
    centeredTransform(Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), "Object rotated.");
  }, [centeredTransform]);

  const undo = useCallback(async () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    const current = currentBytesRef.current ?? await getDocumentBytes();
    if (!current) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items.slice(-9), current]);
    currentBytesRef.current = previous;
    onApplyBytes(previous);
    await inspectBytes(previous);
    setMessage("Native content edit undone.");
  }, [getDocumentBytes, inspectBytes, onApplyBytes, undoStack]);

  const redo = useCallback(async () => {
    const next = redoStack.at(-1);
    if (!next) return;
    const current = currentBytesRef.current ?? await getDocumentBytes();
    if (!current) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items.slice(-9), current]);
    currentBytesRef.current = next;
    onApplyBytes(next);
    await inspectBytes(next);
    setMessage("Native content edit redone.");
  }, [getDocumentBytes, inspectBytes, onApplyBytes, redoStack]);

  useEffect(() => registerNativeContentHistoryControls({
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  }), [redo, redoStack.length, undo, undoStack.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
        return;
      }
      if (!selected || deepFormReadOnly || loading) return;
      const step = event.shiftKey ? 10 : 1;
      const arrow = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key] as [number, number] | undefined;
      if (arrow) {
        event.preventDefault();
        move(...arrow);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void apply([{ type: "delete", objectId: selected.id }], "Object deleted.");
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void apply([{ type: "duplicate", objectId: selected.id, offsetX: 12, offsetY: -12 }], "Object duplicated.");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [apply, deepFormReadOnly, loading, move, redo, selected, undo]);

  const saveText = useCallback(() => {
    if (!selected || selected.kind !== "text") return;
    const size = Number(draft.size);
    void apply([
      { type: "replace-text", objectId: selected.id, text: draft.text },
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
    ], "Native PDF text updated.");
  }, [apply, deepFormReadOnly, draft, selected]);

  return (
    <aside className="native-content-editor" data-opdf-native-editor="true">
      <div className="native-content-editor__header">
        <div><strong>Edit PDF Content</strong><div className="native-content-editor__sub">Page {page} · native PDF objects</div></div>
        <button type="button" onClick={onClose} aria-label="Close Edit PDF">×</button>
      </div>
      <NativeContentToolbar page={page} loading={loading} message={message} canUndo={undoStack.length > 0} canRedo={redoStack.length > 0} refresh={refresh} undo={undo} redo={redo} apply={apply} />
      <NativeContentObjectList objects={objects} selectedId={selectedId} loading={loading} onSelect={setSelectedId} />
      {selected ? (
        <NativeContentProperties selected={selected} draft={draft} setDraft={setDraft} loading={loading} deepFormReadOnly={deepFormReadOnly} saveText={saveText} move={move} scale={scale} rotate={rotate} apply={apply} />
      ) : null}
    </aside>
  );
}
