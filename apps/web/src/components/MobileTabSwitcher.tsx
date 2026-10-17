import { useEffect, useMemo, useRef, useState } from "react";
import type { TpdfTab } from "../lib/web-storage";
import { renderViewerPageImage } from "../lib/viewer-runtime";
import { TpdfIcon } from "./TpdfIcon";

interface MobileTabSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: TpdfTab[];
  activeTabId: string | null;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  openFile: () => void;
}

function MobileTabCard({
  tab,
  isActive,
  onSelect,
  onCloseTab,
}: {
  tab: TpdfTab;
  isActive: boolean;
  onSelect: () => void;
  onCloseTab: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (isActive) {
      renderViewerPageImage(tab.page)
        .then((blob) => {
          if (!cancelled && blob) {
            url = URL.createObjectURL(blob);
            setThumbUrl(url);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [isActive, tab.page]);

  const cleanName = tab.fileName.split(/[/\\]/).pop() || "Document.pdf";

  return (
    <div
      role="button"
      tabIndex={0}
      data-tpdf-tab-card={tab.id}
      className={`mobile-tab-card ${isActive ? "is-active" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Switch to tab ${cleanName}`}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="mobile-tab-card-header">
        <TpdfIcon name="file-pdf" size={15} className="text-red-500 shrink-0" />
        <span className="mobile-tab-card-title" title={cleanName}>
          {cleanName}
        </span>
        <button
          type="button"
          data-tpdf-action="close-tab-card"
          className="mobile-tab-card-close"
          aria-label={`Close tab ${cleanName}`}
          onClick={(e) => {
            e.stopPropagation();
            onCloseTab();
          }}
        >
          ✕
        </button>
      </div>

      <div className="mobile-tab-card-body">
        <div className="mobile-tab-card-sheet">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <>
              <TpdfIcon name="file-pdf" size={28} className="text-red-500 opacity-80" />
              <span className="mt-2 text-[11px] font-semibold text-slate-600">
                Page {tab.page || 1} / {tab.totalPages || 1}
              </span>
              <div className="mobile-tab-card-lines">
                <div className="mobile-tab-card-line w-full" />
                <div className="mobile-tab-card-line w-4/5" />
                <div className="mobile-tab-card-line w-3/5" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileTabSwitcher({
  isOpen,
  onClose,
  tabs,
  activeTabId,
  switchTab,
  closeTab,
  openFile,
}: MobileTabSwitcherProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredTabs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((t) => t.fileName.toLowerCase().includes(q));
  }, [tabs, search]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tabs overview"
      data-tpdf-tab-switcher="open"
      className="mobile-tab-switcher"
    >
      <header className="mobile-tab-switcher-header">
        <div className="mobile-tab-pill-group">
          <span>{tabs.length}</span>
          <span className="text-[11px] opacity-75">TABS</span>
        </div>

        <button
          type="button"
          data-tpdf-action="close-tab-switcher"
          className="mobile-tab-close-btn"
          onClick={onClose}
          aria-label="Close tab overview"
        >
          ✕
        </button>
      </header>

      <div className="mobile-tab-search-row">
        <span className="mobile-tab-search-icon">
          <TpdfIcon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="mobile-tab-search-input"
          placeholder="Search your tabs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search your tabs"
        />
      </div>

      <div className="mobile-tab-summary-row">
        <span>{filteredTabs.length} of {tabs.length} tabs</span>
        {search ? (
          <button
            type="button"
            className="text-xs text-[var(--acrobat-blue)] underline"
            onClick={() => setSearch("")}
          >
            Clear filter
          </button>
        ) : null}
      </div>

      <main className="mobile-tab-grid" data-tpdf-tab-count={filteredTabs.length}>
        {filteredTabs.length === 0 ? (
          <div className="col-span-2 py-16 text-center text-sm text-[var(--text-secondary)]">
            {search ? "No matching tabs found." : "No tabs open. Tap + to open a PDF."}
          </div>
        ) : (
          filteredTabs.map((tab) => (
            <MobileTabCard
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => {
                switchTab(tab.id);
                onClose();
              }}
              onCloseTab={() => {
                closeTab(tab.id);
              }}
            />
          ))
        )}
      </main>

      <button
        type="button"
        data-tpdf-action="mobile-new-tab"
        className="mobile-tab-fab"
        title="Open new PDF"
        aria-label="Open new PDF"
        onClick={() => {
          onClose();
          openFile();
        }}
      >
        +
      </button>
    </div>
  );
}
