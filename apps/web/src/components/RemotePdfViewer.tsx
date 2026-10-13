import { useEffect, useMemo, useRef, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { getServerDocumentUrl } from "../lib/documentSource";

type PageSize = { width: number; height: number };
type PageLayout = PageSize & { index: number; top: number; left: number; scale: number };
type Tile = { key: string; src: string; left: number; top: number; width: number; height: number };
const TILE = 512;
const GAP = 18;
const LEVELS = [0.25, 0.5, 1, 2, 4, 8] as const;

function levelFor(scale: number) {
  return LEVELS.find((level) => level >= scale * Math.min(window.devicePixelRatio || 1, 2)) || 8;
}

function makeTiles(base: string, layout: PageLayout, level: number, scale: number,
  position: { x: number; y: number }, viewport: { width: number; height: number }): Tile[] {
  const tileCss = TILE * scale / level;
  const localX = position.x - layout.left;
  const localY = position.y - layout.top;
  const pageWidth = layout.width * scale;
  const pageHeight = layout.height * scale;
  const x0 = Math.max(0, Math.floor((localX - tileCss) / tileCss));
  const y0 = Math.max(0, Math.floor((localY - tileCss) / tileCss));
  const x1 = Math.min(Math.ceil(layout.width * level / TILE) - 1,
    Math.ceil((localX + viewport.width + tileCss) / tileCss));
  const y1 = Math.min(Math.ceil(layout.height * level / TILE) - 1,
    Math.ceil((localY + viewport.height + tileCss) / tileCss));
  const tiles: Tile[] = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const src = `${base}/tile?page=${layout.index}&level=${level}&x=${x}&y=${y}`;
    tiles.push({ key: src, src, left: x * tileCss, top: y * tileCss,
      width: Math.min(tileCss, pageWidth - x * tileCss),
      height: Math.min(tileCss, pageHeight - y * tileCss) });
  }
  return tiles;
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
  const touch = useRef<{ distance: number; zoom: number } | null>(null);
  const readyRef = useRef(false);
  const scrollPageRef = useRef<number | null>(null);
  const lastExternalPage = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const layouts = useMemo(() => {
    let top = 0;
    const raw = pages.map((size, index) => {
      const fit = Math.min((viewport.width - 24) / Math.max(1, size.width), 2);
      const scale = fit * zoom;
      const layout = { ...size, index, top, left: 0, scale };
      top += size.height * scale + GAP;
      return layout;
    });
    const contentWidth = Math.max(viewport.width, ...raw.map((item) => item.width * item.scale));
    return { contentWidth, height: Math.max(0, top - GAP), pages: raw.map((item) => ({
      ...item, left: (contentWidth - item.width * item.scale) / 2,
    })) };
  }, [pages, viewport.width, zoom]);
  const page = Math.max(1, Math.min(pages.length || 1, props.page));

  useEffect(() => {
    if (!base) return;
    const ctrl = new AbortController();
    setPages([]);
    readyRef.current = false;
    fetch(base + "/meta", { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error("Remote renderer is unavailable"); return r.json(); })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setPages(data.pages || []);
        props.onDocumentLoaded?.(data.pageCount);
      })
      .catch((e) => { if (!ctrl.signal.aborted) setError(String(e.message || e)); });
    return () => ctrl.abort();
  }, [base]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length]);

  useEffect(() => {
    if (lastExternalPage.current === page) return;
    lastExternalPage.current = page;
    const target = layouts.pages[page - 1];
    if (!target || !scroller.current) return;
    if (scrollPageRef.current === target.index) return;
    scroller.current.scrollTo({ top: target.top, behavior: "auto" });
  }, [props.page, layouts.pages]);

  const visibleTiles = useMemo(() => {
    if (!base || !layouts.pages.length) return [];
    const start = position.y - viewport.height;
    const end = position.y + viewport.height * 2;
    return layouts.pages.flatMap((layout) => {
      const top = layout.top;
      const bottom = top + layout.height * layout.scale;
      if (bottom < start || top > end) return [];
      return makeTiles(base, layout, levelFor(layout.scale), layout.scale, position, viewport)
        .map((tile) => ({ ...tile, pageIndex: layout.index, pageLeft: layout.left, pageTop: layout.top }));
    }).slice(0, 96);
  }, [base, layouts, position, viewport, zoom]);

  function updatePosition(el: HTMLDivElement) {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setPosition({ x: el.scrollLeft, y: el.scrollTop });
      const center = el.scrollTop + el.clientHeight / 2;
      const current = layouts.pages.find((item) => center >= item.top && center < item.top + item.height * item.scale);
      if (current && current.index + 1 !== page) {
        scrollPageRef.current = current.index;
        props.onActivePageChange?.(current.index + 1);
      }
    });
  }

  function changeZoom(next: number) {
    const el = scroller.current;
    if (!el) return;
    const bounded = Math.max(0.25, Math.min(12, next));
    const ratio = bounded / zoom;
    const x = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    const y = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    lastExternalPage.current = page;
    setZoom(bounded);
    requestAnimationFrame(() => { el.scrollLeft = x; el.scrollTop = y; });
  }

  const toolStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #94a3b8" };
  if (!base) return <div role="status">Open a stored server document to use lightweight viewing.</div>;
  return <div className="h-full w-full" style={{ display: "flex", flexDirection: "column", minHeight: 0 }} data-tpdf-remote-viewer="true">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, padding: 6, background: "#f1f5f9", color: "#0f172a" }}>
      <button style={toolStyle} onClick={() => props.onActivePageChange?.(Math.max(1, page - 1))} disabled={!pages.length || page <= 1} aria-label="Previous page">‹</button>
      <span style={{ fontSize: 13 }}>Page {page}/{pages.length || "…"}</span>
      <button style={toolStyle} onClick={() => props.onActivePageChange?.(Math.min(pages.length, page + 1))} disabled={!pages.length || page >= pages.length} aria-label="Next page">›</button>
      <button style={toolStyle} onClick={() => changeZoom(zoom / 1.5)} aria-label="Zoom out">−</button>
      <span style={{ fontSize: 12 }}>{Math.round(zoom * 100)}%</span>
      <button style={toolStyle} onClick={() => changeZoom(zoom * 1.5)} aria-label="Zoom in">+</button>
    </div>
    {error ? <div role="alert" style={{ color: "#b91c1c", padding: 12 }}>{error}</div> : null}
    <div ref={scroller} style={{ flex: 1, overflow: "auto", minHeight: 0, background: "#cbd5e1", touchAction: "pan-x pan-y" }}
      onScroll={(e) => updatePosition(e.currentTarget)}
      onTouchStart={(e) => {
        if (e.touches.length !== 2) return;
        const [a, b] = [e.touches[0], e.touches[1]];
        touch.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
      }}
      onTouchMove={(e) => {
        if (e.touches.length !== 2 || !touch.current) return;
        const [a, b] = [e.touches[0], e.touches[1]];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (Math.abs(distance - touch.current.distance) > 10) changeZoom(touch.current.zoom * distance / touch.current.distance);
      }}
      onTouchEnd={() => { touch.current = null; }}>
      <div style={{ position: "relative", width: layouts.contentWidth, height: layouts.height, minWidth: "100%" }}>
        {layouts.pages.map((layout) => <div key={layout.index} style={{ position: "absolute", left: layout.left, top: layout.top,
          width: layout.width * layout.scale, height: layout.height * layout.scale, background: "white", overflow: "hidden", boxShadow: "0 2px 7px #0003" }} />)}
        {visibleTiles.map((tile) => <img key={tile.key} src={tile.src} alt="" draggable={false}
          onLoad={() => { if (!readyRef.current) { readyRef.current = true; props.onViewerReady?.(); } }}
          style={{ position: "absolute", left: tile.pageLeft + tile.left, top: tile.pageTop + tile.top,
            width: tile.width, height: tile.height, objectFit: "fill", userSelect: "none", pointerEvents: "none" }} />)}
      </div>
    </div>
    <div style={{ padding: "3px 10px", fontSize: 11, background: "#f1f5f9", color: "#475569" }}>
      Lightweight remote mode · Original vector PDF preserved on server
    </div>
  </div>;
}
