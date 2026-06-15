import { useState, useEffect } from "react";
import type { PasswordOptions } from "@opdf/core";

interface EncryptModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  onEncryptComplete: (options: PasswordOptions) => Promise<void> | void;
}

export function EncryptModal({
  isOpen,
  onClose,
  fileName,
  onEncryptComplete,
}: EncryptModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [useSeparatePermissionsPassword, setUseSeparatePermissionsPassword] = useState(false);
  
  // Permissions checkboxes (default: allow all)
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowModify, setAllowModify] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const [allowAnnotate, setAllowAnnotate] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setConfirmPassword("");
      setOwnerPassword("");
      setUseSeparatePermissionsPassword(false);
      setAllowPrint(true);
      setAllowModify(true);
      setAllowCopy(true);
      setAllowAnnotate(true);
      setErrorMsg(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";

  async function handleEncrypt() {
    setErrorMsg(null);

    const cleanPass = password.trim();
    if (!cleanPass) {
      setErrorMsg("Password cannot be blank.");
      return;
    }

    if (cleanPass !== confirmPassword.trim()) {
      setErrorMsg("Passwords do not match. Please verify.");
      return;
    }

    // PDF Encryption passwords must be ASCII safe
    if (/[^\x20-\x7E]/.test(cleanPass)) {
      setErrorMsg("Password must contain standard alphanumeric and symbol characters only.");
      return;
    }

    const cleanOwner = useSeparatePermissionsPassword ? ownerPassword.trim() : cleanPass;
    if (useSeparatePermissionsPassword && !cleanOwner) {
      setErrorMsg("Permissions password cannot be blank if enabled.");
      return;
    }

    if (useSeparatePermissionsPassword && cleanOwner === cleanPass) {
      setErrorMsg("Permissions password must be different from Document Open password.");
      return;
    }

    // Build permissions bitwise number: 4=print, 8=modify, 16=copy, 32=annotate
    let permissionsMask = 0;
    if (allowPrint) permissionsMask |= 4;
    if (allowModify) permissionsMask |= 8;
    if (allowCopy) permissionsMask |= 16;
    if (allowAnnotate) permissionsMask |= 32;

    setIsProcessing(true);
    try {
      await onEncryptComplete({
        userPassword: cleanPass,
        ownerPassword: cleanOwner,
        permissions: permissionsMask,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to encrypt PDF.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal max-w-[500px]">
        {/* Header */}
        <div className="premium-modal-header">
          <h3 className="premium-modal-title flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-yellow-500">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Protect PDF with Password
          </h3>
          <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="premium-modal-body max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between rounded-lg p-3 border border-dashed" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Target Document</p>
              <p className="text-sm font-semibold truncate text-[var(--text-primary)]">{baseName}</p>
            </div>
            <span className="flex-shrink-0 rounded bg-yellow-100 dark:bg-yellow-900/30 px-2.5 py-1 text-xs font-bold text-yellow-700 dark:text-yellow-400">
              AES-256 Secured
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-600 dark:text-red-400 font-semibold leading-normal">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* User Password Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label" htmlFor="userPasswordInput">Document Open Password</label>
              <input
                id="userPasswordInput"
                type="password"
                placeholder="Enter password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="userPasswordConfirmInput">Confirm Password</label>
              <input
                id="userPasswordConfirmInput"
                type="password"
                placeholder="Confirm password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* Permissions Pass Option */}
          <div className="form-group mt-2">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useSeparatePermissionsPassword}
                onChange={(e) => setUseSeparatePermissionsPassword(e.target.checked)}
                className="accent-blue-600 h-4 w-4"
                disabled={isProcessing}
              />
              Use separate password to restrict editing/printing
            </label>
          </div>

          {useSeparatePermissionsPassword && (
            <div className="form-group animate-fadeIn">
              <label className="form-label" htmlFor="ownerPasswordInput">Permissions Password</label>
              <input
                id="ownerPasswordInput"
                type="password"
                placeholder="Enter permissions password"
                className="form-control"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                disabled={isProcessing}
              />
              <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                Required for anyone who wants to edit, print, or copy content from this PDF.
              </span>
            </div>
          )}

          {/* Permissions Checklist Group */}
          <div className="form-group mt-2">
            <label className="form-label">Restrict Document Permissions</label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl p-4 border" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
              <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowPrint}
                  onChange={(e) => setAllowPrint(e.target.checked)}
                  className="accent-blue-600 h-4 w-4"
                  disabled={isProcessing}
                />
                Allow Printing
              </label>

              <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowCopy}
                  onChange={(e) => setAllowCopy(e.target.checked)}
                  className="accent-blue-600 h-4 w-4"
                  disabled={isProcessing}
                />
                Allow Copying Text/Images
              </label>

              <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowModify}
                  onChange={(e) => setAllowModify(e.target.checked)}
                  className="accent-blue-600 h-4 w-4"
                  disabled={isProcessing}
                />
                Allow Modifying Content
              </label>

              <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowAnnotate}
                  onChange={(e) => setAllowAnnotate(e.target.checked)}
                  className="accent-blue-600 h-4 w-4"
                  disabled={isProcessing}
                />
                Allow Adding Annotations
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing} type="button">
            Cancel
          </button>
          <button
            className="btn-premium btn-premium-primary"
            onClick={handleEncrypt}
            disabled={isProcessing}
            type="button"
          >
            {isProcessing ? "Encrypting..." : "Protect PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
