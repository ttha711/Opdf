import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PdfBookmarkInput } from "../../lib/pdfAdvanced";

type Props = {
  bookmarks: PdfBookmarkInput[];
  setBookmarks: Dispatch<SetStateAction<PdfBookmarkInput[]>>;
  totalPages: number;
  currentPage: number;
  locked: boolean;
};

export function BookmarkEditorPanel({ bookmarks, setBookmarks, totalPages, currentPage, locked }: Props) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return bookmarks.map((item, index) => ({...item, index})).filter(item =>
      !term || item.title.toLocaleLowerCase().includes(term) || String(item.page) === term);
  }, [bookmarks, query]);

  const remove = (index: number) => setBookmarks(current => current.filter((_, i) => i !== index).map(item => ({
    ...item,
    parent: item.parent === index ? undefined :
      typeof item.parent === "number" && item.parent > index ? item.parent - 1 : item.parent,
  })));

  return (
    <section aria-label="PDF bookmark editor" className="space-y-3">
      <div className="rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] p-3 text-xs text-[var(--text-secondary)]">
        Search and edit the document outline. Parent entries must appear before their children.
        Applying regenerates the outline; validate links, signatures and bookmarks after saving.
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          Search bookmarks
          <input type="search" aria-label="Search bookmarks" placeholder="Title or page number"
            value={query} onChange={event => setQuery(event.target.value)}
            className="min-w-0 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2" />
        </label>
        <span className="shrink-0 text-xs text-[var(--text-secondary)]">{matches.length} / {bookmarks.length}</span>
      </div>
      <div className="max-h-[42vh] space-y-2 overflow-y-auto" data-opdf-bookmark-results="true">
        {matches.map(({index, ...bookmark}) => (
          <div key={index} data-opdf-bookmark-index={index}
            className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 rounded border border-[var(--border-color)] p-2 sm:grid-cols-[minmax(0,1fr)_80px_170px_68px]">
            <input value={bookmark.title} aria-label={`Bookmark title ${index + 1}`}
              disabled={locked} onChange={event => setBookmarks(current =>
                current.map((item,i) => i===index ? {...item,title:event.target.value} : item))}
              placeholder="Bookmark title"
              className="min-w-0 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm" />
            <input type="number" min={1} max={Math.max(1,totalPages)}
              aria-label={`Bookmark page ${index + 1}`} value={bookmark.page} disabled={locked}
              onChange={event => setBookmarks(current => current.map((item,i) =>
                i===index ? {...item,page:Number(event.target.value)||1} : item))}
              className="min-w-0 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm" />
            <select value={bookmark.parent ?? ""} disabled={locked} aria-label={`Parent bookmark ${index + 1}`}
              onChange={event => setBookmarks(current => current.map((item,i) =>
                i===index ? {...item,parent:event.target.value===""?undefined:Number(event.target.value)} : item))}
              className="min-w-0 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-xs">
              <option value="">Top level</option>
              {bookmarks.slice(0,index).map((candidate,parentIndex) =>
                <option key={parentIndex} value={parentIndex}>{candidate.title || `Bookmark ${parentIndex+1}`}</option>)}
            </select>
            <button type="button" onClick={() => remove(index)} disabled={locked}
              className="rounded border border-red-200 px-2 py-2 text-xs text-red-600">Remove</button>
          </div>
        ))}
        {matches.length===0 && <p className="p-3 text-xs text-[var(--text-secondary)]">No matching bookmarks.</p>}
      </div>
      <button type="button" disabled={locked}
        onClick={() => {setBookmarks(current=>[...current,{title:`Page ${currentPage}`,page:currentPage}]);setQuery("");}}
        className="rounded border border-[var(--border-color)] px-3 py-2 text-xs font-semibold">
        + Add bookmark
      </button>
    </section>
  );
}
