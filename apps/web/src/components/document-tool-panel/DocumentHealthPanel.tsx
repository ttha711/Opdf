import { useEffect, useRef, useState } from "react";
import { getServerDocumentUrl } from "../../lib/documentSource";

type Finding = { page?: number | null; message?: string };
type Check = { rule?: string; name?: string; status?: string; findings?: Finding[] };
type Health = {
  ok: boolean;
  documentSha256: string;
  elapsedMs: number;
  summary: { document?: { pages?: number }; pdf_version?: string; tagged?: boolean; has_javascript?: boolean };
  revisions: { revisions?: unknown[] };
  accessibility: { passed?: number; failed?: number; manual?: number; skipped?: number; results?: Check[] };
  pdfa: { issues?: Array<{ clause?: string; message?: string; page?: number | null }> };
  warnings: string[];
};

export function DocumentHealthPanel({ sourceIdentity }: { sourceIdentity?: string | null }) {
  const [report, setReport] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef<AbortController | null>(null);
  const savedUrl = sourceIdentity ? getServerDocumentUrl(sourceIdentity)?.split("?")[0] : null;

  useEffect(() => {
    setReport(null);
    setError("");
    return () => { inFlight.current?.abort(); inFlight.current = null; };
  }, [savedUrl]);

  const analyze = async () => {
    if (!savedUrl || busy) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true); setError(""); setReport(null);
    try {
      const response = await fetch(savedUrl + "/health", {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      const result = await response.json() as Health & { error?: string };
      if (!response.ok) throw new Error(result.error || "Document Health failed.");
      setReport(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <section className="space-y-3 text-xs" aria-label="Document Health">
      <p className="text-[var(--text-secondary)]">
        Read-only PDF structure, accessibility, revisions and preliminary PDF/A-2b checks via PdfCraft.
        Results describe the last <strong>saved server copy</strong>. Save edits before scanning.
      </p>
      {!savedUrl ? (
        <p role="status">Document Health requires a PDF saved on OPDF Server.</p>
      ) : (
        <button type="button" data-opdf-action="run-document-health" disabled={busy}
          onClick={() => void analyze()}
          className="w-full rounded bg-[var(--acrobat-blue)] p-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Analyzing…" : report ? "Run analysis again" : "Analyze saved PDF"}
        </button>
      )}
      {error && <p role="alert" className="rounded border border-red-400 p-2 text-red-600">{error}</p>}
      {report && (
        <div data-opdf-document-health="ready" className="space-y-3">
          <div className="rounded border border-[var(--border-color)] p-2 space-y-1">
            <p><strong>Pages:</strong> {report.summary.document?.pages ?? "Unknown"}</p>
            <p><strong>PDF version:</strong> {report.summary.pdf_version || "Unknown"}</p>
            <p><strong>Tagged:</strong> {report.summary.tagged ? "Yes" : "No"}</p>
            <p><strong>JavaScript:</strong> {report.summary.has_javascript ? "Present" : "Not detected"}</p>
            <p><strong>Scan time:</strong> {report.elapsedMs} ms</p>
          </div>
          <div className="rounded border border-[var(--border-color)] p-2 space-y-1">
            <h5 className="font-bold">Accessibility</h5>
            <p>{report.accessibility.passed ?? 0} passed · {report.accessibility.failed ?? 0} failed · {report.accessibility.manual ?? 0} manual</p>
            {(report.accessibility.results || []).filter(item => item.status === "failed").slice(0, 25).map((item, index) => (
              <p key={item.rule || index} className="border-t border-[var(--border-color)] pt-1">
                {item.name || item.rule}: {item.findings?.slice(0, 2).map(x => x.message).filter(Boolean).join("; ") || "Check failed"}
              </p>
            ))}
          </div>
          <div className="rounded border border-[var(--border-color)] p-2 space-y-1">
            <h5 className="font-bold">PDF/A-2b preflight</h5>
            <p>{report.pdfa.issues?.length ?? 0} potential issue(s)</p>
            {report.pdfa.issues?.slice(0, 25).map((issue, index) => (
              <p key={index} className="border-t border-[var(--border-color)] pt-1">
                {issue.clause ? issue.clause + ": " : ""}{issue.message || "Issue detected"}
              </p>
            ))}
          </div>
          <details className="rounded border border-[var(--border-color)] p-2">
            <summary className="cursor-pointer font-semibold">Full diagnostic JSON</summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px]">
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
          <p className="break-all text-[10px] text-[var(--text-secondary)]">SHA-256: {report.documentSha256}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">
            Diagnostic only. Not PDF/A certification or a cryptographic signature trust verdict.
          </p>
        </div>
      )}
    </section>
  );
}
