import { useState } from "react";
import { TpdfIcon } from "./TpdfIcon";

export type RecentDocument = { id: string; fileName: string };
export type HomeScreenProps = {
  recentDocuments: RecentDocument[];
  onOpenFile: () => void;
  onOpenTools: () => void;
  onOpenRecent: (id: string) => void;
  onSelectTool?: (toolId: string) => void;
  onOpenAiAssistant?: () => void;
};

const ACTIONS = [
  { id: "merge-pdf", label: "Merge PDFs", icon: "merge" },
  { id: "compress-pdf", label: "Compress PDF", icon: "compress" },
  { id: "pdf-to-word", label: "Convert", icon: "file-text" },
] as const;

export function HomeScreen({
  recentDocuments, onOpenFile, onOpenTools, onOpenRecent,
  onSelectTool, onOpenAiAssistant,
}: HomeScreenProps) {
  const [showAllRecents, setShowAllRecents] = useState(false);
  const visibleRecents = showAllRecents ? recentDocuments.slice(0, 8) : recentDocuments.slice(0, 4);

  return (
    <main className="tpdf-home tpdf-home--focused" aria-label="Tpdf home">
      <div className="tpdf-home__container">
        <header className="tpdf-home__hero">
          <div className="tpdf-home__hero-text">
            <h1>Your documents, ready when you are.</h1>
            <p className="tpdf-home__subtitle">Open a document to read, edit or share.</p>
          </div>
        </header>

        <section className="tpdf-home__open-section" aria-label="Open a document">
          <button className="tpdf-home__open-primary" type="button" onClick={onOpenFile}>
            <TpdfIcon name="folder-open" size={22} />
            <span>Open PDF</span>
            <TpdfIcon name="chevron-right" size={18} />
          </button>
          <p className="tpdf-home__open-hint">Choose a file from your device, or drag a PDF here on desktop.</p>
        </section>

        <section className="tpdf-home__actions-section" aria-label="More PDF actions">
          <h2>Quick actions</h2>
          <div className="tpdf-home__action-list">
            {ACTIONS.map((action) => (
              <button key={action.id} type="button"
                className="tpdf-home__tool-card"
                onClick={() => onSelectTool ? onSelectTool(action.id) : onOpenTools()}>
                <TpdfIcon name={action.icon} size={18} />
                {action.label}
              </button>
            ))}
            <button type="button" onClick={onOpenTools}>
              <TpdfIcon name="tools" size={18} /> All tools
            </button>
            {onOpenAiAssistant ? (
              <button type="button" onClick={onOpenAiAssistant}>
                <TpdfIcon name="file-text" size={18} /> AI Assistant
              </button>
            ) : null}
          </div>
        </section>

        <section className="tpdf-home__section" aria-label="Recent documents">
          <div className="tpdf-home__section-heading">
            <div className="tpdf-home__heading-left">
              <h2>Recent documents</h2>
              <span className="tpdf-home__recents-count">{recentDocuments.length}</span>
            </div>
            {recentDocuments.length > 4 ? (
              <button
                type="button"
                className="tpdf-home__recents-toggle"
                onClick={() => setShowAllRecents(!showAllRecents)}
              >
                {showAllRecents ? "Show fewer" : `Show all (${recentDocuments.length})`}
              </button>
            ) : null}
          </div>
          {recentDocuments.length ? (
            <div className="tpdf-home__recent-list">
              {visibleRecents.map((document) => (
                <button
                  type="button" className="tpdf-home__recent-row"
                  key={document.id} onClick={() => onOpenRecent(document.id)}
                >
                  <span className="tpdf-home__file-icon"><TpdfIcon name="file-pdf" size={20} /></span>
                  <span className="tpdf-home__file-copy">
                    <strong title={document.fileName}>{document.fileName || "Untitled PDF"}</strong>
                    <small>{document.id.startsWith("tab:") ? "Open tab" : "Recent file"}</small>
                  </span>
                  <TpdfIcon name="chevron-right" size={18} />
                </button>
              ))}
            </div>
          ) : (
            <p className="tpdf-home__recent-empty">Documents you open will appear here.</p>
          )}
        </section>
      </div>
    </main>
  );
}
