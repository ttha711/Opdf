import { useMemo, useState } from "react";
import type { Annotation, OcrJob } from "@opdf/core";
import { buildAnnotationListItems } from "../lib/annotationGroups";

type ReviewReply = {
  text: string;
  createdAt: number;
};

function readReplies(annotation?: Annotation): ReviewReply[] {
  const raw = annotation?.payload?.["reviewReplies"];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && typeof (item as any).text === "string")
    .map((item) => ({
      text: String((item as any).text),
      createdAt: Number((item as any).createdAt || Date.now()),
    }));
}

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
  onUpdateAnnotation,
  onGoToPage,
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
  onUpdateAnnotation?: (id: string, payload: Record<string, unknown>) => void;
  onGoToPage?: (page: number) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}) {
  const [reviewFilter, setReviewFilter] = useState<"all" | "open" | "resolved">("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const annotationItems = buildAnnotationListItems(annotations);

  const visibleItems = useMemo(() => {
    return annotationItems.filter((item) => {
      const annotation = annotations.find((candidate) => candidate.id === item.id);
      const resolved = Boolean(annotation?.payload?.["reviewResolved"]);
      if (reviewFilter === "open") return !resolved;
      if (reviewFilter === "resolved") return resolved;
      return true;
    });
  }, [annotationItems, annotations, reviewFilter]);

  const resolvedCount = annotationItems.filter((item) => {
    const annotation = annotations.find((candidate) => candidate.id === item.id);
    return Boolean(annotation?.payload?.["reviewResolved"]);
  }).length;

  const submitReply = (annotation: Annotation) => {
    const value = (replyDrafts[annotation.id] || "").trim();
    if (!value || !onUpdateAnnotation) return;
    const replies = readReplies(annotation);
    onUpdateAnnotation(annotation.id, {
      reviewReplies: [...replies, { text: value, createdAt: Date.now() }],
    });
    setReplyDrafts((current) => ({ ...current, [annotation.id]: "" }));
  };

  return (
    <aside className="overflow-auto border-l border-[var(--border-color)] bg-[var(--bg-panel)] h-full flex flex-col">
      <div className="border-b border-[var(--border-color)]">
        <div className="flex cursor-default items-center gap-[var(--ui-gap-md)] border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] py-2.5 text-xs font-semibold uppercase tracking-[0.02em] text-[var(--text-primary)]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Document
          {setIsCollapsed ? (
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
          ) : null}
        </div>
        <div className="px-[14px] py-2.5">
          {hasDocument ? (
            <>
              <div className="flex items-start justify-between gap-2 border-b border-[var(--ui-divider)] py-1 text-xs"><span className="text-[var(--text-secondary)]">File</span><span className="break-all text-right font-mono text-[var(--text-secondary)]">{fileName.split(/[/\\]/).pop()}</span></div>
              <div className="flex items-start justify-between gap-2 border-b border-[var(--ui-divider)] py-1 text-xs"><span className="text-[var(--text-secondary)]">Pages</span><span>{totalPages}</span></div>
              <div className="flex items-start justify-between gap-2 border-b border-[var(--ui-divider)] py-1 text-xs"><span className="text-[var(--text-secondary)]">Page</span><span>{page} / {totalPages}</span></div>
              <div className="flex items-start justify-between gap-2 py-1 text-xs"><span className="text-[var(--text-secondary)]">Zoom</span><span>{Math.round(scale * 100)}%</span></div>
            </>
          ) : <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">No document open</p>}
          {viewerError ? <p className="rounded p-2 text-xs" style={{ backgroundColor: "var(--ui-error-bg)", color: "var(--ui-error-text)" }}>{viewerError}</p> : null}
          {searchResult ? <p className="mt-2 rounded px-2 py-1.5 text-xs" style={{ backgroundColor: "var(--ui-success-bg)", color: "var(--ui-success-text)" }}>{searchResult}</p> : null}
        </div>
      </div>

      <div className="border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] py-2.5 text-xs font-semibold uppercase text-[var(--text-primary)]">
          <span>Review</span>
          <span className="ml-auto rounded-full bg-[var(--acrobat-blue)] px-1.5 py-[1px] text-[10px] font-bold text-white">{annotationItems.length - resolvedCount} open</span>
        </div>
        <div className="flex gap-1 px-[14px] py-2">
          {(["all", "open", "resolved"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setReviewFilter(filter)}
              className={"rounded px-2 py-1 text-[11px] font-semibold " + (reviewFilter === filter ? "bg-[var(--acrobat-blue)] text-white" : "bg-[var(--ui-muted-bg)] text-[var(--text-secondary)]")}
            >
              {filter}
            </button>
          ))}
        </div>

        {visibleItems.length > 0 ? (
          <ul className="m-0 list-none p-0">
            {visibleItems.map((item) => {
              const annotation = annotations.find((candidate) => candidate.id === item.id);
              if (!annotation) return null;
              const resolved = Boolean(annotation.payload?.["reviewResolved"]);
              const replies = readReplies(annotation);
              return (
                <li key={item.id} className={"border-t border-[var(--ui-divider)] px-[14px] py-2 text-xs " + (resolved ? "opacity-65" : "")}>
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => onGoToPage?.(item.page)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-700">{item.label}</span>
                        <span className="text-[11px] text-[var(--text-secondary)]">p.{item.page}</span>
                        {resolved ? <span className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">RESOLVED</span> : null}
                      </div>
                      {item.summary ? <p className="mt-1 truncate text-[11px] text-[var(--text-primary)]">{item.summary}</p> : null}
                    </button>
                    {onUpdateAnnotation ? (
                      <button
                        type="button"
                        onClick={() => onUpdateAnnotation(annotation.id, { reviewResolved: !resolved })}
                        className="rounded border border-[var(--border-color)] px-1.5 py-0.5 text-[10px]"
                      >
                        {resolved ? "Reopen" : "Resolve"}
                      </button>
                    ) : null}
                    <button onClick={() => onRemoveAnnotation(item.id)} title="Delete annotation" className="rounded p-0.5 text-[#aaa] hover:bg-red-100 hover:text-red-600" type="button">✕</button>
                  </div>

                  {replies.length > 0 ? (
                    <div className="mt-2 space-y-1 border-l-2 border-[var(--border-color)] pl-2">
                      {replies.slice(-3).map((reply, index) => (
                        <div key={reply.createdAt + "-" + index} className="text-[11px] text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">Reply:</span> {reply.text}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {onUpdateAnnotation ? (
                    <div className="mt-2 flex gap-1">
                      <input
                        value={replyDrafts[annotation.id] || ""}
                        onChange={(event) => setReplyDrafts((current) => ({ ...current, [annotation.id]: event.target.value }))}
                        onKeyDown={(event) => { if (event.key === "Enter") submitReply(annotation); }}
                        placeholder="Reply…"
                        className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-1 text-[11px]"
                      />
                      <button type="button" onClick={() => submitReply(annotation)} className="rounded bg-[var(--acrobat-blue)] px-2 py-1 text-[10px] font-semibold text-white">Send</button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <div className="px-[14px] py-3 text-xs text-[var(--text-secondary)]">No review items in this filter.</div>}
      </div>

      <div className="border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-[14px] py-2.5 text-xs font-semibold uppercase text-[var(--text-primary)]">
          <span>OCR Jobs</span>
        </div>
        <div className="px-[14px] py-2.5">
          {ocrJobs.length === 0 ? <p className="text-[var(--ui-font-sm)] text-[var(--text-secondary)]">No OCR jobs</p> : (
            <ul className="m-0 list-none p-0">
              {ocrJobs.map((job) => <li key={job.id} className="flex items-center justify-between border-b border-[var(--ui-divider)] py-1.5 text-xs"><span>{job.status}</span><span>{job.progress}%</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
