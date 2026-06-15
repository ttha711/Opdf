import { useState, useEffect, useRef } from "react";

interface CropPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  totalPages: number;
  currentPage: number;
  onCropComplete: (options: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    applyAll?: boolean;
  }) => Promise<void> | void;
}

export function CropPageModal({
  isOpen,
  onClose,
  fileName,
  totalPages,
  currentPage,
  onCropComplete,
}: CropPageModalProps) {
  const [sides, setSides] = useState({ top: 5, bottom: 5, left: 5, right: 5 });
  const [locked, setLocked] = useState(false);
  const [applyScope, setApplyScope] = useState<"current" | "all">("current");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSides({ top: 5, bottom: 5, left: 5, right: 5 });
      setLocked(false);
      setApplyScope("current");
      setErrorMsg(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = 180, H = 254;
    ctx.clearRect(0, 0, W, H);
    // Outer rect
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    // Inner rect
    const ix = sides.left / 100 * W;
    const iy = sides.top / 100 * H;
    const iw = (1 - (sides.left + sides.right) / 100) * W;
    const ih = (1 - (sides.top + sides.bottom) / 100) * H;
    // Crop zones (outside inner rect) - light red fill
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fillRect(0, 0, W, iy);              // top strip
    ctx.fillRect(0, iy + ih, W, H - iy - ih); // bottom strip
    ctx.fillRect(0, iy, ix, ih);            // left strip
    ctx.fillRect(ix + iw, iy, W - ix - iw, ih); // right strip
    // Dashed inner border
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgb(59,130,246)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ix, iy, iw, ih);
    ctx.setLineDash([]);
    // Labels
    ctx.fillStyle = "rgb(59,130,246)";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`T: ${sides.top}%`, W / 2, Math.max(10, iy - 3));
    ctx.fillText(`B: ${sides.bottom}%`, W / 2, Math.min(H - 3, iy + ih + 11));
    ctx.textAlign = "left";
    ctx.fillText(`L: ${sides.left}%`, 2, H / 2);
    ctx.textAlign = "right";
    ctx.fillText(`R: ${sides.right}%`, W - 2, H / 2);
  }, [sides, isOpen]);

  function handleSideChange(side: "top" | "bottom" | "left" | "right", value: number) {
    const clamped = Math.min(45, Math.max(0, value));
    if (locked) {
      setSides({ top: clamped, bottom: clamped, left: clamped, right: clamped });
    } else {
      setSides(prev => ({ ...prev, [side]: clamped }));
    }
  }

  if (!isOpen) return null;

  const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";

  async function handleCrop() {
    setErrorMsg(null);

    for (const [key, val] of Object.entries(sides)) {
      if (Number.isNaN(val) || val < 0 || val > 45) {
        setErrorMsg(`Crop margin for ${key} must be between 0 and 45%.`);
        return;
      }
    }
    if (sides.left + sides.right >= 90) {
      setErrorMsg("Left + Right margins must be less than 90%.");
      return;
    }
    if (sides.top + sides.bottom >= 90) {
      setErrorMsg("Top + Bottom margins must be less than 90%.");
      return;
    }

    setIsProcessing(true);
    try {
      await onCropComplete({
        page: currentPage,
        x: sides.left / 100,
        y: sides.top / 100,
        width: 1 - (sides.left + sides.right) / 100,
        height: 1 - (sides.top + sides.bottom) / 100,
        applyAll: applyScope === "all",
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to crop document.");
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
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500">
              <path d="M6 2v14a2 2 0 0 0 2 2h14" />
              <path d="M18 22V8a2 2 0 0 0-2-2H2" />
            </svg>
            Crop Document Margins
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
            <span className="flex-shrink-0 rounded bg-blue-50 dark:bg-blue-950/30 px-2 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-600 dark:text-red-400 font-semibold leading-normal">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Canvas preview */}
          <div className="flex flex-col items-center gap-2">
            <canvas
              ref={canvasRef}
              width={180}
              height={254}
              className="rounded-lg border"
              style={{ borderColor: "var(--border-color)" }}
            />
          </div>

          {/* Lock toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocked(l => !l)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${locked ? "bg-blue-600 text-white border-blue-600" : "bg-transparent text-[var(--text-secondary)] border-[var(--border-color)]"}`}
              disabled={isProcessing}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                {locked
                  ? <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>
                  : <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>
                }
              </svg>
              {locked ? "Locked (all sides)" : "Lock all sides"}
            </button>
            <span className="text-[10px] text-[var(--text-secondary)]">Move all four edges together</span>
          </div>

          {/* 4 sliders in 2x2 grid */}
          <div className="form-group">
            <label className="form-label">Crop Margins (0% – 45% per side)</label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {(["top", "bottom", "left", "right"] as const).map((side) => (
                <div key={side} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold capitalize text-[var(--text-secondary)]">{side}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="45"
                      step="1"
                      className="flex-1 accent-blue-600"
                      value={sides[side]}
                      onChange={(e) => handleSideChange(side, Number(e.target.value))}
                      disabled={isProcessing}
                    />
                    <input
                      type="number"
                      min="0"
                      max="45"
                      className="form-control text-center w-12 text-xs"
                      value={sides[side]}
                      onChange={(e) => handleSideChange(side, Number(e.target.value) || 0)}
                      disabled={isProcessing}
                    />
                    <span className="text-xs font-semibold">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Apply Scope</label>
            <div className="radio-group">
              <div
                className={`radio-card ${applyScope === "current" ? "active" : ""}`}
                onClick={() => setApplyScope("current")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={applyScope === "current"}
                    onChange={() => setApplyScope("current")}
                    className="accent-blue-600"
                    disabled={isProcessing}
                  />
                  Current Page Only ({currentPage})
                </div>
                <div className="radio-card-desc">Crop and zoom the active page margins.</div>
              </div>

              <div
                className={`radio-card ${applyScope === "all" ? "active" : ""}`}
                onClick={() => setApplyScope("all")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={applyScope === "all"}
                    onChange={() => setApplyScope("all")}
                    className="accent-blue-600"
                    disabled={isProcessing}
                  />
                  All Pages
                </div>
                <div className="radio-card-desc">Apply this crop factor to every page in the document.</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-3 text-[11px] text-[var(--text-secondary)] leading-normal flex gap-2 border" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <span className="text-[13px] relative top-px">💡</span>
            <span>Tip: Cropping works by editing the page bounding box (CropBox) metadata. No content is deleted from the file structure, meaning this is completely safe.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing} type="button">
            Cancel
          </button>
          <button
            className="btn-premium btn-premium-primary"
            onClick={handleCrop}
            disabled={isProcessing}
            type="button"
          >
            {isProcessing ? "Cropping..." : "Crop Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
