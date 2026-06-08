import { useCallback, useEffect, useRef, useState } from "react";

interface Bookmark {
  id: string;
  page: number;
  title: string;
  createdAt: number;
}

function ThumbnailImage({ blob, url: fallbackUrl, page }: { blob?: Blob; url?: string; page: number }) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  const finalUrl = url || fallbackUrl;

  if (!finalUrl) {
    return (
      <div className="h-[140px] w-full flex items-center justify-center border border-[#ccc] bg-white text-xs text-[var(--text-secondary)]">
        Loading...
      </div>
    );
  }

  return (
    <img
      src={finalUrl}
      className="h-auto max-h-[140px] w-full border border-[#ccc] bg-white object-contain shadow-sm"
      alt={`Page ${page}`}
    />
  );
}

export function ThumbnailPanel({
  thumbnails,
  page,
  hasDocument,
  onSelectPage,
  bookmarks = [],
  setBookmarks,
  isCollapsed = false,
  setIsCollapsed,
}: {
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  page: number;
  hasDocument: boolean;
  onSelectPage: (page: number) => void;
  bookmarks?: Array<Bookmark>;
  setBookmarks?: (bookmarks: Array<Bookmark>) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"pages" | "bookmarks">("pages");
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const setThumbnailRef = useCallback((pageNumber: number, element: HTMLButtonElement | null) => {
    if (element) {
      thumbnailRefs.current.set(pageNumber, element);
    } else {
      thumbnailRefs.current.delete(pageNumber);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "pages" || !hasDocument || thumbnails.length === 0) return;

    const target = thumbnailRefs.current.get(page);
    if (!target) return;

    const frameId = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, hasDocument, page, thumbnails.length]);

  const addCurrentPageBookmark = () => {
    if (!setBookmarks) return;
    if (bookmarks.some((b) => b.page === page)) {
      alert(`Page ${page} is already bookmarked!`);
      return;
    }
    const newBookmark: Bookmark = {
      id: Math.random().toString(36).substring(2, 9),
      page: page,
      title: `Bookmark - Page ${page}`,
      createdAt: Date.now(),
    };
    const nextBookmarks = [...bookmarks, newBookmark].sort((a, b) => a.page - b.page);
    setBookmarks(nextBookmarks);
  };

  const saveBookmarkTitle = (id: string) => {
    if (!setBookmarks) return;
    const nextBookmarks = bookmarks.map((b) => {
      if (b.id === id) {
        return { ...b, title: editingTitle.trim() || `Bookmark - Page ${b.page}` };
      }
      return b;
    });
    setBookmarks(nextBookmarks);
    setEditingBookmarkId(null);
  };

  const deleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!setBookmarks) return;
    const nextBookmarks = bookmarks.filter((b) => b.id !== id);
    setBookmarks(nextBookmarks);
  };

  const toggleBookmarkForPage = (pageNumber: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!setBookmarks) return;
    const existing = bookmarks.find((b) => b.page === pageNumber);
    if (existing) {
      const nextBookmarks = bookmarks.filter((b) => b.page !== pageNumber);
      setBookmarks(nextBookmarks);
    } else {
      const newBookmark: Bookmark = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageNumber,
        title: `Bookmark - Page ${pageNumber}`,
        createdAt: Date.now(),
      };
      const nextBookmarks = [...bookmarks, newBookmark].sort((a, b) => a.page - b.page);
      setBookmarks(nextBookmarks);
    }
  };

  return (
    <aside className="left-panel flex flex-col h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)]">
      <div className="flex border-b border-[var(--border-color)] bg-[var(--ui-divider)] shrink-0">
        <button
          className={`flex-1 inline-flex flex-col items-center gap-[3px] border-b-2 py-[var(--ui-pad-sm)] text-[11px] font-semibold transition-colors cursor-pointer ${
            activeTab === "pages"
              ? "border-[var(--acrobat-blue)] bg-[var(--bg-panel)] text-[var(--acrobat-blue)]"
              : "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--ui-subtle-hover)] hover:text-[var(--text-primary)]"
          }`}
          title="Page Thumbnails"
          type="button"
          onClick={() => setActiveTab("pages")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="9" rx="1" />
            <rect x="3" y="15" width="7" height="6" rx="1" />
            <rect x="14" y="15" width="7" height="6" rx="1" />
          </svg>
          Pages
        </button>
        <button
          className={`flex-1 inline-flex flex-col items-center gap-[3px] border-b-2 py-[var(--ui-pad-sm)] text-[11px] font-semibold transition-colors cursor-pointer ${
            activeTab === "bookmarks"
              ? "border-[var(--acrobat-blue)] bg-[var(--bg-panel)] text-[var(--acrobat-blue)]"
              : "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--ui-subtle-hover)] hover:text-[var(--text-primary)]"
          }`}
          title="Bookmarks"
          type="button"
          onClick={() => setActiveTab("bookmarks")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          Bookmarks
        </button>
        {setIsCollapsed && (
          <button
            className="inline-flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--ui-subtle-hover)] hover:text-[var(--text-primary)] cursor-pointer shrink-0 border-l border-[var(--border-color)]"
            onClick={() => setIsCollapsed(true)}
            title="Collapse Left Sidebar"
            type="button"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "pages" ? (
          <div className="grid gap-[var(--ui-gap-lg)] p-3">
            {thumbnails.map((t) => {
              const isBookmarked = bookmarks.some((b) => b.page === t.page);
              return (
                <div key={t.page} className="relative group w-full">
                  <button
                    className={`flex cursor-pointer flex-col items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] border-2 p-1 w-full text-center ${
                      page === t.page
                        ? "border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)]"
                        : "border-transparent bg-transparent hover:bg-[var(--ui-hover-bg)]"
                    }`}
                    onClick={() => onSelectPage(t.page)}
                    ref={(el) => setThumbnailRef(t.page, el)}
                    type="button"
                  >
                    <ThumbnailImage blob={t.blob} url={t.url} page={t.page} />
                    <span className="text-xs text-[var(--text-secondary)]">{t.page}</span>
                  </button>
                  <button
                    className={`absolute top-2 right-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/95 border border-[var(--border-color)] shadow-sm transition-all hover:scale-105 hover:bg-white text-[var(--acrobat-blue)] ${
                      isBookmarked
                        ? "opacity-100 scale-100"
                        : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
                    }`}
                    onClick={(e) => toggleBookmarkForPage(t.page, e)}
                    title={isBookmarked ? "Remove Bookmark" : "Bookmark this Page"}
                    type="button"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill={isBookmarked ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </div>
              );
            })}
            {!hasDocument ? (
              <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] text-center py-4">
                Open a PDF to view pages.
              </p>
            ) : null}
            {hasDocument && thumbnails.length === 0 ? (
              <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] text-center py-4">
                Rendering pages...
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--ui-gap-md)] p-2">
            {hasDocument && (
              <button
                className="flex items-center justify-center gap-1.5 rounded-[var(--ui-radius-sm)] border border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)] py-2 text-[var(--ui-font-sm)] font-semibold text-[var(--acrobat-blue)] transition-colors hover:bg-[var(--ui-subtle-hover)] cursor-pointer shrink-0"
                onClick={addCurrentPageBookmark}
                type="button"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Bookmark Page {page}
              </button>
            )}

            <div className="flex flex-col gap-1.5">
              {bookmarks.map((b) => (
                <div
                  key={b.id}
                  className={`group flex items-center justify-between gap-1.5 rounded-[var(--ui-radius-sm)] border border-transparent p-1.5 text-left transition-colors cursor-pointer min-w-0 ${
                    page === b.page
                      ? "bg-[var(--ui-accent-bg)] border-[var(--acrobat-blue)]/20"
                      : "hover:bg-[var(--ui-hover-bg)]"
                  }`}
                  onClick={() => onSelectPage(b.page)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill={page === b.page ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`shrink-0 ${page === b.page ? "text-[var(--acrobat-blue)]" : "text-[var(--text-secondary)]"}`}
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {editingBookmarkId === b.id ? (
                      <input
                        className="w-full rounded border border-[var(--acrobat-blue)] bg-white px-1.5 py-0.5 text-xs text-black focus:outline-none"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => saveBookmarkTitle(b.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveBookmarkTitle(b.id);
                          if (e.key === "Escape") setEditingBookmarkId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="break-words text-[12px] font-medium text-[var(--text-primary)] leading-snug">
                          {b.title}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] leading-none mt-0.5">Page {b.page}</span>
                      </div>
                    )}
                  </div>

                  {editingBookmarkId !== b.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--ui-subtle-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBookmarkId(b.id);
                          setEditingTitle(b.title);
                        }}
                        title="Rename Bookmark"
                        type="button"
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--ui-subtle-hover)] text-[var(--text-secondary)] hover:text-red-500 cursor-pointer"
                        onClick={(e) => deleteBookmark(b.id, e)}
                        title="Delete Bookmark"
                        type="button"
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {!hasDocument && (
                <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] text-center py-4">
                  Open a PDF to view bookmarks.
                </p>
              )}

              {hasDocument && bookmarks.length === 0 && (
                <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] text-center py-4">
                  No bookmarks yet. Mark pages for quick navigation.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
