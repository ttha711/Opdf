import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { applyPagePlan, moveSelectedPages, type PageOperationBridge, type PagePlan } from "../../lib/pageOrganizer";
import { PageOrganizerThumbnail } from "./PageOrganizerThumbnail";

type Props = {
  totalPages: number;
  fileName: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  bridge: PageOperationBridge;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  onClose: () => void;
};
const range = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

export function PageOrganizer({ totalPages, fileName, getDocumentBytes, bridge, replaceDocumentBytes, onClose }: Props) {
  const [pageCount, setPageCount] = useState(totalPages);
  const [order, setOrder] = useState(() => range(totalPages));
  const [selected, setSelected] = useState<number[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const pageCountRef = useRef(totalPages);
  const [loadingCount, setLoadingCount] = useState(totalPages < 1);
  const anchor = useRef<number | null>(null);
  const drag = useRef<number | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const plan: PagePlan = useMemo(() => ({ order, removed, rotations }), [order, removed, rotations]);
  const dirty = order.some((page, index) => page !== index + 1) || removed.length > 0 ||
    Object.values(rotations).some(deg => deg % 360 !== 0);
  const live = order.filter(page => !removed.includes(page));
  const active = selected.filter(page => !removed.includes(page));
  const safe = dirty && acknowledged && !working && live.length > 0 && !loadingCount;
  useEffect(() => {
    let cancelled = false;
    const recoverPageCount = async () => {
      if (totalPages > 0) {
        setPageCount(totalPages);
        setLoadingCount(false);
        return;
      }
      setLoadingCount(true);
      try {
        const bytes = await getDocumentBytes();
        if (!bytes) throw new Error("PDF has not finished loading.");
        if (bytes.byteLength > 64 * 1024 * 1024) throw new Error("Large PDF is still loading in the viewer. Try again when pages appear.");
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(bytes);
        if (!cancelled) setPageCount(doc.getPageCount());
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to read PDF page count.");
      } finally { if (!cancelled) setLoadingCount(false); }
    };
    void recoverPageCount();
    return () => { cancelled = true; };
  }, [totalPages, getDocumentBytes]);

  useEffect(() => {
    if (pageCountRef.current === pageCount) return;
    pageCountRef.current = pageCount;
    setOrder(range(pageCount)); setSelected([]); setRemoved([]); setRotations({}); setAcknowledged(false);
  }, [pageCount]);

  useEffect(() => {
    modal.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const close = useCallback(() => { if (!working) onClose(); }, [onClose, working]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);

  const select = (page: number, event: MouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey && anchor.current !== null) {
      const start = order.indexOf(anchor.current), end = order.indexOf(page);
      const members = order.slice(Math.min(start, end), Math.max(start, end) + 1);
      setSelected(current => [...new Set([...current, ...members])]);
    } else if (event.ctrlKey || event.metaKey) {
      setSelected(current => current.includes(page) ? current.filter(item => item !== page) : [...current, page]);
      anchor.current = page;
    } else {
      setSelected([page]);
      anchor.current = page;
    }
  };
  const rotate = (delta: number) => {
    setRotations(current => {
      const next = { ...current };
      active.forEach(page => { next[page] = ((next[page] || 0) + delta) % 360; });
      return next;
    });
  };
  const move = (direction: -1 | 1) => {
    if (!active.length) return;
    const sorted = order.filter(page => active.includes(page));
    const first = order.indexOf(sorted[0]), last = order.indexOf(sorted[sorted.length - 1]);
    const before = direction === -1 ? order[first - 1] : order[last + 2] ?? null;
    if ((direction === -1 && first === 0) || (direction === 1 && last === order.length - 1)) return;
    setOrder(current => moveSelectedPages(current, sorted, before));
  };
  const apply = async () => {
    if (!safe) return;
    setWorking(true);
    setError("");
    try {
      const bytes = await getDocumentBytes();
      if (!bytes) throw new Error("Cannot read current PDF.");
      const output = await applyPagePlan(bytes, bridge, plan);
      replaceDocumentBytes(output.bytes, Math.min(1, output.pageCount) || 1);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not organize pages.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div data-tpdf-dialog="organize-pages" className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 p-2 md:p-6">
      <div ref={modal} role="dialog" aria-modal="true" aria-label="Organize pages" tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] p-4">
          <div>
            <h2 className="text-lg font-bold">Organize pages</h2>
            <p className="max-w-lg truncate text-xs text-[var(--text-secondary)]" title={fileName}>
              {fileName || "PDF"} · {live.length} of {pageCount} pages retained
            </p>
          </div>
          <button type="button" aria-label="Close organizer" onClick={close} disabled={working} className="rounded border border-[var(--border-color)] px-3 py-2">Close</button>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] p-3 text-xs">
          <button type="button" onClick={() => setSelected(live)} disabled={working || loadingCount}>Select all</button>
          <button type="button" onClick={() => setSelected([])} disabled={working}>Clear selection</button>
          <span className="mr-2 text-[var(--text-secondary)]">{active.length} selected</span>
          <button type="button" data-tpdf-action="organizer-move-left" onClick={() => move(-1)} disabled={!active.length || working}>← Earlier</button>
          <button type="button" data-tpdf-action="organizer-move-right" onClick={() => move(1)} disabled={!active.length || working}>Later →</button>
          <button type="button" data-tpdf-action="organizer-rotate-left" onClick={() => rotate(-90)} disabled={!active.length || working}>↶ Rotate left</button>
          <button type="button" data-tpdf-action="organizer-rotate-right" onClick={() => rotate(90)} disabled={!active.length || working}>↷ Rotate right</button>
          <button type="button" data-tpdf-action="organizer-delete" onClick={() => setRemoved(current => [...new Set([...current, ...active])])} disabled={!active.length || working || live.length <= active.length}>Remove</button>
          <button type="button" onClick={() => { setOrder(range(pageCount)); setRemoved([]); setRotations({}); setSelected([]); setAcknowledged(false); }} disabled={working}>Reset</button>
        </div>
        <p className="px-4 pt-3 text-xs text-[var(--text-secondary)]">
          Drag thumbnails to reorder, or use Earlier/Later. Click, Ctrl/⌘-click, or Shift-click to select.
          Removed pages remain crossed out until you Apply. No changes are made before Apply.
        </p>
        {loadingCount ? <p role="status" className="p-3 text-xs">Reading PDF page count…</p> : null}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto p-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {order.map((page, index) => {
            const gone = removed.includes(page), isSelected = selected.includes(page);
            return (
              <div key={page} draggable={!working} onDragStart={() => { drag.current = page; }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  const from = drag.current;
                  if (from === null || from === page) return;
                  const moving = selected.includes(from) ? selected : [from];
                  setOrder(current => moveSelectedPages(current, moving, page));
                  drag.current = null;
                }}
                className={`min-w-0 rounded-lg border p-2 ${isSelected ? "border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)]" : "border-[var(--border-color)]"} ${gone ? "opacity-45" : ""}`}>
                <button type="button" aria-pressed={isSelected} data-tpdf-organizer-page={page}
                  onClick={event => select(page, event)} disabled={working}
                  className="w-full text-left">
                  <PageOrganizerThumbnail page={page} deleted={gone} rotation={rotations[page] || 0} />
                  <span className="mt-2 block truncate text-xs font-semibold">Page {page}{gone ? " · Removed" : ""}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">Position {index + 1}</span>
                </button>
              </div>
            );
          })}
        </div>
        <footer className="space-y-2 border-t border-[var(--border-color)] p-4">
          <label className="flex gap-2 text-xs leading-5">
            <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
            <span>I understand that structural edits may invalidate signatures and affect bookmarks, links, forms or attachments. Review the saved PDF.</span>
          </label>
          {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={close} disabled={working} className="rounded border border-[var(--border-color)] px-4 py-2">Cancel</button>
            <button type="button" data-tpdf-action="organizer-apply" onClick={() => void apply()} disabled={!safe}
              className="rounded bg-[var(--acrobat-blue)] px-4 py-2 font-semibold text-white disabled:opacity-50">
              {working ? "Applying…" : "Apply page changes"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
