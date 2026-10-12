import { useMemo, useState } from "react";
import type { PdfContentObject } from "@tpdf/core";

const BATCH_SIZE = 200;
type ObjectKind = "all" | "text" | "image" | "path" | "form";
const FILTERS: { kind: ObjectKind; label: string }[] = [
  { kind: "all", label: "All" }, { kind: "text", label: "Text" },
  { kind: "image", label: "Images" }, { kind: "path", label: "Paths" },
  { kind: "form", label: "Forms" },
];

type Props = {
  objects: PdfContentObject[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
};

export function NativeContentObjectList({ objects, selectedId, loading, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ObjectKind>("all");
  const [limit, setLimit] = useState(BATCH_SIZE);
  const counts = useMemo(() => {
    const result: Record<ObjectKind, number> = { all: objects.length, text: 0, image: 0, path: 0, form: 0 };
    objects.forEach(object => {
      if (object.kind in result) result[object.kind as ObjectKind]++;
    });
    return result;
  }, [objects]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return objects.filter(object => {
      if (kind !== "all" && object.kind !== kind) return false;
      return !term || object.id.toLowerCase().includes(term) ||
        object.kind.includes(term) || (object.text ?? "").toLowerCase().includes(term);
    });
  }, [objects, query, kind]);
  const shown = filtered.slice(0, limit);
  const selected = filtered.find(object => object.id === selectedId);
  if (selected && !shown.some(object => object.id === selected.id)) shown.push(selected);
  const hiddenSelection = Boolean(selectedId && !filtered.some(object => object.id === selectedId));

  return (
    <div className="native-content-editor__objects" aria-label="PDF content objects">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs">Page objects</strong>
        <span aria-live="polite" className="text-[11px] text-[var(--text-secondary)]">
          {filtered.length} of {objects.length}
        </span>
      </div>
      <input
        type="search"
        aria-label="Find PDF object"
        placeholder="Find text, type or object ID"
        value={query}
        onChange={event => { setQuery(event.target.value); setLimit(BATCH_SIZE); }}
      />
      <div role="group" aria-label="Filter PDF object types" className="flex flex-wrap gap-1">
        {FILTERS.map(filter => (
          <button type="button" key={filter.kind} aria-pressed={kind === filter.kind}
            data-tpdf-object-filter={filter.kind}
            onClick={() => { setKind(filter.kind); setLimit(BATCH_SIZE); }}
            className={`rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] ${kind === filter.kind ? "bg-[var(--ui-accent-bg)] font-semibold text-[var(--text-primary)]" : "bg-[var(--ui-muted-bg)] text-[var(--text-secondary)]"}`}>
            {filter.label} <span aria-hidden="true">{counts[filter.kind]}</span>
          </button>
        ))}
      </div>
      {hiddenSelection && (
        <div><button type="button" className="text-left text-[11px] text-[var(--acrobat-blue)] underline"
          onClick={() => { setQuery(""); setKind("all"); setLimit(BATCH_SIZE); }}>
          Selected object is hidden by this filter. Show all.
        </button></div>
      )}
      {shown.map(object => (
        <button
          type="button"
          key={object.id}
          className={object.id === selectedId ? "active" : ""}
          aria-pressed={object.id === selectedId}
          onClick={() => onSelect(object.id)}
          data-tpdf-object-id={object.id}
          data-tpdf-object-kind={object.kind}
          data-tpdf-object-depth={object.depth ?? 0}
          data-tpdf-rotated-bounds={object.rotatedBounds ? "true" : "false"}
          data-tpdf-bounds={`${object.bounds.x},${object.bounds.y},${object.bounds.width},${object.bounds.height}`}
          data-tpdf-fill-color={object.fillColor ?? ""}
          data-tpdf-stroke-color={object.strokeColor ?? ""}
          style={{ paddingLeft: 8 + (object.depth ?? 0) * 14 }}
        >
          <span>{object.depth ? "↳ " : ""}{object.kind.toUpperCase()}</span>
          <small>{object.kind === "text" ? (object.text || "(empty text)").slice(0, 48) : object.id}</small>
        </button>
      ))}
      {!loading && filtered.length === 0 ? <p className="text-xs text-[var(--text-secondary)]">No matching PDF objects found.</p> : null}
      {filtered.length > BATCH_SIZE ? (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <small>Showing {Math.min(limit, filtered.length)} of {filtered.length}</small>
          {limit < filtered.length ? (
            <button type="button" className="rounded border border-[var(--border-color)] px-2 py-1"
              onClick={() => setLimit(count => count + BATCH_SIZE)}>
              Show next {BATCH_SIZE}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
