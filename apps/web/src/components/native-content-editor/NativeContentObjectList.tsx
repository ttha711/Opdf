import { useMemo, useState } from "react";
import type { PdfContentObject } from "@opdf/core";

const BATCH_SIZE = 200;

type Props = {
  objects: PdfContentObject[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
};

export function NativeContentObjectList({ objects, selectedId, loading, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(BATCH_SIZE);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return objects;
    return objects.filter((object) =>
      object.id.toLowerCase().includes(term) ||
      object.kind.includes(term) ||
      (object.text ?? "").toLowerCase().includes(term),
    );
  }, [objects, query]);
  const shown = filtered.slice(0, limit);
  const selected = objects.find((object) => object.id === selectedId);
  if (selected && !shown.some((object) => object.id === selected.id)) shown.push(selected);

  return (
    <div className="native-content-editor__objects">
      {objects.length > BATCH_SIZE ? (
        <input
          type="search"
          aria-label="Find PDF object"
          placeholder="Find text, type or object ID"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(BATCH_SIZE); }}
        />
      ) : null}
      {shown.map((object) => (
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
      {!loading && filtered.length === 0 ? <p>No matching PDF objects found.</p> : null}
      {filtered.length > BATCH_SIZE ? (
        <div>
          <small>Showing {Math.min(limit, filtered.length)} of {filtered.length} objects</small>
          {limit < filtered.length ? (
            <button type="button" onClick={() => setLimit((count) => count + BATCH_SIZE)}>
              Show next {BATCH_SIZE} objects
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
