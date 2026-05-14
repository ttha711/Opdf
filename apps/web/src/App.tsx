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
  const [activeTool, setActiveTool] = useState<"select" | "highlight" | "note" | "shape" | "signature" | "redact">("select");
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

  async function loadBrowserFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setDocBytes(bytes);
    setPage(1);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
  }

  async function openFile() {
    if (!hasDesktopBridge) {
      const input = fileInputRef.current;
      if (!input) {
        setViewerError("File picker is unavailable.");
        return;
      }
      input.value = "";
      try {
        if (typeof input.showPicker === "function") {
          input.showPicker();
        } else {
          input.click();
        }
      } catch (error) {
        setViewerError("Cannot open file picker. Please click 'Choose File' directly.");
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
    await loadBrowserFile(file);
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
    const tempId = crypto.randomUUID();
    const optimistic: Annotation = {
      id: tempId,
      page: pageNumber,
      kind: "highlight",
      payload: { color: "rgba(250, 204, 21, 0.4)", ...rect },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    setAnnotations((prev) => [...prev, optimistic]);
    
    try {
      const created = await bridge.createAnnotation(fileName, {
        page: pageNumber,
        kind: "highlight",
        payload: { color: "#facc15", ...rect },
      });
      setAnnotations((prev) => prev.map(a => a.id === tempId ? created : a));
    } catch (err) {
      setAnnotations((prev) => prev.filter(a => a.id !== tempId));
      setViewerError("Failed to save highlight");
    }
  }

  async function createToolAnnotation(kind: "note" | "shape" | "signature" | "redact", pageNumber: number, rect: { x: number; y: number; width: number; height: number }) {
    if (!fileName) return;
    const tempId = crypto.randomUUID();
    const payload =
      kind === "note"
        ? { text: noteText || "New note", x: rect.x, y: rect.y }
          : kind === "shape"
            ? { shape: "rectangle", stroke: "#ef4444", ...rect }
            : kind === "redact"
              ? { shape: "rectangle", ...rect }
              : { signer: signatureStyle, ...rect };

    const optimistic: Annotation = {
      id: tempId,
      page: pageNumber,
      kind,
      payload,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setAnnotations((prev) => [...prev, optimistic]);

    try {
      const created = await bridge.createAnnotation(fileName, { page: pageNumber, kind, payload });
      setAnnotations((prev) => prev.map(a => a.id === tempId ? created : a));
    } catch (err) {
      setAnnotations((prev) => prev.filter(a => a.id !== tempId));
      setViewerError(`Failed to save ${kind}`);
    }
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

  async function exportPdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      const flattenedBytes = await bridge.exportFlattened(docBytes, annotations);
      if (hasDesktopBridge) {
        await bridge.saveDocumentAs(flattenedBytes);
      } else {
        const blob = new Blob([flattenedBytes as unknown as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `exported-${fileName}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch(err) {
      console.error(err);
      setViewerError("Failed to export PDF.");
    }
  }

  async function compressDocument() {
    if (!docBytes || !fileName) return;
    try {
      setViewerError("Compressing... (this may take a few seconds)");
      const compressed = await bridge.compressPdf(docBytes);
      setDocBytes(compressed);
      setViewerError("Compression complete!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Compression failed: " + err);
    }
  }

  async function addWatermark() {
    if (!docBytes) return;
    const text = prompt("Enter watermark text:", "CONFIDENTIAL");
    if (!text) return;
    try {
      const watermarked = await bridge.watermarkPdf(docBytes, text);
      setDocBytes(watermarked);
    } catch (err) {
      setViewerError("Watermark failed: " + err);
    }
  }

  async function mergeDocuments() {
    if (!hasDesktopBridge || !docBytes) {
      alert("Merge currently requires the Desktop App for native file selection.");
      return;
    }
    alert("Select a second PDF to append to the current one.");
    const file2 = await bridge.pickAndOpenDocument();
    if (!file2) return;
    try {
      const merged = await bridge.mergePdfs([docBytes, file2.bytes]);
      setDocBytes(merged);
      setPage(1);
    } catch (err) {
      setViewerError("Merge failed: " + err);
    }
  }

  async function splitDocument() {
    if (!docBytes || !fileName) return;
    const pageStr = prompt("Enter the exact page number you want to extract as a standalone PDF:", "1");
    if (!pageStr) return;
    const p = parseInt(pageStr, 10);
    if (isNaN(p) || p < 1 || p > totalPages) return;
    try {
      const splitDocs = await bridge.splitPdf(docBytes, [p - 1]);
      if (splitDocs.length) {
        if (hasDesktopBridge) {
          await bridge.saveDocumentAs(splitDocs[0]);
        } else {
          const blob = new Blob([splitDocs[0] as unknown as BlobPart], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `page-${p}-${fileName}`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      setViewerError("Split failed");
    }
  }

  async function convertToImages() {
    if (!fileName || thumbnails.length === 0) {
      alert("Please wait for all pages to finish rendering before converting.");
      return;
    }
    try {
      setViewerError("Zipping images...");
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};
      
      for (const thumb of thumbnails) {
        const res = await fetch(thumb.url);
        const buf = await res.arrayBuffer();
        zipData[`page-${thumb.page}.jpg`] = new Uint8Array(buf);
      }
      
      const zipped = zipSync(zipData);
      const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-images.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setViewerError(null);
    } catch (err) {
      setViewerError("Failed to convert: " + err);
    }
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
    if (activeTool === "shape" || activeTool === "redact") {
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
            <ToolIconButton label="Export PDF" disabled={!hasDocument} onClick={exportPdf}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </ToolIconButton>
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
            <ToolIconButton label="Redact" active={activeTool === "redact"} disabled={!hasDocument} onClick={() => setActiveTool("redact")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" /></svg>
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

        <div className="toolbar-group">
          <span className="tool-group-title">Advanced</span>
          <div className="right-actions">
            <ToolIconButton label="Compress" disabled={!hasDocument} onClick={compressDocument}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 11-2-2-2 2M12 9v8M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
            </ToolIconButton>
            <ToolIconButton label="Watermark" disabled={!hasDocument} onClick={addWatermark}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </ToolIconButton>
            <ToolIconButton label="Split" disabled={!hasDocument} onClick={splitDocument}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M4 6h16M4 18h16" /></svg>
            </ToolIconButton>
            <ToolIconButton label="Merge" onClick={mergeDocuments}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            </ToolIconButton>
            <ToolIconButton label="To Images" disabled={!hasDocument} onClick={convertToImages}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            </ToolIconButton>
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
            redactMode={activeTool === "redact"}
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
