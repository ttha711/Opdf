import { OpdfIcon } from "./OpdfIcon";

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
          <OpdfIcon name="file-pdf" size={34} />
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
          <OpdfIcon name="folder-open" size={18} />
          Open PDF
        </button>
        <button className="opdf-home__secondary" type="button" onClick={onOpenTools}>
          <OpdfIcon name="tools" size={18} />
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
                <span className="opdf-home__file-icon" aria-hidden="true"><OpdfIcon name="file-pdf" size={22} /></span>
                <span className="opdf-home__file-copy">
                  <strong title={document.fileName}>{document.fileName || "Untitled PDF"}</strong>
                  <small>Open document</small>
                </span>
                <span className="opdf-home__chevron" aria-hidden="true"><OpdfIcon name="chevron-right" size={18} /></span>
              </button>
            ))}
          </div>
        ) : (
          <button className="opdf-home__empty" type="button" onClick={onOpenFile}>
            <span className="opdf-home__empty-icon" aria-hidden="true"><OpdfIcon name="plus" size={20} /></span>
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
