import { useEffect, useState } from "react";
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
  tab, isActive, onSelect, onCloseTab,
}: {
  tab: TpdfTab;
  isActive: boolean;
  onSelect: () => void;
  onCloseTab: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    let disposed = false;
    let url: string | null = null;
    void renderViewerPageImage(tab.page).then((blob) => {
      if (!blob || disposed) return;
      url = URL.createObjectURL(blob);
      setThumbUrl(url);
    }).catch(() => {});
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [isActive, tab.page]);

  const name = tab.fileName.split(/[/\\]/).pop() || "Document.pdf";
  return (
    <article
      className={`mobile-tab-card${isActive ? " is-active" : ""}`}
      data-tpdf-tab-card={tab.id}
    >
      <button
        type="button"
        className="mobile-tab-card-open"
        onClick={onSelect}
        aria-label={`Open ${name}`}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="mobile-tab-card-sheet" aria-hidden="true">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" />
          ) : (
            <TpdfIcon name="file-pdf" size={26} />
          )}
        </span>
        <span className="mobile-tab-card-copy">
          <strong className="mobile-tab-card-title" title={name}>{name}</strong>
          <span className="mobile-tab-card-meta">
            Page {tab.page || 1} of {tab.totalPages || 1}
          </span>
          {isActive ? <span className="mobile-tab-card-active">Currently open</span> : null}
        </span>
      </button>
      <button
        type="button"
        className="mobile-tab-card-close"
        data-tpdf-action="close-tab-card"
        aria-label={`Close tab ${name}`}
        onClick={onCloseTab}
      >
        <TpdfIcon name="close" size={18} />
      </button>
    </article>
  );
}

export function MobileTabSwitcher({
  isOpen, onClose, tabs, activeTabId, switchTab, closeTab, openFile,
}: MobileTabSwitcherProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="tpdf-mobile-tabs-title"
      data-tpdf-tab-switcher="open"
      className="mobile-tab-switcher"
    >
      <header className="mobile-tab-switcher-header">
        <div className="mobile-tab-switcher-heading">
          <h2 id="tpdf-mobile-tabs-title">Open documents</h2>
          <span className="mobile-tab-pill-group">{tabs.length}</span>
        </div>
        <button
          type="button"
          data-tpdf-action="close-tab-switcher"
          className="mobile-tab-close-btn"
          onClick={onClose}
          aria-label="Close tab overview"
        >
          <TpdfIcon name="close" size={22} />
        </button>
      </header>
      <main className="mobile-tab-grid" data-tpdf-tab-count={tabs.length}>
        {tabs.length ? tabs.map((tab) => (
          <MobileTabCard
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => {
              switchTab(tab.id);
              onClose();
            }}
            onCloseTab={() => closeTab(tab.id)}
          />
        )) : (
          <div className="mobile-tab-empty">
            <TpdfIcon name="file-pdf" size={28} />
            <strong>No documents open</strong>
            <span>Open a PDF to get started.</span>
          </div>
        )}
      </main>
      <footer className="mobile-tab-footer">
        <button
          type="button"
          data-tpdf-action="mobile-new-tab"
          className="mobile-tab-fab"
          onClick={() => {
            onClose();
            openFile();
          }}
        >
          <TpdfIcon name="folder-open" size={19} />
          Open PDF
        </button>
      </footer>
    </section>
  );
}
