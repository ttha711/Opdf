import { useEffect, useMemo, useRef, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { getServerDocumentUrl } from "../lib/documentSource";
import { RemoteTileLoader } from "../lib/remoteTileLoader";

type PageSize = { width: number; height: number };
type PageLayout = PageSize & { index: number; top: number; left: number; scale: number };
type Tile = { key: string; src: string; left: number; top: number; width: number; height: number };
const TILE = 512;
const GAP = 18;
const MAX_MOUNTED_TILES = 96;
const OVERSCAN_VIEWPORT = 0.35;
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

export function RemotePdfViewer(props: PdfViewerProps & { onRequestFull?: () => void }) {
  const source = getServerDocumentUrl(props.sourceIdentity || "");
  const base = source ? source.split("?")[0] + "/render" : null;
  const [pages, setPages] = useState<PageSize[]>([]);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [, refreshTiles] = useState(0);
  const tileLoaderRef = useRef<RemoteTileLoader | null>(null);
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
    setError("");
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
    const target = layouts.pages[page - 1];
    if (!target || !scroller.current) return;
    lastExternalPage.current = page;
    if (scrollPageRef.current === target.index) return;
    scroller.current.scrollTo({ top: target.top, behavior: "auto" });
  }, [props.page, layouts.pages]);

  const visibleTiles = useMemo(() => {
    if (!base || !layouts.pages.length) return [];
    const start = position.y - viewport.height * OVERSCAN_VIEWPORT;
    const end = position.y + viewport.height * (1 + OVERSCAN_VIEWPORT);
    const centerX = position.x + viewport.width / 2;
    const centerY = position.y + viewport.height / 2;
    const tiles = layouts.pages.flatMap((layout) => {
      const bottom = layout.top + layout.height * layout.scale;
      if (bottom < start || layout.top > end) return [];
      return makeTiles(base, layout, levelFor(layout.scale), layout.scale, position, viewport)
        .map((tile) => {
          const left = layout.left + tile.left;
          const top = layout.top + tile.top;
          const inViewport = left < position.x + viewport.width && left + tile.width > position.x &&
            top < position.y + viewport.height && top + tile.height > position.y;
          const distance = Math.abs(left + tile.width / 2 - centerX) +
            Math.abs(top + tile.height / 2 - centerY);
          return { ...tile, pageIndex: layout.index, pageLeft: layout.left,
            pageTop: layout.top, inViewport, distance };
        });
    });
    // The old page-order slice could queue overscan ahead of the visible sheet.
    return tiles.sort((a, b) => Number(b.inViewport) - Number(a.inViewport) ||
      a.distance - b.distance).slice(0, MAX_MOUNTED_TILES);
  }, [base, layouts, position, viewport]);

  // Use fetch/AbortController instead of direct <img src=tileEndpoint>.
  // Chromium may keep an image GET alive after its element leaves the DOM.
  useEffect(() => {
    const loader = new RemoteTileLoader(
      () => refreshTiles((count) => count + 1),
      (message) => setError(message),
      { concurrency: 6 },
    );
    tileLoaderRef.current = loader;
    return () => {
      loader.close();
      if (tileLoaderRef.current === loader) tileLoaderRef.current = null;
    };
  }, [base]);

  useEffect(() => {
    tileLoaderRef.current?.update(visibleTiles.map((tile) => tile.src));
  }, [visibleTiles]);

  function updatePosition(el: HTMLDivElement) {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setPosition({ x: el.scrollLeft, y: el.scrollTop });
      const center = el.scrollTop + el.clientHeight / 2;
      const current = layouts.pages.find((item) => center >= item.top && center < item.top + item.height * item.scale);
      if (current && current.index + 1 !== page) {
        lastExternalPage.current = current.index + 1;
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
    {error ? <div role="alert" style={{ color: "#b91c1c", padding: 12 }}>{error} <button type="button" onClick={props.onRequestFull}>Open full PDF instead</button></div> : null}
    <div ref={scroller} data-tpdf-remote-scroller="true" style={{ flex: 1, overflow: "auto", minHeight: 0, background: "#cbd5e1", touchAction: "pan-x pan-y" }}
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
        {layouts.pages.map((layout) => <div key={layout.index} data-tpdf-remote-page-index={layout.index} style={{ position: "absolute", left: layout.left, top: layout.top,
          width: layout.width * layout.scale, height: layout.height * layout.scale, background: "white", overflow: "hidden", boxShadow: "0 2px 7px #0003" }} />)}
        {visibleTiles.map((tile) => <img key={tile.key} src={tileLoaderRef.current?.get(tile.src)}
          data-tpdf-tile-url={tile.src} data-tpdf-tile-page={tile.pageIndex}
          data-tpdf-tile-level={new URL(tile.src, window.location.href).searchParams.get("level")}
          alt="" draggable={false}
          onError={() => setError("A PDF tile could not be rendered.")}
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
