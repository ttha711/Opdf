import { useEffect, useMemo, useState } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";
import { beginViewerContentPick, registerViewerContentAreaListener } from "../lib/viewer-runtime";

type NativeContentEditorPanelProps = {
  page: number;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  onApplyBytes: (bytes: Uint8Array) => void;
  onClose: () => void;
};

export function NativeContentEditorPanel({
  page,
  getDocumentBytes,
  onApplyBytes,
  onClose,
}: NativeContentEditorPanelProps) {
  const [objects, setObjects] = useState<PdfContentObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftSize, setDraftSize] = useState("12");
  const [draftColor, setDraftColor] = useState("#000000");
  const [draftFont, setDraftFont] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Uint8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8Array[]>([]);

  const selected = useMemo(
    () => objects.find((object) => object.id === selectedId) ?? null,
    [objects, selectedId],
  );

  useEffect(() => registerViewerContentAreaListener((area) => {
    if (area.pageIndex !== page - 1 || objects.length === 0) return;
    const x1 = area.rect.origin.x;
    const x2 = x1 + area.rect.size.width;
    const top1 = area.rect.origin.y;
    const top2 = top1 + area.rect.size.height;

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
      const score = overlap / objectArea;
      if (score > 0 && (!best || score > best.score)) best = { id: object.id, score };
    }
    if (best) {
      setSelectedId(best.id);
      setMessage("Object selected from page.");
    } else {
      setMessage("No editable object intersects that area.");
    }
  }), [objects, page]);

  const refresh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const bytes = await getDocumentBytes();
      if (!bytes) throw new Error("Unable to read the current PDF.");
      const next = await pdfiumContentEditingEngine.inspectPage(bytes, Math.max(0, page - 1));
      setObjects(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (error) {
      setObjects([]);
      setSelectedId(null);
      setMessage(error instanceof Error ? error.message : "Unable to inspect PDF content.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [page]);

  useEffect(() => {
    if (!selected) return;
    setDraftText(selected.text ?? "");
    setDraftSize(String(Math.round((selected.fontSize ?? 12) * 100) / 100));
    setDraftColor(selected.fillColor ?? "#000000");
    setDraftFont("");
  }, [selected?.id]);

  const apply = async (patches: PdfContentPatch[], success: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const bytes = await getDocumentBytes();
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
      onApplyBytes(edited);
      setMessage(bytes.byteLength > maxHistoryBytes ? success + " Undo snapshot skipped for this large PDF." : success);
      window.setTimeout(() => void refresh(), 50);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to edit PDF content.");
    } finally {
      setLoading(false);
    }
  };

  const transform = (matrix: [number, number, number, number, number, number], success: string) => {
    if (!selected) return;
    void apply([{ type: "relative-transform", objectId: selected.id, matrix }], success);
  };

  const move = (dx: number, dy: number) => transform([1, 0, 0, 1, dx, dy], "Object moved.");
  const centeredTransform = (a: number, b: number, c: number, d: number, success: string) => {
    if (!selected) return;
    const cx = selected.bounds.x + selected.bounds.width / 2;
    const cy = selected.bounds.y + selected.bounds.height / 2;
    const e = cx - a * cx - c * cy;
    const f = cy - b * cx - d * cy;
    transform([a, b, c, d, e, f], success);
  };
  const scale = (factor: number) => centeredTransform(factor, 0, 0, factor, "Object resized.");
  const rotate = (degrees: number) => {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    centeredTransform(cos, sin, -sin, cos, "Object rotated.");
  };

  const undo = async () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    const current = await getDocumentBytes();
    if (!current) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items.slice(-9), current]);
    onApplyBytes(previous);
    setMessage("Native content edit undone.");
    window.setTimeout(() => void refresh(), 50);
  };

  const redo = async () => {
    const next = redoStack.at(-1);
    if (!next) return;
    const current = await getDocumentBytes();
    if (!current) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items.slice(-9), current]);
    onApplyBytes(next);
    setMessage("Native content edit redone.");
    window.setTimeout(() => void refresh(), 50);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) void redo();
      else void undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoStack, redoStack]);

  const saveText = () => {
    if (!selected || selected.kind !== "text") return;
    const patches: PdfContentPatch[] = [
      { type: "replace-text", objectId: selected.id, text: draftText },
    ];
    const size = Number(draftSize);
    if (Number.isFinite(size) && size > 0) {
      patches.push({
        type: "style-text",
        objectId: selected.id,
        fontSize: size,
        fillColor: draftColor,
        fontFamily: draftFont || undefined,
      });
    }
    void apply(patches, "Native PDF text updated.");
  };

  return (
    <aside className="native-content-editor" data-opdf-native-editor="true">
      <div className="native-content-editor__header">
        <div>
          <strong>Edit PDF Content</strong>
          <div className="native-content-editor__sub">Page {page} · native PDF objects</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Edit PDF">×</button>
      </div>

      {message ? <div className="native-content-editor__message">{message}</div> : null}
      <div className="native-content-editor__row">
        <button type="button" className="native-content-editor__refresh" onClick={beginViewerContentPick} disabled={loading}>
          Pick on page
        </button>
        <button type="button" className="native-content-editor__refresh" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Working…" : "Refresh"}
        </button>
      </div>
      <div className="native-content-editor__row">
        <button type="button" className="native-content-editor__refresh" onClick={() => void undo()} disabled={!undoStack.length || loading}>
          Undo
        </button>
        <button type="button" className="native-content-editor__refresh" onClick={() => void redo()} disabled={!redoStack.length || loading}>
          Redo
        </button>
      </div>

      <div className="native-content-editor__objects">
        {objects.map((object) => (
          <button
            type="button"
            key={object.id}
            className={object.id === selectedId ? "active" : ""}
            onClick={() => setSelectedId(object.id)}
          >
            <span>{object.kind.toUpperCase()}</span>
            <small>{object.kind === "text" ? (object.text || "(empty text)").slice(0, 48) : object.id}</small>
          </button>
        ))}
        {!loading && objects.length === 0 ? <p>No editable page objects found.</p> : null}
      </div>

      {selected ? (
        <div className="native-content-editor__properties">
          <div className="native-content-editor__meta">
            <strong>{selected.kind}</strong>
            <span>{selected.id}</span>
          </div>

          {selected.kind === "text" ? (
            <>
              <label>
                Text
                <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={5} />
              </label>
              <div className="native-content-editor__row">
                <label>
                  Font size
                  <input value={draftSize} onChange={(event) => setDraftSize(event.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Color
                  <input type="color" value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
                </label>
              </div>
              <label>
                Font
                <select value={draftFont} onChange={(event) => setDraftFont(event.target.value)}>
                  <option value="">Keep existing ({selected.fontFamily || "embedded font"})</option>
                  <option value="__opdf_unicode__">Noto Sans Unicode / Vietnamese</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times-Roman">Times</option>
                  <option value="Courier">Courier</option>
                </select>
              </label>
              <button type="button" className="primary" onClick={saveText} disabled={loading}>Apply text</button>
            </>
          ) : null}

          <div className="native-content-editor__move">
            <span>Move object</span>
            <div>
              <button type="button" onClick={() => move(-5, 0)}>←</button>
              <button type="button" onClick={() => move(0, 5)}>↑</button>
              <button type="button" onClick={() => move(0, -5)}>↓</button>
              <button type="button" onClick={() => move(5, 0)}>→</button>
            </div>
          </div>
          <div className="native-content-editor__move">
            <span>Transform</span>
            <div>
              <button type="button" onClick={() => scale(0.9)}>− Size</button>
              <button type="button" onClick={() => scale(1.1)}>+ Size</button>
              <button type="button" onClick={() => rotate(-5)}>↶ 5°</button>
              <button type="button" onClick={() => rotate(5)}>↷ 5°</button>
            </div>
          </div>

          {selected.kind === "image" ? (
            <label>
              Replace image
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
                  void file.arrayBuffer().then((buffer) =>
                    apply(
                      [{ type: "replace-image", objectId: selected.id, bytes: new Uint8Array(buffer), mimeType }],
                      "Image replaced.",
                    ),
                  );
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : null}

          {selected.kind === "path" ? (
            <div className="native-content-editor__row">
              <label>
                Fill
                <input
                  type="color"
                  value={draftColor}
                  onChange={(event) => {
                    setDraftColor(event.target.value);
                    void apply([{ type: "style-object", objectId: selected.id, fillColor: event.target.value }], "Path fill updated.");
                  }}
                />
              </label>
            </div>
          ) : null}

          <button
            type="button"
            className="danger"
            onClick={() => void apply([{ type: "delete", objectId: selected.id }], "Object deleted.")}
            disabled={loading}
          >
            Delete object
          </button>
        </div>
      ) : null}
    </aside>
  );
}
