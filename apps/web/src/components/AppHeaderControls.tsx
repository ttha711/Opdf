import type { ReactNode } from "react";

type SaveState = "idle" | "saving" | "saved";

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
  action,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  action: string;
}) {
  return (
    <button
      data-opdf-action={action}
      className="opdf-header-icon-btn"
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function UndoButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Undo (Ctrl+Z)" action="undo" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7H5v-4M5 7l4-4M5.5 7.5A8 8 0 1 1 8 18.7" />
      </svg>
    </IconButton>
  );
}

export function RedoButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Redo (Ctrl+Y)" action="redo" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 7h4v-4m0 4-4-4m3.5 4.5A8 8 0 1 0 16 18.7" />
      </svg>
    </IconButton>
  );
}

export function SaveControl({
  saveState,
  onSave,
  autosaveEnabled,
}: {
  saveState: SaveState;
  onSave: () => void;
  autosaveEnabled: boolean;
}) {
  const label =
    saveState === "saving" ? "Saving..." :
    saveState === "saved" ? "Saved" :
    "Unsaved";
  const title =
    saveState === "saving" ? "Saving document" :
    saveState === "saved" ? (autosaveEnabled ? "All changes saved. Autosave is on." : "All changes saved.") :
    (autosaveEnabled ? "Unsaved changes. Autosave will run shortly." : "Unsaved changes.");

  return (
    <div className="opdf-save-cluster" data-opdf-save-state={saveState} title={title}>
      <IconButton
        label={saveState === "saving" ? "Saving..." : "Save now (Ctrl+S)"}
        action="save"
        onClick={onSave}
        disabled={saveState === "saving"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h12l2 2v14H5z" />
          <path d="M8 4v6h8V4M8 20v-6h8v6" />
        </svg>
      </IconButton>
      <span
        className="opdf-save-status-slot"
        aria-live="polite"
        aria-label={title}
      >
        <span className="opdf-save-status-dot" aria-hidden="true" />
        <span>{label}</span>
      </span>
    </div>
  );
}
