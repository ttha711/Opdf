import type { PdfBlendMode, PdfContentObject, PdfContentPatch } from "@opdf/core";
import { PathGeometryEditor } from "../PathGeometryEditor";

export type NativeContentDraft = {
  size: string;
  color: string;
  font: string;
  stroke: string;
  strokeWidth: string;
  renderMode: "fill" | "stroke" | "fill-stroke" | "invisible";
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  dash: string;
  blendMode: PdfBlendMode;
};

type Props = {
  selected: PdfContentObject;
  draft: NativeContentDraft;
  setDraft: (patch: Partial<NativeContentDraft>) => void;
  loading: boolean;
  deepFormReadOnly: boolean;
  saveTextStyle: () => void;
  editSelectedText: () => void;
  move: (dx: number, dy: number) => void;
  scale: (factor: number) => void;
  rotate: (degrees: number) => void;
  apply: (patches: PdfContentPatch[], success: string) => Promise<unknown>;
};

const BLEND_MODES: PdfBlendMode[] = [
  "Normal", "Multiply", "Screen", "Overlay", "Darken", "Lighten",
  "ColorDodge", "ColorBurn", "HardLight", "SoftLight", "Difference",
  "Exclusion", "Hue", "Saturation", "Color", "Luminosity",
];

export function NativeContentProperties({
  selected,
  draft,
  setDraft,
  loading,
  deepFormReadOnly,
  saveTextStyle,
  editSelectedText,
  move,
  scale,
  rotate,
  apply,
}: Props) {
  return (
    <fieldset className="native-content-editor__properties" disabled={deepFormReadOnly}>
      <div className="native-content-editor__meta">
        <strong>{selected.kind}</strong>
        <span>{selected.id}</span>
      </div>
      {deepFormReadOnly ? (
        <div className="native-content-editor__object-info">
          <strong>Deep Form object is inspect-only</strong>
          <span>PDFium can enumerate this depth, but cannot safely persist mutations beyond one Form level.</span>
        </div>
      ) : selected.depth === 1 ? (
        <div className="native-content-editor__object-info">
          <strong>Persistent Form edit</strong>
          <span>OPDF promotes this child to a page-level object before persistence-safe editing.</span>
        </div>
      ) : null}

      {selected.kind === "text" ? (
        <>
          <button type="button" onClick={editSelectedText} disabled={loading || deepFormReadOnly}>
            Edit selected text
          </button>
          <div className="native-content-editor__row">
            <label>
              Font size
              <input
                value={draft.size}
                onChange={(event) => setDraft({ size: event.target.value })}
                inputMode="decimal"
                disabled={deepFormReadOnly}
              />
            </label>
            <label>
              Color
              <input type="color" value={draft.color} onChange={(event) => setDraft({ color: event.target.value })} />
            </label>
          </div>
          <label>
            Font
            <select value={draft.font} onChange={(event) => setDraft({ font: event.target.value })} disabled={deepFormReadOnly}>
              <option value="">Keep existing ({selected.fontFamily || "embedded font"})</option>
              <option value="__opdf_unicode__">Noto Sans Unicode / Vietnamese</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times-Roman">Times</option>
              <option value="Courier">Courier</option>
            </select>
          </label>
          <div className="native-content-editor__row">
            <label>
              Render
              <select
                value={draft.renderMode}
                onChange={(event) => setDraft({ renderMode: event.target.value as NativeContentDraft["renderMode"] })}
              >
                <option value="fill">Fill</option>
                <option value="stroke">Stroke</option>
                <option value="fill-stroke">Fill + stroke</option>
                <option value="invisible">Invisible</option>
              </select>
            </label>
            <label>
              Stroke
              <input type="color" value={draft.stroke} onChange={(event) => setDraft({ stroke: event.target.value })} />
            </label>
          </div>
          <button type="button" className="primary" onClick={saveTextStyle} disabled={loading}>Apply text style</button>
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
      <div className="native-content-editor__move">
        <span>Object</span>
        <div>
          <button
            type="button"
            onClick={() => void apply([{ type: "duplicate", objectId: selected.id, offsetX: 12, offsetY: -12 }], "Object duplicated.")}
            disabled={loading || deepFormReadOnly || !["text", "image", "path"].includes(selected.kind)}
          >
            Duplicate
          </button>
        </div>
      </div>

      {selected.kind === "image" ? (
        <>
          {selected.imageInfo ? (
            <div className="native-content-editor__object-info">
              <strong>{selected.imageInfo.width} × {selected.imageInfo.height}px</strong>
              <span>{selected.imageInfo.filters.length ? selected.imageInfo.filters.join(" → ") : "No PDF image filter reported"}</span>
            </div>
          ) : null}
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
                  apply([{ type: "replace-image", objectId: selected.id, bytes: new Uint8Array(buffer), mimeType }], "Image replaced."),
                );
                event.currentTarget.value = "";
              }}
            />
          </label>
          <div className="native-content-editor__move">
            <span>Crop image 5%</span>
            <div>
              <button type="button" onClick={() => void apply([{ type: "crop-image", objectId: selected.id, left: 0.05, top: 0, right: 0, bottom: 0 }], "Image cropped from left.")}>Left</button>
              <button type="button" onClick={() => void apply([{ type: "crop-image", objectId: selected.id, left: 0, top: 0.05, right: 0, bottom: 0 }], "Image cropped from top.")}>Top</button>
              <button type="button" onClick={() => void apply([{ type: "crop-image", objectId: selected.id, left: 0, top: 0, right: 0.05, bottom: 0 }], "Image cropped from right.")}>Right</button>
              <button type="button" onClick={() => void apply([{ type: "crop-image", objectId: selected.id, left: 0, top: 0, right: 0, bottom: 0.05 }], "Image cropped from bottom.")}>Bottom</button>
            </div>
          </div>
        </>
      ) : null}

      {selected.kind === "path" ? (
        <>
          <div className="native-content-editor__row">
            <label>Fill<input type="color" value={draft.color} onChange={(event) => setDraft({ color: event.target.value })} /></label>
            <label>Stroke<input type="color" value={draft.stroke} onChange={(event) => setDraft({ stroke: event.target.value })} /></label>
          </div>
          <label>
            Stroke width
            <input value={draft.strokeWidth} inputMode="decimal" onChange={(event) => setDraft({ strokeWidth: event.target.value })} />
          </label>
          <div className="native-content-editor__row">
            <label>
              Line cap
              <select value={draft.lineCap} onChange={(event) => setDraft({ lineCap: event.target.value as NativeContentDraft["lineCap"] })}>
                <option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option>
              </select>
            </label>
            <label>
              Line join
              <select value={draft.lineJoin} onChange={(event) => setDraft({ lineJoin: event.target.value as NativeContentDraft["lineJoin"] })}>
                <option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option>
              </select>
            </label>
          </div>
          <label>Dash pattern<input value={draft.dash} placeholder="e.g. 6 3" onChange={(event) => setDraft({ dash: event.target.value })} /></label>
          <button
            type="button"
            className="primary"
            onClick={() => {
              const strokeWidth = Number(draft.strokeWidth);
              void apply([{
                type: "style-object",
                objectId: selected.id,
                fillColor: draft.color,
                strokeColor: draft.stroke,
                strokeWidth: Number.isFinite(strokeWidth) && strokeWidth >= 0 ? strokeWidth : undefined,
                lineCap: draft.lineCap,
                lineJoin: draft.lineJoin,
                dashArray: draft.dash.trim() ? draft.dash.trim().split(/[ ,]+/).map(Number).filter((value) => Number.isFinite(value) && value >= 0) : undefined,
                dashPhase: 0,
              }], "Path style updated.");
            }}
            disabled={loading}
          >
            Apply path style
          </button>
          {deepFormReadOnly ? (
            <div className="native-content-editor__object-info"><span>Path geometry is inspect-only at this Form depth.</span></div>
          ) : (
            <PathGeometryEditor
              key={selected.id}
              commands={selected.pathCommands ?? []}
              disabled={loading}
              onApply={(commands) => void apply([{ type: "replace-path", objectId: selected.id, commands }], "Path geometry updated.")}
            />
          )}
        </>
      ) : null}

      {selected.kind === "form" ? (
        <div className="native-content-editor__object-info">
          <strong>Form XObject</strong>
          <span>{selected.formChildCount ?? 0} nested page object(s).</span>
        </div>
      ) : null}
      {selected.rotatedBounds ? (
        <div className="native-content-editor__object-info" data-opdf-rotated-selection="true">
          <strong>Rotated bounds active</strong>
          <span>Selection uses PDFium's tight quadrilateral.</span>
        </div>
      ) : null}
      {selected.parentId ? (
        <div className="native-content-editor__object-info"><strong>Nested in {selected.parentId}</strong><span>Depth {selected.depth}</span></div>
      ) : null}

      <label>
        Blend mode
        <select value={draft.blendMode} onChange={(event) => setDraft({ blendMode: event.target.value as PdfBlendMode })}>
          {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </label>
      <button
        type="button"
        onClick={() => void apply([{ type: "style-object", objectId: selected.id, blendMode: draft.blendMode }], `Blend mode set to ${draft.blendMode}.`)}
        disabled={loading}
      >
        Apply blend mode
      </button>
      {selected.hasTransparency ? <div className="native-content-editor__object-info"><span>Uses transparency</span></div> : null}
      <button type="button" className="danger" onClick={() => void apply([{ type: "delete", objectId: selected.id }], "Object deleted.")} disabled={loading}>
        Delete object
      </button>
    </fieldset>
  );
}
