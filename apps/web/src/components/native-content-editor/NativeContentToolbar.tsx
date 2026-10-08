import type { PdfContentPatch } from "@opdf/core";

type Props = {
  page: number;
  loading: boolean;
  message: string | null;
  canUndo: boolean;
  canRedo: boolean;
  refresh: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  apply: (patches: PdfContentPatch[], success: string) => Promise<unknown>;
};

export function NativeContentToolbar({
  page,
  loading,
  message,
  canUndo,
  canRedo,
  refresh,
  undo,
  redo,
  apply,
}: Props) {
  return (
    <>
      {message ? <div className="native-content-editor__message">{message}</div> : null}
      <div className="native-content-editor__row">
        <span className="native-content-editor__sub">Click objects directly on the PDF canvas.</span>
        <button type="button" className="native-content-editor__refresh" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Working…" : "Refresh"}
        </button>
      </div>
      <div className="native-content-editor__row">
        <button
          type="button"
          className="native-content-editor__refresh"
          onClick={() => void apply([{
            type: "add-text",
            pageIndex: Math.max(0, page - 1),
            text: "New text",
            x: 48,
            y: 72,
            fontSize: 18,
            fillColor: "#000000",
            fontFamily: "__opdf_unicode__",
          }], "Native text object added.")}
          disabled={loading}
        >
          + Text
        </button>
        <button
          type="button"
          className="native-content-editor__refresh"
          onClick={() => void apply([{
            type: "add-rect",
            pageIndex: Math.max(0, page - 1),
            x: 48,
            y: 48,
            width: 120,
            height: 60,
            fillColor: "#ffffff",
            strokeColor: "#000000",
            strokeWidth: 1,
            fillMode: "winding",
            stroke: true,
          }], "Native rectangle added.")}
          disabled={loading}
        >
          + Rectangle
        </button>
      </div>
      <label className="native-content-editor__add-image">
        + Image
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
            void file.arrayBuffer().then((buffer) => apply([{
              type: "add-image",
              pageIndex: Math.max(0, page - 1),
              bytes: new Uint8Array(buffer),
              mimeType,
              x: 48,
              y: 48,
              width: 160,
              height: 120,
            }], "Native image object added."));
            event.currentTarget.value = "";
          }}
        />
      </label>
      <div className="native-content-editor__row">
        <button type="button" className="native-content-editor__refresh" onClick={() => void undo()} disabled={!canUndo || loading}>
          Undo
        </button>
        <button type="button" className="native-content-editor__refresh" onClick={() => void redo()} disabled={!canRedo || loading}>
          Redo
        </button>
      </div>
    </>
  );
}
