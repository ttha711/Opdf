type RecentDocument = {
  id: string;
  fileName: string;
};

type HomeScreenProps = {
  recentDocuments: RecentDocument[];
  onOpenFile: () => void;
  onOpenTools: () => void;
  onOpenRecent: (id: string) => void;
};

export function HomeScreen({
  recentDocuments,
  onOpenFile,
  onOpenTools,
  onOpenRecent,
}: HomeScreenProps) {
  const visibleRecent = recentDocuments.slice(0, 6);

  return (
    <section className="opdf-home" aria-label="Opdf home">
      <div className="opdf-home__hero">
        <div className="opdf-home__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none">
            <path d="M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".14" />
            <path d="M14 2v5h5M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="opdf-home__eyebrow">OPDF</p>
          <h1>Your documents, ready when you are.</h1>
          <p className="opdf-home__subtitle">
            Open a PDF to read, review, annotate, compare, convert, or export.
          </p>
        </div>
      </div>

      <div className="opdf-home__actions">
        <button className="opdf-home__primary" type="button" onClick={onOpenFile}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2Z" />
          </svg>
          Open PDF
        </button>
        <button className="opdf-home__secondary" type="button" onClick={onOpenTools}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          All tools
        </button>
      </div>

      <div className="opdf-home__section">
        <div className="opdf-home__section-heading">
          <div>
            <h2>Recent documents</h2>
            <p>Continue where you left off.</p>
          </div>
        </div>

        {visibleRecent.length > 0 ? (
          <div className="opdf-home__recent-grid">
            {visibleRecent.map((document) => (
              <button
                className="opdf-home__recent-card"
                key={document.id}
                type="button"
                onClick={() => onOpenRecent(document.id)}
              >
                <span className="opdf-home__file-icon" aria-hidden="true">PDF</span>
                <span className="opdf-home__file-copy">
                  <strong title={document.fileName}>{document.fileName || "Untitled PDF"}</strong>
                  <small>Open document</small>
                </span>
                <span className="opdf-home__chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="opdf-home__empty" type="button" onClick={onOpenFile}>
            <span className="opdf-home__empty-icon" aria-hidden="true">＋</span>
            <span>
              <strong>Open your first document</strong>
              <small>Your recent files will appear here.</small>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
