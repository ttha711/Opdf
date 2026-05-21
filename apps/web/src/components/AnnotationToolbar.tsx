import { useEffect, useRef } from "react";

interface AnnotationToolbarProps {
  /** Annotation id being edited */
  annotationId: string;
  /** Current color value (hex or rgba string) */
  color: string;
  /** Current opacity 0–1 */
  opacity: number;
  /** Position on screen — toolbar anchors to these coordinates */
  anchorX: number;
  anchorY: number;
  onColorChange: (id: string, color: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  kind?: string;
  fontSize?: number;
  onFontSizeChange?: (id: string, size: number) => void;
  size?: number;
  onSizeChange?: (id: string, size: number) => void;
}

/**
 * A lightweight floating toolbar that appears just above a selected
 * annotation. It provides:
 *   - Native color picker (works cross-browser without extra deps)
 *   - Opacity slider or Font Size (conditional)
 *   - Delete button
 */
export function AnnotationToolbar({
  annotationId,
  color,
  opacity,
  anchorX,
  anchorY,
  onColorChange,
  onOpacityChange,
  onDelete,
  onClose,
  kind,
  fontSize,
  onFontSizeChange,
  size,
  onSizeChange,
}: AnnotationToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Resolve a displayable hex from any color string
  const hexColor = resolveHex(color);

  // Close when clicking outside the toolbar
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  // Keep toolbar inside viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: clampX(anchorX),
    top: Math.max(8, anchorY - 52),
    zIndex: 9999,
    transform: "translateX(-50%)",
  };

  return (
    <div ref={ref} className="ann-toolbar" style={style} onPointerDown={(e) => e.stopPropagation()}>
      {/* Color swatch - serves as background color for Note */}
      <label className="ann-toolbar-item ann-toolbar-color" title={kind === "note" ? "Background color" : "Change color"}>
        <span className="ann-toolbar-color-swatch" style={{ background: hexColor }} />
        <input
          type="color"
          value={hexColor}
          onChange={(e) => onColorChange(annotationId, e.target.value)}
          className="ann-toolbar-color-input"
        />
      </label>

      <div className="ann-toolbar-divider" />

      {/* Conditional: Opacity vs Font Size */}
      {kind === "note" ? (
        <label className="ann-toolbar-item ann-toolbar-font-size" title="Font size (px)" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
          <span style={{ fontWeight: "bold", fontSize: "14px", color: "var(--ui-muted-text)" }}>A</span>
          <input
            type="number"
            min={6}
            max={96}
            step={1}
            value={fontSize || 16}
            onChange={(e) => onFontSizeChange?.(annotationId, parseInt(e.target.value, 10) || 16)}
            style={{
              width: "45px",
              height: "24px",
              padding: "0 4px",
              textAlign: "center",
              borderRadius: "4px",
              border: "1px solid var(--border-color)",
              background: "rgba(0,0,0,0.05)",
              color: "inherit",
              outline: "none",
            }}
          />
        </label>
      ) : (
        <>
          <label className="ann-toolbar-item ann-toolbar-opacity" title="Opacity">
            <span className="ann-toolbar-label">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <circle cx="8" cy="8" r="7" fillOpacity="0.5" />
              </svg>
            </span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => onOpacityChange(annotationId, parseFloat(e.target.value))}
              className="ann-toolbar-slider"
            />
            <span className="ann-toolbar-pct">{Math.round(opacity * 100)}%</span>
          </label>
          {(kind === "shape" || kind === "redact") && (
            <label className="ann-toolbar-item ann-toolbar-font-size" title="Stroke size (px)" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
              <span style={{ fontWeight: "bold", color: "var(--ui-muted-text)" }}>W</span>
              <input
                type="number"
                min={1}
                max={12}
                step={1}
                value={size || 2}
                onChange={(e) => onSizeChange?.(annotationId, parseInt(e.target.value, 10) || 2)}
                style={{
                  width: "40px",
                  height: "24px",
                  padding: "0 4px",
                  textAlign: "center",
                  borderRadius: "4px",
                  border: "1px solid var(--border-color)",
                  background: "rgba(0,0,0,0.05)",
                  color: "inherit",
                  outline: "none",
                }}
              />
            </label>
          )}
        </>
      )}

      <div className="ann-toolbar-divider" />

      {/* Delete button */}
      <button
        className="ann-toolbar-item ann-toolbar-delete"
        title="Delete (Del)"
        onClick={() => { onDelete(annotationId); onClose(); }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10H3z" />
        </svg>
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampX(x: number): number {
  const HALF_W = 130;
  return Math.min(Math.max(x, HALF_W + 8), window.innerWidth - HALF_W - 8);
}

/**
 * Attempt to derive a #rrggbb hex string from an arbitrary CSS color.
 * Falls back to '#facc15' (default yellow) if parsing fails.
 */
function resolveHex(raw: string): string {
  if (!raw) return "#facc15";
  const hex6 = /^#?([0-9a-f]{6})$/i.exec(raw.trim());
  if (hex6) return `#${hex6[1]}`;
  const hex3 = /^#?([0-9a-f]{3})$/i.exec(raw.trim());
  if (hex3) {
    const [r, g, b] = hex3[1].split("").map((c) => c + c);
    return `#${r}${g}${b}`;
  }
  // Try to parse rgba(r,g,b,a)
  const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw);
  if (rgba) {
    return (
      "#" +
      [rgba[1], rgba[2], rgba[3]]
        .map((v) => parseInt(v).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return "#facc15";
}
