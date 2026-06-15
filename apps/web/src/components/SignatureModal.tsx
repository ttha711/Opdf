import { useEffect, useRef, useState } from "react";

export interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (imageDataUrl: string) => void;
}

type Tab = "draw" | "upload";

export function SignatureModal({ open, onClose, onConfirm }: SignatureModalProps) {
  const [tab, setTab] = useState<Tab>("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  // Setup canvas
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
  }, [open, tab]);

  function getPoint(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
    isDrawingRef.current = true;
    const pt = getPoint(e);
    if (!pt) return;
    // Save current state for undo
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    lastPointRef.current = pt;
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastPointRef.current) return;
    e.preventDefault();
    const pt = getPoint(e);
    if (!pt) return;

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPointRef.current = pt;
  }

  function stopDrawing() {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const prev = historyRef.current.pop();
    if (prev) {
      ctx.putImageData(prev, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    forceUpdate((n) => n + 1);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    forceUpdate((n) => n + 1);
  }

  function handleConfirm() {
    if (tab === "draw") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");
      onConfirm(dataUrl);
    } else {
      if (!uploadedImage) return;
      onConfirm(uploadedImage);
    }
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setUploadedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-toolbar, #fff)",
          border: "1px solid var(--border-color, #ccc)",
          borderRadius: 12,
          padding: 20,
          minWidth: 380,
          maxWidth: "95vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: "bold", color: "var(--text-primary, #000)" }}>
            Add Signature
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--ui-muted-text, #666)" }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["draw", "upload"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "1px solid var(--border-color, #ccc)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: tab === t ? "bold" : "normal",
                background: tab === t ? "var(--acrobat-blue, #0061d5)" : "transparent",
                color: tab === t ? "white" : "var(--text-primary, #000)",
              }}
            >
              {t === "draw" ? "Draw" : "Upload"}
            </button>
          ))}
        </div>

        {tab === "draw" && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                Color
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  style={{ width: 32, height: 24, cursor: "pointer", border: "1px solid #ccc", borderRadius: 4 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                Width
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 11, minWidth: 20 }}>{strokeWidth}px</span>
              </label>
            </div>
            <canvas
              ref={canvasRef}
              width={340}
              height={140}
              style={{
                border: "2px dashed var(--border-color, #ccc)",
                borderRadius: 8,
                cursor: "crosshair",
                touchAction: "none",
                width: "100%",
                background: "#fff",
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={undo}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  border: "1px solid var(--border-color, #ccc)",
                  borderRadius: 5,
                  cursor: "pointer",
                  background: "transparent",
                  color: "var(--text-primary, #000)",
                }}
              >
                Undo
              </button>
              <button
                onClick={clear}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  border: "1px solid var(--border-color, #ccc)",
                  borderRadius: 5,
                  cursor: "pointer",
                  background: "transparent",
                  color: "var(--text-primary, #000)",
                }}
              >
                Clear
              </button>
            </div>
          </>
        )}

        {tab === "upload" && (
          <>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "2px dashed var(--border-color, #ccc)",
                borderRadius: 8,
                padding: 20,
                cursor: "pointer",
                gap: 8,
                minHeight: 100,
                background: "rgba(0,0,0,0.02)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary, #666)" }}>Click to upload PNG, JPG, or SVG</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              {uploadedImage && (
                <img
                  src={uploadedImage}
                  alt="Signature preview"
                  style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain", borderRadius: 4 }}
                />
              )}
            </label>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "1px solid var(--border-color, #ccc)",
              borderRadius: 6,
              cursor: "pointer",
              background: "transparent",
              color: "var(--text-primary, #000)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={tab === "upload" && !uploadedImage}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              background: "var(--acrobat-blue, #0061d5)",
              color: "white",
              fontWeight: "bold",
              opacity: tab === "upload" && !uploadedImage ? 0.5 : 1,
            }}
          >
            Insert Signature
          </button>
        </div>
      </div>
    </div>
  );
}
