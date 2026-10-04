import type { MeasurementMode, MeasurementUnit } from "../lib/measurement";

export function PdfMeasurementToolbar({
  mode,
  scale,
  unit,
  result,
  calibrated,
  canCalibrate,
  onModeChange,
  onScaleChange,
  onUnitChange,
  onCalibrate,
  onResetCalibration,
  onClose,
}: {
  mode: MeasurementMode;
  scale: number;
  unit: MeasurementUnit;
  result: string | null;
  calibrated: boolean;
  canCalibrate: boolean;
  onModeChange: (mode: MeasurementMode) => void;
  onScaleChange: (scale: number) => void;
  onUnitChange: (unit: MeasurementUnit) => void;
  onCalibrate: () => void;
  onResetCalibration: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-40 flex max-w-[620px] flex-wrap items-center gap-1.5 rounded-md border border-emerald-300 bg-white/95 px-2 py-1 text-[11px] font-semibold text-emerald-900 shadow-lg">
      <span>Measure</span>
      <select
        aria-label="Measurement mode"
        value={mode}
        onChange={(event) => onModeChange(event.target.value as MeasurementMode)}
        className="rounded border border-emerald-200 bg-white px-1 py-0.5"
      >
        <option value="distance">Distance</option>
        <option value="perimeter">Perimeter</option>
        <option value="area">Area</option>
      </select>
      <span>Scale</span>
      <select
        aria-label="Drawing scale"
        value={scale}
        onChange={(event) => onScaleChange(Number(event.target.value))}
        className="rounded border border-emerald-200 bg-white px-1 py-0.5"
      >
        {[1, 20, 50, 100, 200, 500].map((value) => (
          <option key={value} value={value}>1:{value}</option>
        ))}
      </select>
      <select
        aria-label="Measurement unit"
        value={unit}
        onChange={(event) => onUnitChange(event.target.value as MeasurementUnit)}
        className="rounded border border-emerald-200 bg-white px-1 py-0.5"
      >
        <option value="m">m</option>
        <option value="cm">cm</option>
        <option value="mm">mm</option>
      </select>
      {mode === "distance" ? (
        <button
          type="button"
          disabled={!canCalibrate}
          onClick={onCalibrate}
          className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          title="Draw a known distance first, then calibrate it"
        >
          {calibrated ? "Recalibrate" : "Calibrate"}
        </button>
      ) : null}
      {calibrated ? (
        <button
          type="button"
          onClick={onResetCalibration}
          className="rounded border border-emerald-200 bg-white px-1.5 py-0.5"
        >
          Reset calibration
        </button>
      ) : null}
      <span className="text-emerald-700">
        {result ?? (mode === "distance" ? "Drag a line" : "Click points; double-click to finish")}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-900"
        aria-label="Close measurement tool"
        title="Close measurement tool"
      >
        ×
      </button>
    </div>
  );
}
