import { useState, useEffect } from "react";
import { parsePageList } from "../lib/document-tools";

interface DeletePagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  totalPages: number;
  currentPage: number;
  onDeleteComplete: (pageNumbers: number[]) => Promise<void> | void;
}

export function DeletePagesModal({
  isOpen,
  onClose,
  fileName,
  totalPages,
  currentPage,
  onDeleteComplete,
}: DeletePagesModalProps) {
  const [deleteMode, setDeleteMode] = useState<"current" | "range">("current");
  const [rangeInput, setRangeInput] = useState<string>(String(currentPage));
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDeleteMode("current");
      setRangeInput(String(currentPage));
      setErrorMsg(null);
      setIsProcessing(false);
    }
  }, [isOpen, currentPage]);

  if (!isOpen) return null;

  const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";

  async function handleDelete() {
    setErrorMsg(null);
    let pagesToDelete: number[] = [];

    if (deleteMode === "current") {
      pagesToDelete = [currentPage];
    } else {
      pagesToDelete = parsePageList(rangeInput, totalPages);
    }

    if (pagesToDelete.length === 0) {
      setErrorMsg("Please enter a valid page range (e.g. 2, 4-6).");
      return;
    }

    if (pagesToDelete.length >= totalPages) {
      setErrorMsg("Cannot delete all pages in the document. At least 1 page must remain.");
      return;
    }

    setIsProcessing(true);
    try {
      await onDeleteComplete(pagesToDelete);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete pages.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal max-w-[460px]">
        {/* Header */}
        <div className="premium-modal-header">
          <h3 className="premium-modal-title flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
            Delete Pages
          </h3>
          <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="premium-modal-body">
          <div className="flex items-center justify-between rounded-lg p-3 border border-dashed" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Document</p>
              <p className="text-sm font-semibold truncate text-[var(--text-primary)]">{baseName}</p>
            </div>
            <span className="flex-shrink-0 rounded bg-red-50 dark:bg-red-950/30 px-2 py-1 text-xs font-bold text-red-600 dark:text-red-400">
              {totalPages} {totalPages === 1 ? "page" : "pages"}
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-600 dark:text-red-400 font-semibold leading-normal">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="form-group mt-2">
            <label className="form-label">Choose Pages to Delete</label>
            <div className="radio-group">
              <div
                className={`radio-card ${deleteMode === "current" ? "active" : ""}`}
                onClick={() => setDeleteMode("current")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={deleteMode === "current"}
                    onChange={() => setDeleteMode("current")}
                    className="accent-red-600"
                    disabled={isProcessing}
                  />
                  Current Page ({currentPage})
                </div>
                <div className="radio-card-desc">Remove only the active page from the document.</div>
              </div>

              <div
                className={`radio-card ${deleteMode === "range" ? "active" : ""}`}
                onClick={() => setDeleteMode("range")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={deleteMode === "range"}
                    onChange={() => setDeleteMode("range")}
                    className="accent-red-600"
                    disabled={isProcessing}
                  />
                  Custom Page Range
                </div>
                <div className="radio-card-desc">Specify exact page indexes or ranges to remove.</div>
              </div>
            </div>
          </div>

          {deleteMode === "range" && (
            <div className="form-group animate-fadeIn">
              <label className="form-label" htmlFor="deleteRangeInput">Enter Page Numbers</label>
              <input
                id="deleteRangeInput"
                type="text"
                placeholder="e.g. 2, 4-6, 9"
                className="form-control"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                disabled={isProcessing}
              />
              <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                Use commas to separate pages, and hyphens for ranges. Page numbers must be between 1 and {totalPages}.
              </span>
            </div>
          )}

          <div className="rounded-lg p-3 text-[11px] text-[var(--text-secondary)] leading-normal flex gap-2 border" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <span className="text-[13px] relative top-px">⚠️</span>
            <span>Warning: Deleting pages alters the structure of the document. This action can be undone using the Undo history action.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing} type="button">
            Cancel
          </button>
          <button
            className="btn-premium bg-red-600 hover:bg-red-700 text-white font-semibold shadow"
            onClick={handleDelete}
            disabled={isProcessing}
            type="button"
          >
            {isProcessing ? "Deleting..." : "Delete Pages"}
          </button>
        </div>
      </div>
    </div>
  );
}
