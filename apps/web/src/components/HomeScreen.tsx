import { useState } from "react";
import { TpdfIcon, type TpdfIconName } from "./TpdfIcon";

export type RecentDocument = {
  id: string;
  fileName: string;
};

export type HomeScreenProps = {
  recentDocuments: RecentDocument[];
  onOpenFile: () => void;
  onOpenTools: () => void;
  onOpenRecent: (id: string) => void;
  onSelectTool?: (toolId: string) => void;
  onOpenAiAssistant?: () => void;
};

interface QuickToolDef {
  id: string;
  title: string;
  desc: string;
  icon: TpdfIconName;
  badge: string;
  badgeColor: string;
}

const QUICK_TOOLS: QuickToolDef[] = [
  {
    id: "merge-pdf",
    title: "Merge PDFs",
    desc: "Combine multiple files into one book",
    icon: "merge",
    badge: "Organize",
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word / Excel",
    desc: "Export to DOCX, XLSX, or PPTX",
    icon: "file-text",
    badge: "Convert",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    id: "digital-sign",
    title: "Digital Signatures",
    desc: "Sign with P12 certificates & seals",
    icon: "lock",
    badge: "Security",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    id: "compress-pdf",
    title: "Compress PDF",
    desc: "Reduce file size with vector fidelity",
    icon: "compress",
    badge: "Optimize",
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
];

export function HomeScreen({
  recentDocuments,
  onOpenFile,
  onOpenTools,
  onOpenRecent,
  onSelectTool,
  onOpenAiAssistant,
}: HomeScreenProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRecent = recentDocuments.filter((doc) =>
    (doc.fileName || "").toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );
  const visibleRecent = filteredRecent.slice(0, 8);

  const handleToolClick = (toolId: string) => {
    if (onSelectTool) onSelectTool(toolId);
    else onOpenTools();
  };

  return (
    <main className="tpdf-home" aria-label="Tpdf home">
      <div className="tpdf-home__ambient-glow" aria-hidden="true" />

      <div className="tpdf-home__container">
        {/* Header Hero Section */}
        <header className="tpdf-home__hero">
          <div className="tpdf-home__hero-meta">
            <span className="tpdf-home__badge">
              <span className="tpdf-home__badge-dot" />
              TPDF WORKSPACE · 2026 EDITION
            </span>
            <div className="tpdf-home__shortcut-hint" title="Use global command palette anytime">
              <kbd>⌘K</kbd> <span>Command Palette</span>
            </div>
          </div>

          <div className="tpdf-home__hero-text">
            <h1>Your documents, ready when you are.</h1>
            <p className="tpdf-home__subtitle">
              Open a PDF to read, review, annotate, compare, convert, or export with high-performance AI tools.
            </p>
          </div>
        </header>

        {/* Bento Grid: Interactive Dropzone + Quick Actions */}
        <section className="tpdf-home__bento-grid" aria-label="Quick start options">
          {/* Main Dropzone Tile */}
          <div
            className={`tpdf-home__dropzone ${isDragOver ? "is-drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              setIsDragOver(false);
              // Event bubbles to App level handler
            }}
            onClick={onOpenFile}
            role="region"
            aria-label="PDF drop zone"
          >
            <div className="tpdf-home__dropzone-halo" aria-hidden="true" />
            <div className="tpdf-home__dropzone-content">
              <div className="tpdf-home__dropzone-icon" aria-hidden="true">
                <TpdfIcon name="file-pdf" size={32} />
              </div>
              <div className="tpdf-home__dropzone-copy">
                <h3>Drop your PDF here, or <span>Browse files</span></h3>
                <p>Supports PDF, DOCX, XLSX, PPTX, and image formats up to 750 MB</p>
              </div>

              <div className="tpdf-home__actions" onClick={(e) => e.stopPropagation()}>
                <button className="tpdf-home__primary" type="button" onClick={onOpenFile}>
                  <TpdfIcon name="folder-open" size={18} />
                  Open PDF
                </button>
                <button className="tpdf-home__secondary" type="button" onClick={onOpenTools}>
                  <TpdfIcon name="tools" size={18} />
                  All tools
                </button>
              </div>
            </div>
          </div>

          {/* Quick Tools Tile Cards */}
          <div className="tpdf-home__quick-tools">
            {QUICK_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="tpdf-home__tool-card"
                onClick={() => handleToolClick(tool.id)}
              >
                <div className="tpdf-home__tool-header">
                  <span className="tpdf-home__tool-icon" aria-hidden="true">
                    <TpdfIcon name={tool.icon} size={20} />
                  </span>
                  <span className={`tpdf-home__tool-tag ${tool.badgeColor}`}>{tool.badge}</span>
                </div>
                <div className="tpdf-home__tool-body">
                  <strong>{tool.title}</strong>
                  <small>{tool.desc}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* AI Copilot Native Bento Tile */}
        {onOpenAiAssistant && (
          <section className="tpdf-home__ai-banner" aria-label="AI document copilot">
            <div className="tpdf-home__ai-info">
              <div className="tpdf-home__ai-badge">
                <span className="tpdf-home__ai-spark" />
                <span>AI DOCUMENT COPILOT</span>
              </div>
              <p className="tpdf-home__ai-heading">Chat, summarize & extract structured data</p>
              <p className="tpdf-home__ai-sub">
                Ask questions across documents, extract complex tables, verify formulas, and analyze contract terms instantly.
              </p>
            </div>
            <button
              className="tpdf-home__ai-btn"
              type="button"
              onClick={onOpenAiAssistant}
            >
              Open AI Assistant
              <TpdfIcon name="chevron-right" size={16} />
            </button>
          </section>
        )}

        {/* Recent Workspaces / Documents Section */}
        <section className="tpdf-home__section" aria-label="Recent documents">
          <div className="tpdf-home__section-heading">
            <div className="tpdf-home__heading-left">
              <h2>Recent documents</h2>
              <span className="tpdf-home__recents-count">{recentDocuments.length} files</span>
            </div>
            {recentDocuments.length > 2 && (
              <div className="tpdf-home__search-box">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter recent documents..."
                  className="tpdf-home__search-input"
                  aria-label="Filter recent documents"
                />
              </div>
            )}
          </div>

          {visibleRecent.length > 0 ? (
            <div className="tpdf-home__recent-grid">
              {visibleRecent.map((document) => {
                const isTab = document.id.startsWith("tab:");
                return (
                  <button
                    className="tpdf-home__recent-card"
                    key={document.id}
                    type="button"
                    onClick={() => onOpenRecent(document.id)}
                  >
                    <span className="tpdf-home__file-icon" aria-hidden="true">
                      <TpdfIcon name="file-pdf" size={22} />
                    </span>
                    <span className="tpdf-home__file-copy">
                      <strong title={document.fileName}>{document.fileName || "Untitled PDF"}</strong>
                      <span className="tpdf-home__file-meta">
                        {isTab ? (
                          <span className="tpdf-home__tab-badge">
                            <span className="tpdf-home__tab-dot" />
                            Open tab
                          </span>
                        ) : (
                          <small>Recent file</small>
                        )}
                      </span>
                    </span>
                    <span className="tpdf-home__chevron" aria-hidden="true">
                      <TpdfIcon name="chevron-right" size={18} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button className="tpdf-home__empty" type="button" onClick={onOpenFile}>
              <span className="tpdf-home__empty-icon" aria-hidden="true">
                <TpdfIcon name="plus" size={22} />
              </span>
              <span>
                <strong>{searchQuery ? "No matching documents found" : "Open your first document"}</strong>
                <small>{searchQuery ? "Try clearing your search query" : "Your recent workspaces and files will appear here."}</small>
              </span>
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
