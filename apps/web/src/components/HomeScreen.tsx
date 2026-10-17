import { TpdfIcon } from "./TpdfIcon";

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
    <main className="tpdf-home" aria-label="Tpdf home">
      <div className="tpdf-home__hero">
        <div className="tpdf-home__mark" aria-hidden="true">
          <TpdfIcon name="file-pdf" size={34} />
        </div>
        <div>
          <p className="tpdf-home__eyebrow">TPDF</p>
          <h1>Your documents, ready when you are.</h1>
          <p className="tpdf-home__subtitle">
            Open a PDF to read, review, annotate, compare, convert, or export.
          </p>
        </div>
      </div>

      <div className="tpdf-home__actions">
        <button className="tpdf-home__primary" type="button" onClick={onOpenFile}>
          <TpdfIcon name="folder-open" size={18} />
          Open PDF
        </button>
        <button className="tpdf-home__secondary" type="button" onClick={onOpenTools}>
          <TpdfIcon name="tools" size={18} />
          All tools
        </button>
      </div>

      <div className="tpdf-home__section">
        <div className="tpdf-home__section-heading">
          <div>
            <h2>Recent documents</h2>
            <p>Continue where you left off.</p>
          </div>
        </div>

        {visibleRecent.length > 0 ? (
          <div className="tpdf-home__recent-grid">
            {visibleRecent.map((document) => (
              <button
                className="tpdf-home__recent-card"
                key={document.id}
                type="button"
                onClick={() => onOpenRecent(document.id)}
              >
                <span className="tpdf-home__file-icon" aria-hidden="true"><TpdfIcon name="file-pdf" size={22} /></span>
                <span className="tpdf-home__file-copy">
                  <strong title={document.fileName}>{document.fileName || "Untitled PDF"}</strong>
                  <small>Open document</small>
                </span>
                <span className="tpdf-home__chevron" aria-hidden="true"><TpdfIcon name="chevron-right" size={18} /></span>
              </button>
            ))}
          </div>
        ) : (
          <button className="tpdf-home__empty" type="button" onClick={onOpenFile}>
            <span className="tpdf-home__empty-icon" aria-hidden="true"><TpdfIcon name="plus" size={20} /></span>
            <span>
              <strong>Open your first document</strong>
              <small>Your recent files will appear here.</small>
            </span>
          </button>
        )}
      </div>
    </main>
  );
}
