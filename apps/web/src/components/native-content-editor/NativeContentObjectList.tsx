import type { PdfContentObject } from "@opdf/core";

type Props = {
  objects: PdfContentObject[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
};

export function NativeContentObjectList({ objects, selectedId, loading, onSelect }: Props) {
  return (
    <div className="native-content-editor__objects">
      {objects.map((object) => (
        <button
          type="button"
          key={object.id}
          className={object.id === selectedId ? "active" : ""}
          onClick={() => onSelect(object.id)}
          data-opdf-object-id={object.id}
          data-opdf-object-kind={object.kind}
          data-opdf-object-depth={object.depth ?? 0}
          data-opdf-rotated-bounds={object.rotatedBounds ? "true" : "false"}
          data-opdf-bounds={`${object.bounds.x},${object.bounds.y},${object.bounds.width},${object.bounds.height}`}
          data-opdf-fill-color={object.fillColor ?? ""}
          data-opdf-stroke-color={object.strokeColor ?? ""}
          style={{ paddingLeft: 8 + (object.depth ?? 0) * 14 }}
        >
          <span>{object.depth ? "↳ " : ""}{object.kind.toUpperCase()}</span>
          <small>{object.kind === "text" ? (object.text || "(empty text)").slice(0, 48) : object.id}</small>
        </button>
      ))}
      {!loading && objects.length === 0 ? <p>No editable page objects found.</p> : null}
    </div>
  );
}
