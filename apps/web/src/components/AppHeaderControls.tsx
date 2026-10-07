import type { ReactNode } from "react";
import { OpdfIcon } from "./OpdfIcon";

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
      <OpdfIcon name="undo" />
    </IconButton>
  );
}

export function RedoButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Redo (Ctrl+Y)" action="redo" onClick={onClick}>
      <OpdfIcon name="redo" />
    </IconButton>
  );
}

export function SaveControl({
  saveState,
  onSave,
  autosaveEnabled,
  autosaveStatus,
}: {
  saveState: SaveState;
  onSave: () => void;
  autosaveEnabled: boolean;
  autosaveStatus: "idle" | "offline" | "retrying";
}) {
  const label =
    saveState === "saving" ? "Saving..." :
    saveState === "saved" ? "Saved" :
    autosaveStatus === "offline" ? "Offline" :
    autosaveStatus === "retrying" ? "Retrying" :
    "Unsaved";
  const title =
    saveState === "saving" ? "Saving document" :
    saveState === "saved" ? (autosaveEnabled ? "All changes saved. Autosave is on." : "All changes saved.") :
    autosaveStatus === "offline" ? "Offline. Changes are pending and will retry when the connection returns." :
    autosaveStatus === "retrying" ? "The last autosave failed. OPDF will retry automatically." :
    (autosaveEnabled ? "Unsaved changes. Autosave will run shortly." : "Unsaved changes.");

  return (
    <div className="opdf-save-cluster" data-opdf-save-state={saveState} title={title}>
      <IconButton
        label={saveState === "saving" ? "Saving..." : "Save now (Ctrl+S)"}
        action="save"
        onClick={onSave}
        disabled={saveState === "saving"}
      >
        <OpdfIcon name="save" />
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
