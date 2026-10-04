import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "./ToastProvider";
import { useConfirm } from "./ConfirmDialog";
import { getViewerThumbnail } from "../lib/viewer-runtime";

interface Bookmark {
  id: string;
  page: number;
  title: string;
  createdAt: number;
  parent?: number;
}

function ThumbnailImage({ blob, url: fallbackUrl, page }: { blob?: Blob; url?: string; page: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [shouldLoad, setShouldLoad] = useState(Boolean(blob || fallbackUrl));

  useEffect(() => {
    if (blob || fallbackUrl) {
      setShouldLoad(true);
      return;
    }
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [blob, fallbackUrl, page]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    const load = async () => {
      if (!shouldLoad) return;

      let sourceBlob = blob ?? null;
      if (!sourceBlob && !fallbackUrl) {
        // The sidebar can become visible a few frames before the EmbedPDF
        // registry has exposed its thumbnail capability. Retry briefly so the
        // first visible pages do not get stuck on "Loading...".
        for (let attempt = 0; attempt < 40 && !cancelled && !sourceBlob; attempt += 1) {
          sourceBlob = await getViewerThumbnail(page);
          if (!sourceBlob) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
          }
        }
      }

      if (cancelled || !sourceBlob) return;
      objectUrl = URL.createObjectURL(sourceBlob);
      setGeneratedUrl(objectUrl);
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob, fallbackUrl, page, shouldLoad]);

  const finalUrl = generatedUrl || fallbackUrl;

  return (
    <div ref={hostRef} className="min-h-[120px] w-full">
      {finalUrl ? (
        <img
          src={finalUrl}
          className="h-auto max-h-[140px] w-full border border-[#ccc] bg-white object-contain shadow-sm"
          alt={`Page ${page}`}
          loading="lazy"
        />
      ) : (
        <div className="h-[140px] w-full flex items-center justify-center border border-[#ccc] bg-white text-xs text-[var(--text-secondary)]">
          {shouldLoad ? "Loading..." : `Page ${page}`}
        </div>
      )}
    </div>
  );
}

export function ThumbnailPanel({
  thumbnails,
  page,
  totalPages,
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
  onReorderPages,
  onDuplicatePages,
  onExtractPages,
  runDocumentTool,
  onInsertAfterPage,
}: {
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  page: number;
  totalPages: number;
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
  onReorderPages?: (fromPage: number, toPage: number) => Promise<void>;
  onDuplicatePages?: (pages: number[]) => Promise<void>;
  onExtractPages?: (pages: number[]) => Promise<void>;
  runDocumentTool?: (tool: string) => void;
  onInsertAfterPage?: (page: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"pages" | "bookmarks">("pages");
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [isActing, setIsActing] = useState(false);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
  const [touchDragPage, setTouchDragPage] = useState<number | null>(null);
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
    if (!hasDocument || totalPages === 0) {
      onSelectionChange(new Set());
      lastSelectedRef.current = null;
    }
  }, [hasDocument, totalPages, onSelectionChange]);

  // Keyboard shortcuts: Escape = clear selection, Ctrl+A = select all
  useEffect(() => {
    if (!hasDocument || totalPages === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedPages.size > 0) {
        onSelectionChange(new Set());
        lastSelectedRef.current = null;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && activeTab === "pages") {
        e.preventDefault();
        onSelectionChange(new Set(Array.from({ length: totalPages }, (_, index) => index + 1)));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPages.size, onSelectionChange, hasDocument, totalPages, activeTab]);

  useEffect(() => {
    if (activeTab !== "pages" || !hasDocument || totalPages === 0) return;

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
  }, [activeTab, hasDocument, page, totalPages]);

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

  async function reorderPage(fromPage: number, toPage: number) {
    if (!onReorderPages || fromPage === toPage || isActing) return;
    setIsActing(true);
    try {
      await onReorderPages(fromPage, toPage);
      toast.success(`Moved page ${fromPage} to position ${toPage}.`);
    } catch {
      toast.error("Could not reorder pages. Please try again.");
    } finally {
      setIsActing(false);
      setDragPage(null);
      setDragOverPage(null);
      setTouchDragPage(null);
    }
  }

  function pageUnderPointer(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const host = element?.closest?.("[data-opdf-page-number]") as HTMLElement | null;
    const value = Number(host?.dataset.opdfPageNumber);
    return Number.isInteger(value) && value >= 1 ? value : null;
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

  async function handleDuplicate() {
    if (selectedPages.size === 0 || !onDuplicatePages || isActing) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    setIsActing(true);
    try {
      await onDuplicatePages(pages);
      toast.success(`Duplicated ${pages.length} page(s).`);
    } catch {
      toast.error("Could not duplicate pages. Please try again.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleExtract() {
    if (selectedPages.size === 0 || !onExtractPages || isActing) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    setIsActing(true);
    try {
      await onExtractPages(pages);
      toast.success(`Extracted ${pages.length} page(s) to a new PDF.`);
    } catch {
      toast.error("Could not extract pages. Please try again.");
    } finally {
      setIsActing(false);
    }
  }

  const addCurrentPageBookmark = () => {
    if (!setBookmarks) return;
    if (bookmarks.some((b) => b.page === page)) {
      toast.info(`Page ${page} was already selected.`);
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
    const removedIndex = bookmarks.findIndex((bookmark) => bookmark.id === id);
    if (removedIndex < 0) return;
    const nextBookmarks = bookmarks
      .filter((bookmark) => bookmark.id !== id)
      .map((bookmark) => ({
        ...bookmark,
        parent: bookmark.parent === removedIndex
          ? undefined
          : typeof bookmark.parent === "number" && bookmark.parent > removedIndex
            ? bookmark.parent - 1
            : bookmark.parent,
      }));
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
      const nextBookmarks = [...bookmarks, newBookmark];
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
            {selectedPages.size === totalPages ? "All" : selectedPages.size} pages
          </span>

          {/* Rotate selected pages */}
          {onRotatePages && (
            <>
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Rotate left 90°"
                type="button"
                disabled={isActing}
                onClick={() => handleRotate(-90)}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Rotate ↺
              </button>
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Rotate right 90°"
                type="button"
                disabled={isActing}
                onClick={() => handleRotate(90)}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                Rotate ↻
              </button>
            </>
          )}

          {/* Rotate all — only when all pages are selected */}
          {onRotatePages && selectedPages.size === totalPages && runDocumentTool && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Rotate all pages left"
                type="button"
                disabled={isActing}
                onClick={() => runDocumentTool("rotate-all-left")}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <rect x="10" y="10" width="6" height="8" rx="1" />
                </svg>
                All ↺
              </button>
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Rotate all pages right"
                type="button"
                disabled={isActing}
                onClick={() => runDocumentTool("rotate-all-right")}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <rect x="10" y="10" width="6" height="8" rx="1" />
                </svg>
                All ↻
              </button>
            </>
          )}

          {/* Insert PDF — only when exactly one page is selected */}
          {selectedPages.size === 1 && onInsertAfterPage && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 cursor-pointer"
                title={`Insert PDF after page ${Array.from(selectedPages)[0]}`}
                type="button"
                onClick={() => onInsertAfterPage(Array.from(selectedPages)[0])}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                Insert PDF
              </button>
            </>
          )}

          {onDuplicatePages && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Duplicate selected pages"
                type="button"
                disabled={isActing}
                onClick={() => void handleDuplicate()}
              >
                Duplicate
              </button>
            </>
          )}

          {onExtractPages && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/70 disabled:opacity-50 cursor-pointer"
                title="Extract selected pages"
                type="button"
                disabled={isActing}
                onClick={() => void handleExtract()}
              >
                Extract
              </button>
            </>
          )}

          {onDeletePages && (
            <>
              <div className="mx-0.5 h-3.5 w-px bg-violet-200" />
              <button
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                title="Delete selected pages"
                type="button"
                disabled={isActing}
                onClick={handleDelete}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </button>
            </>
          )}

          <button
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-violet-400 hover:bg-white/70 hover:text-violet-700 cursor-pointer"
            title="Clear selection (Escape)"
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
      {activeTab === "pages" && selectedPages.size === 0 && hasDocument && totalPages > 0 && (
        <div className="px-2 py-1 border-b border-[var(--border-color)] shrink-0">
          <p className="text-[10px] text-[var(--text-secondary)] text-center">
            Select pages for batch actions · drag the handle to reorder
          </p>
        </div>
      )}


      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "pages" ? (
          <div className="grid gap-[var(--ui-gap-lg)] p-3">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
              const t = thumbnails.find((thumb) => thumb.page === pageNumber);
              const isCurrentPage = page === pageNumber;
              const isSelected = selectedPages.has(pageNumber);
              const isBookmarked = bookmarks.some((b) => b.page === pageNumber);
              return (
                <div
                  key={pageNumber}
                  data-opdf-page-number={pageNumber}
                  className={`relative group w-full rounded-md ${dragOverPage === pageNumber && dragPage !== pageNumber ? "ring-2 ring-[var(--acrobat-blue)] ring-offset-2" : ""}`}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "220px" }}
                  onDragOver={(event) => {
                    if (!onReorderPages || dragPage === null) return;
                    event.preventDefault();
                    setDragOverPage(pageNumber);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragPage !== null) void reorderPage(dragPage, pageNumber);
                  }}
                >
                  <button
                    className={`flex cursor-pointer flex-col items-center gap-[var(--ui-gap-sm)] rounded-[var(--ui-radius-sm)] border-2 p-1 w-full text-center transition-colors ${
                      isSelected
                        ? "border-violet-500 bg-violet-50"
                        : isCurrentPage
                          ? "border-[var(--acrobat-blue)] bg-[var(--ui-accent-bg)]"
                          : "border-transparent bg-transparent hover:bg-[var(--ui-hover-bg)]"
                    }`}
                    onClick={(e) => handleThumbnailClick(pageNumber, e)}
                    ref={(el) => setThumbnailRef(pageNumber, el)}
                    type="button"
                    aria-label={selectedPages.size > 0 ? `Select page ${pageNumber}` : `Go to page ${pageNumber}`}
                    title={
                      selectedPages.size > 0
                        ? `Page ${pageNumber} — click to ${isSelected ? "deselect" : "select"}`
                        : `Page ${pageNumber}`
                    }
                  >
                    <ThumbnailImage blob={t?.blob} url={t?.url} page={pageNumber} />
                    <span className={`text-xs ${isSelected ? "text-violet-700 font-semibold" : "text-[var(--text-secondary)]"}`}>
                      {pageNumber}
                    </span>
                  </button>

                  {/* Selection checkbox overlay */}
                  <div
                    className={`thumbnail-select-toggle absolute top-2 left-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border-2 transition-all ${
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
                      if (next.has(pageNumber)) {
                        next.delete(pageNumber);
                      } else {
                        next.add(pageNumber);
                      }
                      onSelectionChange(next);
                      lastSelectedRef.current = pageNumber;
                    }}
                    title={isSelected ? "Deselect page" : "Select page"}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  {/* Bookmark button */}
                  <button
                    className={`thumbnail-bookmark-toggle absolute top-2 right-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/95 border border-[var(--border-color)] shadow-sm transition-all hover:scale-105 hover:bg-white text-[var(--acrobat-blue)] ${
                      isBookmarked
                        ? "opacity-100 scale-100"
                        : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
                    }`}
                    onClick={(e) => toggleBookmarkForPage(pageNumber, e)}
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

                  {onReorderPages && totalPages > 1 ? (
                    <button
                      type="button"
                      draggable={!isActing}
                      className="thumbnail-drag-handle absolute bottom-8 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-color)] bg-white/95 text-[var(--text-secondary)] shadow-sm opacity-0 transition-all hover:text-[var(--acrobat-blue)] group-hover:opacity-100 disabled:opacity-40"
                      aria-label={`Reorder page ${pageNumber}`}
                      title="Drag to reorder page"
                      disabled={isActing}
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        setDragPage(pageNumber);
                        setDragOverPage(pageNumber);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(pageNumber));
                      }}
                      onDragEnd={() => {
                        setDragPage(null);
                        setDragOverPage(null);
                      }}
                      onPointerDown={(event) => {
                        if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
                        event.preventDefault();
                        setTouchDragPage(pageNumber);
                        setDragPage(pageNumber);
                        setDragOverPage(pageNumber);
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        if (touchDragPage !== pageNumber) return;
                        event.preventDefault();
                        const target = pageUnderPointer(event.clientX, event.clientY);
                        if (target) setDragOverPage(target);
                      }}
                      onPointerUp={(event) => {
                        if (touchDragPage !== pageNumber) return;
                        event.preventDefault();
                        const target = pageUnderPointer(event.clientX, event.clientY) ?? dragOverPage;
                        if (target) void reorderPage(pageNumber, target);
                        else {
                          setTouchDragPage(null);
                          setDragPage(null);
                          setDragOverPage(null);
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="9" cy="7" r="1" fill="currentColor" />
                        <circle cx="15" cy="7" r="1" fill="currentColor" />
                        <circle cx="9" cy="12" r="1" fill="currentColor" />
                        <circle cx="15" cy="12" r="1" fill="currentColor" />
                        <circle cx="9" cy="17" r="1" fill="currentColor" />
                        <circle cx="15" cy="17" r="1" fill="currentColor" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!hasDocument ? (
              <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] text-center py-4">
                Open a PDF to view pages.
              </p>
            ) : null}
            {hasDocument && totalPages === 0 ? (
              <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)] text-center py-4">
                Reading page metadata...
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
              {bookmarks.map((b, bookmarkIndex) => (
                <div
                  key={b.id}
                  className={`group flex items-center justify-between gap-1.5 rounded-[var(--ui-radius-sm)] border border-transparent p-1.5 text-left transition-colors cursor-pointer min-w-0 ${
                    page === b.page
                      ? "bg-[var(--ui-accent-bg)] border-[var(--acrobat-blue)]/20"
                      : "hover:bg-[var(--ui-hover-bg)]"
                  }`}
                  onClick={() => onSelectPage(b.page)}
                  style={{
                    marginLeft: (() => {
                      let depth = 0;
                      let parent = b.parent;
                      const seen = new Set<number>();
                      while (typeof parent === "number" && parent >= 0 && parent < bookmarkIndex && !seen.has(parent) && depth < 6) {
                        seen.add(parent);
                        depth += 1;
                        parent = bookmarks[parent]?.parent;
                      }
                      return depth * 12;
                    })(),
                  }}
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
