import { useState, useEffect } from "react";

interface DecryptModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  onDecryptComplete: (password: string) => Promise<void> | void;
}

export function DecryptModal({
  isOpen,
  onClose,
  fileName,
  onDecryptComplete,
}: DecryptModalProps) {
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setErrorMsg(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";

  async function handleDecrypt() {
    setErrorMsg(null);
    const cleanPass = password.trim();
    if (!cleanPass) {
      setErrorMsg("Password is required to decrypt this document.");
      return;
    }

    setIsProcessing(true);
    try {
      await onDecryptComplete(cleanPass);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Incorrect password. Failed to decrypt PDF.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal max-w-[440px]">
        {/* Header */}
        <div className="premium-modal-header">
          <h3 className="premium-modal-title flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            Remove PDF Password
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
            <span className="flex-shrink-0 rounded bg-green-50 dark:bg-green-950/30 px-2 py-1 text-xs font-bold text-green-600 dark:text-green-400">
              Unlock Security
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-600 dark:text-red-400 font-semibold leading-normal">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="decryptPasswordInput">Enter PDF Password</label>
            <input
              id="decryptPasswordInput"
              type="password"
              placeholder="Enter current password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isProcessing}
            />
            <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
              Enter the password that was used to encrypt this PDF document to permanently remove all security constraints.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing} type="button">
            Cancel
          </button>
          <button
            className="btn-premium bg-green-600 hover:bg-green-700 text-white font-semibold shadow"
            onClick={handleDecrypt}
            disabled={isProcessing}
            type="button"
          >
            {isProcessing ? "Unlocking..." : "Decrypt & Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
