import { useEffect, useMemo, useState } from "react";
import type { PdfContentObject, PdfContentPatch } from "@opdf/core";
import { pdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";

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

  const selected = useMemo(
    () => objects.find((object) => object.id === selectedId) ?? null,
    [objects, selectedId],
  );

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
      onApplyBytes(edited);
      setMessage(success);
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
  const scale = (factor: number) => transform([factor, 0, 0, factor, 0, 0], "Object resized.");
  const rotate = (degrees: number) => {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    transform([cos, sin, -sin, cos, 0, 0], "Object rotated.");
  };

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
      <button type="button" className="native-content-editor__refresh" onClick={() => void refresh()} disabled={loading}>
        {loading ? "Working…" : "Refresh objects"}
      </button>

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
