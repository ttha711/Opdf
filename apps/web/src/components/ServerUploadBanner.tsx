import { useEffect, useState } from "react";
import {
  OPDF_UPLOAD_CANCEL_EVENT,
  OPDF_UPLOAD_RETRY_EVENT,
  OPDF_UPLOAD_STATUS_EVENT,
  type ServerUploadUiState,
} from "../hooks/useServerUpload";

function formatBytes(value = 0) {
  if (value < 1024 * 1024) return `${Math.max(0, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function ServerUploadBanner() {
  const [state, setState] = useState<ServerUploadUiState>({ status: "idle" });

  useEffect(() => {
    const onStatus = (event: Event) => {
      setState((event as CustomEvent<ServerUploadUiState>).detail);
    };
    window.addEventListener(OPDF_UPLOAD_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(OPDF_UPLOAD_STATUS_EVENT, onStatus);
  }, []);

  if (state.status === "idle") return null;

  const percent = Math.max(0, Math.min(100, state.percent ?? 0));
  const uploading = state.status === "uploading";
  const failed = state.status === "failed";
  const stored = state.status === "stored";

  return (
    <div
      data-opdf-upload-state={state.status}
      data-opdf-upload-progress={percent}
      className="fixed bottom-12 left-4 z-[90] w-[min(440px,calc(100vw-32px))] rounded-lg border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-3 py-2 shadow-xl"
      role={failed ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-[var(--text-primary)]">
              {uploading ? "Opening locally · uploading in background" : stored ? "Stored on OPDF Server" : "Upload paused"}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
              {uploading || failed ? `${percent}%` : "100%"}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
            {state.fileName}
            {state.total ? ` · ${formatBytes(state.loaded)} / ${formatBytes(state.total)}` : ""}
            {failed ? " · PDF is still open locally" : ""}
          </div>
          {(uploading || failed) ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ui-muted-bg)]">
              <div
                className="h-full rounded-full bg-[var(--acrobat-blue)] transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
          {failed && state.error ? (
            <div className="mt-1 truncate text-[10px] text-[var(--ui-error-text)]" title={state.error}>
              {state.error}
            </div>
          ) : null}
        </div>
        {uploading ? (
          <button
            type="button"
            className="rounded border border-[var(--border-color)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--ui-hover-bg)]"
            onClick={() => window.dispatchEvent(new Event(OPDF_UPLOAD_CANCEL_EVENT))}
          >
            Cancel upload
          </button>
        ) : failed ? (
          <button
            type="button"
            className="rounded bg-[var(--acrobat-blue)] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
            onClick={() => window.dispatchEvent(new Event(OPDF_UPLOAD_RETRY_EVENT))}
          >
            Retry upload
          </button>
        ) : null}
      </div>
    </div>
  );
}
