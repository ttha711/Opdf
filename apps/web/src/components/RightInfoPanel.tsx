import type { Annotation, OcrJob } from "@opdf/core";
import { buildAnnotationListItems } from "../lib/annotationGroups";

export function RightInfoPanel({
  hasDocument,
  fileName,
  totalPages,
  page,
  scale,
  viewerError,
  searchResult,
  annotations,
  ocrJobs,
  onRemoveAnnotation,
  isCollapsed = false,
  setIsCollapsed,
}: {
  hasDocument: boolean;
  fileName: string;
  totalPages: number;
  page: number;
  scale: number;
  viewerError: string | null;
  searchResult: string;
  annotations: Annotation[];
  ocrJobs: OcrJob[];
  onRemoveAnnotation: (id: string) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}) {
  const annotationItems = buildAnnotationListItems(annotations);

  return (
    <aside className="overflow-auto border-l border-[var(--border-color)] bg-[var(--bg-panel)] h-full flex flex-col">
      <div className="border-b border-[var(--border-color)]">
        <div className="flex cursor-default items-center gap-[var(--ui-gap-md)] border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] py-2.5 text-xs font-semibold uppercase tracking-[0.02em] text-[var(--text-primary)]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Document
          {setIsCollapsed && (
            <button
              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--ui-subtle-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              onClick={() => setIsCollapsed(true)}
              title="Collapse Right Sidebar"
              type="button"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
          )}
        </div>
        <div className="px-[14px] py-2.5">
          {hasDocument ? (
            <>
              <div className="flex items-start justify-between gap-[var(--ui-gap-md)] border-b border-[var(--ui-divider)] py-1 text-xs"><span className="shrink-0 whitespace-nowrap text-[var(--text-secondary)]">File</span><span className="break-all text-right font-mono text-xs text-[var(--text-secondary)]">{fileName.split(/[/\\]/).pop()}</span></div>
              <div className="flex items-start justify-between gap-[var(--ui-gap-md)] border-b border-[var(--ui-divider)] py-1 text-xs"><span className="shrink-0 whitespace-nowrap text-[var(--text-secondary)]">Pages</span><span className="break-all text-right text-xs text-[var(--text-primary)]">{totalPages}</span></div>
              <div className="flex items-start justify-between gap-[var(--ui-gap-md)] border-b border-[var(--ui-divider)] py-1 text-xs"><span className="shrink-0 whitespace-nowrap text-[var(--text-secondary)]">Page</span><span className="break-all text-right text-xs text-[var(--text-primary)]">{page} / {totalPages}</span></div>
              <div className="flex items-start justify-between gap-[var(--ui-gap-md)] py-1 text-xs"><span className="shrink-0 whitespace-nowrap text-[var(--text-secondary)]">Zoom</span><span className="break-all text-right text-xs text-[var(--text-primary)]">{Math.round(scale * 100)}%</span></div>
            </>
          ) : (
            <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">No document open</p>
          )}
          {viewerError ? <p className="rounded-[var(--ui-radius-sm)] p-[var(--ui-pad-sm)] text-[var(--ui-font-sm)]" style={{ backgroundColor: 'var(--ui-error-bg)', color: 'var(--ui-error-text)' }}>{viewerError}</p> : null}
          {searchResult ? <p className="mt-2 rounded px-2 py-1.5 text-xs" style={{ backgroundColor: 'var(--ui-success-bg)', color: 'var(--ui-success-text)' }}>{searchResult}</p> : null}
        </div>
      </div>

      <div className="border-b border-[var(--border-color)]">
        <div className="flex cursor-default items-center gap-[var(--ui-gap-md)] border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] py-2.5 text-xs font-semibold uppercase tracking-[0.02em] text-[var(--text-primary)]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 5 4 4-9 9H6v-4z" />
            <path d="m12 8 4 4" />
          </svg>
          Annotations
          <span className="ml-auto rounded-full bg-[var(--acrobat-blue)] px-1.5 py-[1px] text-[10px] font-bold text-white">{annotationItems.length}</span>
        </div>
        {annotationItems.length > 0 ? (
          <ul className="m-0 list-none p-0">
            {annotationItems.map((item) => (
              <li key={`${item.id}-${item.groupId ?? "single"}`} className="flex items-start gap-[var(--ui-gap-sm)] border-b border-[var(--ui-divider)] px-[14px] py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold tracking-[0.03em] ${
                      item.groupId
                        ? "bg-indigo-100 text-indigo-800"
                        : item.kind === "highlight"
                          ? "bg-yellow-100 text-yellow-800"
                          : item.kind === "note"
                            ? "bg-[#fff8d6] text-amber-800"
                            : item.kind === "shape"
                              ? "bg-red-100 text-red-800"
                              : item.kind === "signature"
                                ? "bg-violet-100 text-violet-800"
                                : "bg-gray-800 text-white"
                    }`}>{item.label}</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">p.{item.page}</span>
                  </div>
                  {item.summary ? (
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-primary)]" title={item.summary}>{item.summary}</p>
                  ) : null}
                </div>
                <button onClick={() => onRemoveAnnotation(item.id)} title="Delete annotation" className="ml-auto flex items-center rounded p-0.5 text-[#aaa] transition-colors hover:bg-red-100 hover:text-[var(--ui-danger)]" type="button">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-[14px] py-2.5"><p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">No annotations yet</p></div>
        )}
      </div>

      <div className="border-b border-[var(--border-color)]">
        <div className="flex cursor-default items-center gap-[var(--ui-gap-md)] border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] py-2.5 text-xs font-semibold uppercase tracking-[0.02em] text-[var(--text-primary)]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M7 8h10M7 12h6M7 16h4" />
          </svg>
          OCR Jobs
        </div>
        <div className="px-[14px] py-2.5">
          {ocrJobs.length === 0 ? (
            <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">No OCR jobs</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {ocrJobs.map((j) => <li key={j.id} className="flex items-center justify-between gap-[var(--ui-gap-sm)] border-b border-[var(--ui-divider)] py-1.5 text-xs"><span>{j.status}</span><span>{j.progress}%</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
