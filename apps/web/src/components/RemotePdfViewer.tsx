import { useEffect, useMemo, useRef, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { getServerDocumentUrl } from "../lib/documentSource";

type PageSize = { width: number; height: number };
const TILE = 512;
const LEVELS = [0.25, 0.5, 1, 2, 4, 8] as const;
function levelFor(zoom: number) {
  return LEVELS.find((level) => level >= zoom * Math.min(window.devicePixelRatio || 1, 2)) || 8;
}
function tileUrl(base: string, page: number, level: number, x: number, y: number) {
  return `${base}/tile?page=${page - 1}&level=${level}&x=${x}&y=${y}`;
}

export function RemotePdfViewer(props: PdfViewerProps) {
  const source = getServerDocumentUrl(props.sourceIdentity || "");
  const base = source ? source.split("?")[0] + "/render" : null;
  const [pages, setPages] = useState<PageSize[]>([]);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 360, height: 620 });
  const scroller = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; distance: number; zoom: number } | null>(null);
  const page = Math.max(1, Math.min(pages.length || 1, props.page));
  useEffect(() => {
    if (!base) return;
    const ctrl = new AbortController();
    setPages([]);
    fetch(base + "/meta", { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error("Remote renderer is unavailable"); return r.json(); })
      .then((data) => { if (!ctrl.signal.aborted) { setPages(data.pages || []); props.onDocumentLoaded?.(data.pageCount); } })
      .catch((e) => { if (!ctrl.signal.aborted) setError(String(e.message || e)); });
    return () => ctrl.abort();
  }, [base]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });
      setPosition({ x: el.scrollLeft, y: el.scrollTop });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length]);
  const size = pages[page - 1];
  const fit = size ? Math.min((viewport.width - 16) / size.width, (viewport.height - 16) / size.height, 2) : 1;
  const scale = fit * zoom;
  const level = levelFor(scale);
  const tiles = useMemo(() => {
    if (!size || !base) return [];
    const width = size.width * scale, height = size.height * scale;
    const tileCss = TILE * scale / level;
    const x0 = Math.max(0, Math.floor((position.x - tileCss) / tileCss));
    const y0 = Math.max(0, Math.floor((position.y - tileCss) / tileCss));
    const x1 = Math.min(Math.ceil(size.width * level) / TILE - 1, Math.ceil((position.x + viewport.width + tileCss) / tileCss));
    const y1 = Math.min(Math.ceil(size.height * level) / TILE - 1, Math.ceil((position.y + viewport.height + tileCss) / tileCss));
    const result: { x: number; y: number; src: string; w: number; h: number }[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      result.push({ x, y, src: tileUrl(base, page, level, x, y),
        w: Math.min(tileCss, width - x * tileCss), h: Math.min(tileCss, height - y * tileCss) });
    }
    return result;
  }, [base, page, level, scale, size, position, viewport]);
  function changeZoom(next: number) {
    const el = scroller.current;
    if (!el) return;
    const bounded = Math.max(0.25, Math.min(12, next));
    const ratio = bounded / zoom;
    const x = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    const y = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    setZoom(bounded);
    requestAnimationFrame(() => { el.scrollLeft = x; el.scrollTop = y; });
  }
  const toolStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #94a3b8" };
  if (!base) return <div role="status">Open a stored server document to use lightweight viewing.</div>;
  return <div className="h-full w-full" style={{ display: "flex", flexDirection: "column", minHeight: 0 }} data-opdf-remote-viewer="true">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, padding: 6, background: "#f1f5f9", color: "#0f172a" }}>
      <button style={toolStyle} onClick={() => props.onActivePageChange?.(Math.max(1, page - 1))} aria-label="Previous sheet">‹</button>
      <span style={{ fontSize: 13 }}>Sheet {page}/{pages.length || "…"}</span>
      <button style={toolStyle} onClick={() => props.onActivePageChange?.(Math.min(pages.length, page + 1))} aria-label="Next sheet">›</button>
      <button style={toolStyle} onClick={() => changeZoom(zoom / 1.5)} aria-label="Zoom out">−</button>
      <span style={{ fontSize: 12 }}>{Math.round(zoom * 100)}%</span>
      <button style={toolStyle} onClick={() => changeZoom(zoom * 1.5)} aria-label="Zoom in">+</button>
    </div>
    {error ? <div role="alert" style={{ color: "#b91c1c", padding: 12 }}>{error}</div> : null}
    <div ref={scroller} style={{ flex: 1, overflow: "auto", minHeight: 0, background: "#cbd5e1", touchAction: "pan-x pan-y" }}
      onScroll={(e) => setPosition({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })}
      onTouchStart={(e) => {
        if (e.touches.length !== 2) return;
        const a = e.touches[0], b = e.touches[1];
        touch.current = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
      }}
      onTouchMove={(e) => {
        if (e.touches.length !== 2 || !touch.current) return;
        const a = e.touches[0], b = e.touches[1];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (Math.abs(distance - touch.current.distance) > 10) changeZoom(touch.current.zoom * distance / touch.current.distance);
      }}
      onTouchEnd={() => { touch.current = null; }}
    >
      {size ? <div style={{ position: "relative", width: size.width * scale, height: size.height * scale, minWidth: "100%", background: "white", overflow: "hidden" }}>
        {tiles.map((tile) => <img key={tile.src} src={tile.src} alt="" draggable={false}
          style={{ position: "absolute", left: tile.x * TILE * scale / level, top: tile.y * TILE * scale / level,
            width: tile.w, height: tile.h, objectFit: "fill", userSelect: "none", pointerEvents: "none" }} />)}
      </div> : <p style={{ padding: 16 }}>Loading drawing metadata…</p>}
    </div>
    <div style={{ padding: "3px 10px", fontSize: 11, background: "#f1f5f9", color: "#475569" }}>
      Lightweight remote mode · Original vector PDF preserved on server
    </div>
  </div>;
}
