import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "./ToastProvider";
import { useConfirm } from "./ConfirmDialog";

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
  selectedPages,
  onSelectionChange,
  onRotatePages,
  onDeletePages,
  runDocumentTool,
  onInsertAfterPage,
}: {
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  page: number;
  hasDocument: boolean;
  onSelectPage: (page: number) => void;
  bookmarks?: Array<Bookmark>;
  setBookmarks?: (bookmarks: Array<Bookmark>) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
  selectedPages: Set<number>;
  onSelectionChange: (pages: Set<number>) => void;
  onRotatePages?: (pages: number[], degrees: number) => Promise<void>;
  onDeletePages?: (pages: number[]) => Promise<void>;
  runDocumentTool?: (tool: string) => void;
  onInsertAfterPage?: (page: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"pages" | "bookmarks">("pages");
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [isActing, setIsActing] = useState(false);
  const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const lastSelectedRef = useRef<number | null>(null);
  const confirm = useConfirm();

  const setThumbnailRef = useCallback((pageNumber: number, element: HTMLButtonElement | null) => {
    if (element) {
      thumbnailRefs.current.set(pageNumber, element);
    } else {
      thumbnailRefs.current.delete(pageNumber);
    }
  }, []);

  // Clear selection when document changes (thumbnails reset)
  useEffect(() => {
    if (thumbnails.length === 0) {
      onSelectionChange(new Set());
      lastSelectedRef.current = null;
    }
  }, [thumbnails.length === 0]);

  // Keyboard shortcuts: Escape = clear selection, Ctrl+A = select all
  useEffect(() => {
    if (!hasDocument || thumbnails.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedPages.size > 0) {
        onSelectionChange(new Set());
        lastSelectedRef.current = null;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && activeTab === "pages") {
        e.preventDefault();
        onSelectionChange(new Set(thumbnails.map((t) => t.page)));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPages.size, onSelectionChange, hasDocument, thumbnails, activeTab]);

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

  function handleThumbnailClick(pageNum: number, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedRef.current !== null) {
      // Replace selection with clean range from anchor to current — do NOT add to old set.
      const start = Math.min(lastSelectedRef.current, pageNum);
      const end = Math.max(lastSelectedRef.current, pageNum);
      const next = new Set<number>();
      for (let i = start; i <= end; i++) next.add(i);
      onSelectionChange(next);
      // Anchor (lastSelectedRef) stays fixed so further shift+clicks extend from same point.
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedPages);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      onSelectionChange(next);
      lastSelectedRef.current = pageNum;
    } else if (selectedPages.size > 0) {
      const next = new Set(selectedPages);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      onSelectionChange(next);
      lastSelectedRef.current = pageNum;
    } else {
      lastSelectedRef.current = pageNum;
      onSelectPage(pageNum);
    }
  }

  function clearSelection() {
    onSelectionChange(new Set());
    lastSelectedRef.current = null;
  }

  async function handleRotate(degrees: number) {
    if (selectedPages.size === 0 || !onRotatePages || isActing) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    setIsActing(true);
    try {
      await onRotatePages(pages, degrees);
    } catch {
      toast.error("Could not rotate pages. Please try again.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleDelete() {
    if (selectedPages.size === 0 || !onDeletePages || isActing) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    const ok = await confirm({
      title: "Delete Pages",
      message: `Delete ${pages.length} selected page(s) (${pages.join(", ")})? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setIsActing(true);
    try {
      await onDeletePages(pages);
    } catch {
      toast.error("Could not delete pages. Please try again.");
    } finally {
      setIsActing(false);
    }
  }

  const addCurrentPageBookmark = () => {
    if (!setBookmarks) return;
    if (bookmarks.some((b) => b.page === page)) {
      toast.info(`Trang ${page} đã được đánh dấu trước đó!`);
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

      {/* Selection toolbar */}
      {activeTab === "pages" && selectedPages.size > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-violet-50 border-b border-violet-200 shrink-0 flex-wrap">
          <span className="text-[11px] font-semibold text-violet-700 mr-0.5 shrink-0">
            {selectedPages.size === thumbnails.length ? "Tất cả" : selectedPages.size} trang
          </span>

          {/* Rotate selected pages */}
          {onRotatePages && (
            <>
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Xoay trái 90°"
                type="button"
                disabled={isActing}
                onClick={() => handleRotate(-90)}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Xoay ↺
              </button>
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Xoay phải 90°"
                type="button"
                disabled={isActing}
                onClick={() => handleRotate(90)}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                Xoay ↻
              </button>
            </>
          )}

          {/* Rotate All — chỉ khi đã chọn tất cả trang */}
          {onRotatePages && selectedPages.size === thumbnails.length && runDocumentTool && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Xoay tất cả trang sang trái"
                type="button"
                disabled={isActing}
                onClick={() => runDocumentTool("rotate-all-left")}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <rect x="10" y="10" width="6" height="8" rx="1" />
                </svg>
                Tất cả ↺
              </button>
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Xoay tất cả trang sang phải"
                type="button"
                disabled={isActing}
                onClick={() => runDocumentTool("rotate-all-right")}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <rect x="10" y="10" width="6" height="8" rx="1" />
                </svg>
                Tất cả ↻
              </button>
            </>
          )}

          {/* Insert PDF — chỉ khi chọn đúng 1 trang */}
          {selectedPages.size === 1 && onInsertAfterPage && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 cursor-pointer"
                title={`Chèn PDF sau trang ${Array.from(selectedPages)[0]}`}
                type="button"
                onClick={() => onInsertAfterPage(Array.from(selectedPages)[0])}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                Chèn PDF
              </button>
            </>
          )}

          {onDeletePages && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                title="Xóa trang đã chọn"
                type="button"
                disabled={isActing}
                onClick={handleDelete}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Xóa
              </button>
            </>
          )}

          <button
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-violet-400 hover:bg-white/70 hover:text-violet-700 cursor-pointer"
            title="Bỏ chọn (Escape)"
            type="button"
            onClick={clearSelection}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Selection hint */}
      {activeTab === "pages" && selectedPages.size === 0 && hasDocument && thumbnails.length > 0 && (
        <div className="px-2 py-1 border-b border-[var(--border-color)] shrink-0">
          <p className="text-[10px] text-[var(--text-secondary)] text-center">
            Ctrl+click or Shift+click to select pages
          </p>
        </div>
      )}


      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "pages" ? (
          <div className="grid gap-[var(--ui-gap-lg)] p-3">
            {thumbnails.map((t) => {
              const isCurrentPage = page === t.page;
              const isSelected = selectedPages.has(t.page);
              const isBookmarked = bookmarks.some((b) => b.page === t.page);
              return (
                <div key={t.page} className="relative group w-full">
                  <button
                    className={`flex cursor-pointer flex-col items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] border-2 p-1 w-full text-center transition-colors ${
                      isSelected
                        ? "border-violet-500 bg-violet-50"
                        : isCurrentPage
                          ? "border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)]"
                          : "border-transparent bg-transparent hover:bg-[var(--ui-hover-bg)]"
                    }`}
                    onClick={(e) => handleThumbnailClick(t.page, e)}
                    ref={(el) => setThumbnailRef(t.page, el)}
                    type="button"
                    title={
                      selectedPages.size > 0
                        ? `Trang ${t.page} — click để ${isSelected ? "bỏ chọn" : "thêm vào chọn"}`
                        : `Trang ${t.page}`
                    }
                  >
                    <ThumbnailImage blob={t.blob} url={t.url} page={t.page} />
                    <span className={`text-xs ${isSelected ? "text-violet-700 font-semibold" : "text-[var(--text-secondary)]"}`}>
                      {t.page}
                    </span>
                  </button>

                  {/* Selection checkbox overlay */}
                  <div
                    className={`absolute top-2 left-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border-2 transition-all ${
                      isSelected
                        ? "border-violet-500 bg-violet-500 text-white opacity-100 scale-100"
                        : selectedPages.size > 0
                          ? "border-[var(--border-color)] bg-white/95 opacity-100 scale-100 hover:scale-105 hover:border-violet-400"
                          : "border-[var(--border-color)] bg-white/95 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 hover:scale-105 hover:border-violet-400"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const next = new Set(selectedPages);
                      if (next.has(t.page)) {
                        next.delete(t.page);
                      } else {
                        next.add(t.page);
                      }
                      onSelectionChange(next);
                      lastSelectedRef.current = t.page;
                    }}
                    title={isSelected ? "Bỏ chọn trang" : "Chọn trang"}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  {/* Bookmark button */}
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
