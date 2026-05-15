export function ThumbnailPanel({
  thumbnails,
  page,
  hasDocument,
  onSelectPage,
}: {
  thumbnails: Array<{ page: number; url: string }>;
  page: number;
  hasDocument: boolean;
  onSelectPage: (page: number) => void;
}) {
  return (
    <aside className="left-panel">
      <div className="flex border-b border-[var(--border-color)] bg-[var(--ui-divider)]">
        <button className="inline-flex flex-col items-center gap-[3px] border-b-2 border-[var(--acrobat-blue)] bg-[var(--bg-panel)] px-3.5 py-[var(--ui-pad-sm)] text-[11px] font-semibold text-[var(--acrobat-blue)]" title="Page Thumbnails" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="9" rx="1" />
            <rect x="3" y="15" width="7" height="6" rx="1" />
            <rect x="14" y="15" width="7" height="6" rx="1" />
          </svg>
          Pages
        </button>
        <button className="inline-flex flex-col items-center gap-[3px] border-b-2 border-transparent bg-transparent px-3.5 py-[var(--ui-pad-sm)] text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--ui-subtle-hover)] hover:text-[var(--text-primary)]" title="Bookmarks" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          Bookmarks
        </button>
      </div>
      <div className="grid gap-[var(--ui-gap-lg)]">
        {thumbnails.map((t) => (
          <button key={t.page} className={`flex cursor-pointer flex-col items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] border-2 p-1 ${page === t.page ? "border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)]" : "border-transparent bg-transparent hover:bg-[var(--ui-hover-bg)]"}`} onClick={() => onSelectPage(t.page)} type="button">
            <img src={t.url} className="h-auto max-h-[140px] w-full border border-[#ccc] bg-white object-contain shadow-sm" alt={`Page ${t.page}`} />
            <span className="text-xs text-[var(--text-secondary)]">{t.page}</span>
          </button>
        ))}
        {!hasDocument ? <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">Open a PDF to view pages.</p> : null}
        {hasDocument && thumbnails.length === 0 ? <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">Rendering pages...</p> : null}
      </div>
    </aside>
  );
}
