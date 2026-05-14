import { useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, OcrJob } from "@opdf/core";
import { PdfViewer } from "./components/PdfViewer";
import { useOpdfBridge } from "./hooks/useOpdfBridge";
import "./types/opdf";

function ToolIconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`icon-btn ${active ? "active-tool" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function App() {
  const bridge = useOpdfBridge();
  const [fileName, setFileName] = useState("");
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [ocrJobs, setOcrJobs] = useState<OcrJob[]>([]);
  const [pageSearch, setPageSearch] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const [activeTool, setActiveTool] = useState<"select" | "highlight" | "note" | "shape" | "signature">("select");
  const [zoomPreset, setZoomPreset] = useState<"actual" | "fit-width" | "fit-page">("actual");
  const [pendingNote, setPendingNote] = useState<{ page: number; rect: { x: number; y: number; width: number; height: number } } | null>(null);
  const [noteText, setNoteText] = useState("New note");
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureStyle, setSignatureStyle] = useState("User Signature");
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"continuous" | "page">("continuous");
  const [transitionTick, setTransitionTick] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<"next" | "prev">("next");
  const [thumbnails, setThumbnails] = useState<Array<{ page: number; url: string }>>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastWheelFlipAtRef = useRef(0);
  const hasDocument = useMemo(() => Boolean(fileName && docBytes), [fileName, docBytes]);
  const highlightMode = activeTool === "highlight";
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);

  async function openFile() {
    if (!hasDesktopBridge) {
      const input = fileInputRef.current;
      if (!input) return;
      input.value = "";
      try {
        input.click();
      } catch {
        if (typeof input.showPicker === "function") {
          input.showPicker();
        }
      }
      return;
    }

    try {
      const result = await bridge.pickAndOpenDocument();
      if (result) {
        setFileName(result.filePath);
        setDocBytes(result.bytes);
        setPage(1);
        setViewerError(null);
        setThumbnails([]);
        await bridge.pushRecent(result.filePath);
        setAnnotations(await bridge.listAnnotations(result.filePath));
        return;
      }
    } catch {}
  }

  async function onSelectLocalFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setDocBytes(bytes);
    setPage(1);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openPath = params.get("open");
    if (!openPath || hasDesktopBridge) return;
    const devOpenPath = openPath;

    let cancelled = false;
    async function loadDevFile() {
      try {
        const response = await fetch(`/@fs/${devOpenPath.replaceAll("\\", "/")}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setFileName(devOpenPath.split(/[\\/]/).pop() || devOpenPath);
        setDocBytes(bytes);
        setPage(1);
        setViewerError(null);
        setThumbnails([]);
        setAnnotations([]);
      } catch (error) {
        if (!cancelled) setViewerError(error instanceof Error ? error.message : "Unable to open file");
      }
    }

    void loadDevFile();
    return () => {
      cancelled = true;
    };
  }, [hasDesktopBridge]);

  async function addHighlight(pageNumber: number, rect: { x: number; y: number; width: number; height: number }) {
    if (!fileName) return;
    const created = await bridge.createAnnotation(fileName, {
      page: pageNumber,
      kind: "highlight",
      payload: { color: "#facc15", ...rect },
    });
    setAnnotations((prev) => [...prev, created]);
  }

  async function createToolAnnotation(kind: "note" | "shape" | "signature", pageNumber: number, rect: { x: number; y: number; width: number; height: number }) {
    if (!fileName) return;
    const payload =
      kind === "note"
        ? { text: noteText || "New note", x: rect.x, y: rect.y }
        : kind === "shape"
          ? { shape: "rectangle", stroke: "#ef4444", ...rect }
          : { signer: signatureStyle, ...rect };
    const created = await bridge.createAnnotation(fileName, { page: pageNumber, kind, payload });
    setAnnotations((prev) => [...prev, created]);
  }

  async function undoAnnotations() {
    if (!fileName) return;
    setAnnotations(await bridge.undoAnnotation(fileName));
  }

  async function redoAnnotations() {
    if (!fileName) return;
    setAnnotations(await bridge.redoAnnotation(fileName));
  }

  async function removeAnnotation(id: string) {
    if (!fileName) return;
    await bridge.deleteAnnotation(fileName, id);
    setAnnotations(await bridge.listAnnotations(fileName));
  }

  async function runOcr() {
    if (!fileName) return;
    const job = await bridge.enqueueOcr(fileName, "eng+vie");
    await bridge.runOcr(job.id);
    setOcrJobs(await bridge.listOcrJobs());
  }

  function onLoaded(pages: number) {
    setTotalPages(pages);
    setPage((p) => Math.min(Math.max(1, p), Math.max(1, pages)));
  }

  function onSearchResult(found: boolean, message: string) {
    setSearchResult(found ? `Found: ${message}` : `Not found: ${message}`);
  }

  function goPrevPage() {
    setTransitionDirection("prev");
    setTransitionTick((n) => n + 1);
    setPage((p) => Math.max(1, p - 1));
  }

  function goNextPage() {
    setTransitionDirection("next");
    setTransitionTick((n) => n + 1);
    setPage((p) => (totalPages > 0 ? Math.min(totalPages, p + 1) : p + 1));
  }

  function zoomIn() {
    setZoomPreset("actual");
    setScale((s) => Math.min(3, Number((s + 0.1).toFixed(2))));
  }

  function zoomOut() {
    setZoomPreset("actual");
    setScale((s) => Math.max(0.5, Number((s - 0.1).toFixed(2))));
  }

  function resetZoom() {
    setZoomPreset("actual");
    setScale(1);
  }

  function applyZoomPreset(preset: "actual" | "fit-width" | "fit-page") {
    setZoomPreset(preset);
    if (preset === "actual") setScale(1);
    if (preset === "fit-width") setScale(1.35);
    if (preset === "fit-page") setScale(0.85);
  }

  function rotateLeft() {
    setRotation((r) => (r - 90 + 360) % 360);
  }

  function rotateRight() {
    setRotation((r) => (r + 90) % 360);
  }

  async function onPageToolAction(pageNumber: number, rect: { x: number; y: number; width: number; height: number }) {
    if (!hasDocument) return;
    if (activeTool === "highlight") return addHighlight(pageNumber, rect);
    if (activeTool === "note") {
      setPendingNote({ page: pageNumber, rect });
      return;
    }
    if (activeTool === "signature") {
      setPendingNote({ page: pageNumber, rect });
      setShowSignModal(true);
      return;
    }
    if (activeTool === "shape") {
      return createToolAnnotation(activeTool, pageNumber, rect);
    }
  }

  function onViewerWheel(event: React.WheelEvent<HTMLElement>) {
    if (!hasDocument || highlightMode || viewMode === "continuous") return;
    const now = Date.now();
    if (now - lastWheelFlipAtRef.current < 180 || Math.abs(event.deltaY) < 10) return;
    if (event.deltaY > 0) goNextPage();
    else goPrevPage();
    lastWheelFlipAtRef.current = now;
  }

  function onActivePageChange(nextPage: number) {
    setPage((p) => (p === nextPage ? p : nextPage));
  }

  return (
    <div className="app acrobat-shell">
      <header className="acrobat-topbar multi-row">
        <div className="toolbar-group">
          <span className="tool-group-title">Select</span>
          <div className="left-actions">
            <ToolIconButton label="Select Tool" active={activeTool === "select"} onClick={() => setActiveTool("select")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 3 6 15 2-7 7-2z" /></svg>
            </ToolIconButton>
            <ToolIconButton label="Open File" onClick={openFile}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8h-8l-2-3H5a2 2 0 0 0-2 2z" /><path d="M12 11v6" /><path d="M9 14h6" /></svg>
            </ToolIconButton>
            {!hasDesktopBridge ? (
              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept="application/pdf"
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                onChange={onSelectLocalFile}
              />
            ) : null}
          </div>
        </div>

        <div className="toolbar-group">
          <span className="tool-group-title">Comment</span>
          <div className="left-actions">
            <ToolIconButton label="Highlight" active={activeTool === "highlight"} disabled={!hasDocument} onClick={() => setActiveTool("highlight")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 5 4 4-9 9H6v-4z" /><path d="m12 8 4 4" /></svg>
            </ToolIconButton>
            <ToolIconButton label="Note Box" active={activeTool === "note"} disabled={!hasDocument} onClick={() => setActiveTool("note")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </ToolIconButton>
          </div>
        </div>

        <div className="toolbar-group">
          <span className="tool-group-title">Organize</span>
          <div className="center-actions">
            <ToolIconButton label="Previous Page" disabled={!hasDocument} onClick={goPrevPage}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg></ToolIconButton>
            <input className="page-input" value={page} onChange={(e) => {
              const next = Number(e.target.value || 1);
              if (Number.isFinite(next)) setPage(Math.min(Math.max(1, next), Math.max(1, totalPages)));
            }} />
            <span className="of-pages">of {Math.max(totalPages, 1)}</span>
            <ToolIconButton label="Next Page" disabled={!hasDocument || (totalPages > 0 && page >= totalPages)} onClick={goNextPage}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></ToolIconButton>
            <ToolIconButton label="Zoom Out" disabled={!hasDocument} onClick={zoomOut}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /></svg></ToolIconButton>
            <button className="zoom-readout" disabled={!hasDocument} onClick={resetZoom} title="Reset Zoom" aria-label="Reset Zoom" type="button">{Math.round(scale * 100)}%</button>
            <select className="zoom-preset" value={zoomPreset} onChange={(e) => applyZoomPreset(e.target.value as "actual" | "fit-width" | "fit-page")} disabled={!hasDocument}>
              <option value="actual">Actual size</option>
              <option value="fit-width">Fit width</option>
              <option value="fit-page">Fit page</option>
            </select>
            <ToolIconButton label="Zoom In" disabled={!hasDocument} onClick={zoomIn}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6M8 11h6" /></svg></ToolIconButton>
          </div>
        </div>

        <div className="toolbar-group">
          <span className="tool-group-title">Fill & Sign</span>
          <div className="right-actions">
            <input className="search-input" placeholder="Find text" value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} />
            <ToolIconButton label={viewMode === "continuous" ? "Continuous Scroll" : "Single Page Step"} onClick={() => setViewMode((m) => (m === "continuous" ? "page" : "continuous"))}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12v4H6zM6 10h12v4H6zM6 16h12v4H6z" /></svg>
            </ToolIconButton>
            <ToolIconButton label="Rectangle" active={activeTool === "shape"} disabled={!hasDocument} onClick={() => setActiveTool("shape")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" /></svg></ToolIconButton>
            <ToolIconButton label="Signature" active={activeTool === "signature"} disabled={!hasDocument} onClick={() => setActiveTool("signature")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h16" /><path d="m6 16 8-8 3 3-8 8H6z" /></svg></ToolIconButton>
            <ToolIconButton label="Undo" disabled={!hasDocument} onClick={undoAnnotations}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5" /><path d="M20 20a8 8 0 0 0-8-8H4" /></svg></ToolIconButton>
            <ToolIconButton label="Redo" disabled={!hasDocument} onClick={redoAnnotations}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5" /><path d="M4 20a8 8 0 0 1 8-8h8" /></svg></ToolIconButton>
            <ToolIconButton label="Run OCR" disabled={!hasDocument} onClick={runOcr}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h6M7 16h4" /></svg></ToolIconButton>
            <ToolIconButton label="Rotate Left" disabled={!hasDocument} onClick={rotateLeft}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8V3h5" /><path d="M3 3a9 9 0 1 0 3 13" /></svg></ToolIconButton>
            <ToolIconButton label="Rotate Right" disabled={!hasDocument} onClick={rotateRight}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V3h-5" /><path d="M21 3a9 9 0 1 1-3 13" /></svg></ToolIconButton>
          </div>
        </div>
      </header>

      <main className="workspace acrobat-body">
        <aside className="left-panel thumbnail-panel">
          <h3>Table of Contents</h3>
          <div className="thumb-list">
            {thumbnails.map((t) => (
              <button key={t.page} className={`thumb-item ${page === t.page ? "active" : ""}`} onClick={() => setPage(t.page)}>
                <img src={t.url} className="thumb-preview-img" alt={`thumb-${t.page}`} />
                <span>{t.page}</span>
              </button>
            ))}
            {!hasDocument ? <p className="muted">Open a PDF to view thumbnails.</p> : null}
            {hasDocument && thumbnails.length === 0 ? <p className="muted">Rendering thumbnails...</p> : null}
          </div>
        </aside>

        <section className="viewer-area" tabIndex={0} onWheel={onViewerWheel} aria-label="PDF viewer area">
          <PdfViewer
            transitionTick={transitionTick}
            transitionDirection={transitionDirection}
            data={docBytes}
            page={page}
            scale={scale}
            rotation={rotation}
            viewMode={viewMode}
            annotations={annotations}
            highlightMode={highlightMode}
            shapeMode={activeTool === "shape"}
            searchText={pageSearch}
            onPageToolAction={onPageToolAction}
            onDocumentLoaded={onLoaded}
            onSearchResult={onSearchResult}
            onError={setViewerError}
            onActivePageChange={onActivePageChange}
            onThumbsLoaded={setThumbnails}
          />
        </section>
        {pendingNote && activeTool === "note" ? (
          <div className="floating-editor">
            <h4>Note text</h4>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <div className="floating-actions">
              <button onClick={() => setPendingNote(null)}>Cancel</button>
              <button onClick={async () => { await createToolAnnotation("note", pendingNote.page, pendingNote.rect); setPendingNote(null); }}>Add</button>
            </div>
          </div>
        ) : null}
        {showSignModal && pendingNote && activeTool === "signature" ? (
          <div className="modal-backdrop">
            <div className="sign-modal">
              <h4>Choose signature style</h4>
              <select value={signatureStyle} onChange={(e) => setSignatureStyle(e.target.value)}>
                <option>User Signature</option>
                <option>U. Signature</option>
                <option>Approved by User</option>
              </select>
              <div className="floating-actions">
                <button onClick={() => { setShowSignModal(false); setPendingNote(null); }}>Cancel</button>
                <button onClick={async () => { await createToolAnnotation("signature", pendingNote.page, pendingNote.rect); setShowSignModal(false); setPendingNote(null); }}>Place</button>
              </div>
            </div>
          </div>
        ) : null}

        <aside className="left-panel info-panel">
          <section className="panel-card">
            <h3>Document</h3>
            <p className="mono">{fileName || "No file selected"}</p>
            <p>Pages: {totalPages || 0}</p>
            <p>{searchResult || "Search result will show here"}</p>
            {viewerError ? <p className="error-text">Render error: {viewerError}</p> : null}
          </section>
          <section className="panel-card">
            <h3>Annotations ({annotations.length})</h3>
            <ul className="list">
              {annotations.map((a) => (
                <li key={a.id}><span>{a.kind} @ p{a.page}</span><button onClick={() => removeAnnotation(a.id)}>Delete</button></li>
              ))}
            </ul>
          </section>
          <section className="panel-card">
            <h3>OCR Jobs</h3>
            <ul className="list">
              {ocrJobs.map((j) => (<li key={j.id}>{j.status} ({j.progress}%)</li>))}
              {ocrJobs.length === 0 ? <li>No OCR job yet</li> : null}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
