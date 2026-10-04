import { useMemo, useState } from "react";
import {
import { useDialogClose } from "../hooks/useDialogClose";
  applySecureRasterRedactions,
  findTextRedactionMatches,
  type PdfSource,
  type TextRedactionMatch,
} from "../lib/secureRedaction";

export function SearchRedactModal({
  isOpen,
  onClose,
  source,
  fileName,
  onApplied,
}: {
  isOpen: boolean;
  onClose: () => void;
  source: PdfSource;
  fileName: string;
  onApplied: (bytes: Uint8Array) => void;
}) {
  useDialogClose(isOpen, onClose);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TextRedactionMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMatches = useMemo(
    () => matches.filter((match) => selected.has(match.id)),
    [matches, selected],
  );

  const search = async () => {
    if (!query.trim() || !source) return;
    setBusy(true);
    setError(null);
    setMatches([]);
    setSelected(new Set());
    try {
      const found = await findTextRedactionMatches(source, query, (page, total) => {
        setStatus("Searching page " + page + " / " + total + "…");
      });
      setMatches(found);
      setSelected(new Set(found.map((match) => match.id)));
      setStatus(found.length + " match(es) found");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!selectedMatches.length || !source) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await applySecureRasterRedactions(source, selectedMatches, (page, total) => {
        setStatus("Securing page " + page + " / " + total + "…");
      });
      onApplied(bytes);
      setStatus("Secure redaction applied");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Redaction failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/55 p-4" style={{ zIndex: "var(--z-modal-high)" }}>
      <div className="premium-modal flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="premium-modal-header">
          <div className="premium-modal-title">Search & Secure Redact</div>
          <button type="button" className="rounded px-2 py-1 text-sm hover:bg-[var(--ui-hover-bg)]" onClick={onClose}>✕</button>
        </div>

        <div className="premium-modal-body min-h-0 overflow-auto">
          <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Secure mode rasterizes only affected pages after covering the selected text. This removes the underlying selectable text from those pages, but those pages will no longer remain vector/searchable.
          </div>
          <div className="mb-3 text-xs text-[var(--text-secondary)]">{fileName.split(/[/\\]/).pop()}</div>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm text-[var(--text-primary)]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
              placeholder="Text to redact…"
              autoFocus
            />
            <button type="button" disabled={busy || !query.trim()} onClick={() => void search()} className="rounded bg-[var(--acrobat-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Search all pages
            </button>
          </div>

          {status ? <div className="mt-2 text-xs text-[var(--text-secondary)]">{status}</div> : null}
          {error ? <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}

          {matches.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span>{selected.size} / {matches.length} selected</span>
                <div className="flex gap-2">
                  <button type="button" className="underline" onClick={() => setSelected(new Set(matches.map((match) => match.id)))}>Select all</button>
                  <button type="button" className="underline" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
              </div>
              <div className="max-h-[42vh] overflow-auto rounded border border-[var(--border-color)]">
                {matches.map((match) => (
                  <label key={match.id} className="flex cursor-pointer items-start gap-2 border-b border-[var(--ui-divider)] px-3 py-2 text-xs last:border-b-0 hover:bg-[var(--ui-hover-bg)]">
                    <input type="checkbox" checked={selected.has(match.id)} onChange={() => toggle(match.id)} />
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">p.{match.page}</span>
                    <span className="min-w-0 flex-1 break-words text-[var(--text-primary)]">{match.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="premium-modal-footer">
          <button type="button" onClick={onClose} className="rounded border border-[var(--border-color)] px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            disabled={busy || selectedMatches.length === 0}
            onClick={() => void apply()}
            className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Apply {selectedMatches.length || ""} secure redaction{selectedMatches.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
