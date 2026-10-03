import { useEffect, useState } from "react";

export function AiPatchDialog({
  open,
  onCancel,
  onApply,
}: {
  open: boolean;
  onCancel: () => void;
  onApply: (replacement: string) => void;
}) {
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (open) setReplacement("");
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const value = replacement.trim();
    if (!value) return;
    onApply(value);
  };

  return (
    <div className="modal-backdrop z-[10030]" role="dialog" aria-modal="true" aria-labelledby="ai-patch-title">
      <div className="premium-modal w-full max-w-lg">
        <div className="premium-modal-header">
          <div>
            <div id="ai-patch-title" className="premium-modal-title">AI Patch</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              Replace the selected area with editable PDF text.
            </div>
          </div>
          <button
            type="button"
            className="premium-modal-close"
            aria-label="Close dialog"
            onClick={onCancel}
          >
            ✕
          </button>
        </div>

        <div className="premium-modal-body">
          <label className="form-label" htmlFor="ai-patch-replacement">Replacement text</label>
          <textarea
            id="ai-patch-replacement"
            autoFocus
            rows={5}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder="Enter replacement text…"
            className="w-full resize-y rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--acrobat-blue)]"
          />
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Ctrl/Cmd+Enter to apply · Esc to cancel
          </p>
        </div>

        <div className="premium-modal-footer">
          <button type="button" className="btn-premium btn-premium-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-premium btn-premium-primary"
            disabled={!replacement.trim()}
            onClick={submit}
          >
            Apply Patch
          </button>
        </div>
      </div>
    </div>
  );
}
