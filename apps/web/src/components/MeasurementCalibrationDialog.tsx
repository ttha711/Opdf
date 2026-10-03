import { useEffect, useState } from "react";
import type { MeasurementUnit } from "../lib/measurement";

export function MeasurementCalibrationDialog({
  open,
  unit,
  onCancel,
  onApply,
}: {
  open: boolean;
  unit: MeasurementUnit;
  onCancel: () => void;
  onApply: (value: number) => void;
}) {
  const [value, setValue] = useState("1");

  useEffect(() => {
    if (open) setValue("1");
  }, [open]);

  if (!open) return null;

  const numeric = Number(value);
  const valid = Number.isFinite(numeric) && numeric > 0;

  const submit = () => {
    if (valid) onApply(numeric);
  };

  return (
    <div className="modal-backdrop z-[10030]" role="dialog" aria-modal="true" aria-labelledby="measurement-calibration-title">
      <div className="premium-modal w-full max-w-sm">
        <div className="premium-modal-header">
          <div>
            <div id="measurement-calibration-title" className="premium-modal-title">Calibrate measurement</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              Enter the known distance for the line you just measured.
            </div>
          </div>
          <button type="button" className="premium-modal-close" aria-label="Close dialog" onClick={onCancel}>✕</button>
        </div>

        <div className="premium-modal-body">
          <label className="form-label" htmlFor="known-measurement-distance">Known distance ({unit})</label>
          <input
            id="known-measurement-distance"
            type="number"
            min="0"
            step="any"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
            className="form-control"
          />
        </div>

        <div className="premium-modal-footer">
          <button type="button" className="btn-premium btn-premium-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-premium btn-premium-primary" disabled={!valid} onClick={submit}>Apply calibration</button>
        </div>
      </div>
    </div>
  );
}
