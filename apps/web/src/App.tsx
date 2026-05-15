import { useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, OcrJob } from "@opdf/core";
import { PdfViewer } from "./components/PdfViewer";
import { AppHeader } from "./components/AppHeader";
import { ThumbnailPanel } from "./components/ThumbnailPanel";
import { RightInfoPanel } from "./components/RightInfoPanel";
import { OverlayEditors } from "./components/OverlayEditors";
import { StatusBar } from "./components/StatusBar";
import { useOpdfBridge } from "./hooks/useOpdfBridge";
import { useAnnotationActions } from "./hooks/useAnnotationActions";
import { useDocumentActions } from "./hooks/useDocumentActions";
import { useViewerControls } from "./hooks/useViewerControls";
import { useAppMenus } from "./hooks/useAppMenus";
import { useDocumentLifecycle } from "./hooks/useDocumentLifecycle";
import type { ActiveTool, PendingNote, ViewMode, ZoomPreset } from "./lib/app-types";
import type { DocumentTool } from "./lib/document-tools";
import { savePdfBytes, saveWebState, loadFullDraft } from "./lib/web-storage";
import "./types/opdf";

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
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [zoomPreset, setZoomPreset] = useState<ZoomPreset>("actual");
  const [pendingNote, setPendingNote] = useState<PendingNote>(null);
  const [noteText, setNoteText] = useState("New note");
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureStyle, setSignatureStyle] = useState("User Signature");
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("continuous");
  const [documentTool, setDocumentTool] = useState<DocumentTool>("delete-pages");
  const [transitionTick, setTransitionTick] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<"next" | "prev">("next");
  const [thumbnails, setThumbnails] = useState<Array<{ page: number; url: string; blob: Blob }>>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showFindBar, setShowFindBar] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("opdf-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const lastWheelFlipAtRef = useRef(0);
  const hasDocument = useMemo(() => Boolean(fileName && docBytes), [fileName, docBytes]);
  const highlightMode = activeTool === "highlight";
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);

  const { openFile, onSelectLocalFile, replaceDocumentBytes, closeDocument } = useDocumentLifecycle({
    bridge,
    hasDesktopBridge,
    fileInputRef,
    page,
    setFileName,
    setDocBytes,
    setPage,
    setTotalPages,
    setViewerError,
    setThumbnails,
    setAnnotations,
    setTransitionTick,
  });

  const { addHighlight, createToolAnnotation, undoAnnotations, redoAnnotations, removeAnnotation, updateAnnotation } = useAnnotationActions({
    bridge,
    fileName,
    noteText,
    signatureStyle,
    setAnnotations,
    setViewerError,
  });

  const { runOcr, exportPdf, compressDocument, addWatermark, mergeDocuments, splitDocument, convertToImages, runDocumentTool } = useDocumentActions({
    bridge,
    hasDocument,
    hasDesktopBridge,
    fileName,
    docBytes,
    page,
    totalPages,
    thumbnails,
    annotations,
    documentTool,
    replaceDocumentBytes,
    setDocBytes,
    setPage,
    setOcrJobs,
    setViewerError,
  });

  function onLoaded(pages: number) {
    setTotalPages(pages);
    setPage((p) => Math.min(Math.max(1, p), Math.max(1, pages)));
  }

  function onSearchResult(found: boolean, message: string) {
    setSearchResult(found ? `Found: ${message}` : `Not found: ${message}`);
  }

  const {
    goPrevPage,
    goNextPage,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    onPageToolAction,
    onViewerWheel,
    onActivePageChange,
  } = useViewerControls({
    hasDocument,
    highlightMode,
    viewMode,
    totalPages,
    setTransitionDirection,
    setTransitionTick,
    setPage,
    setZoomPreset,
    setScale,
    setRotation,
    lastWheelFlipAtRef,
    activeTool,
    addHighlight,
    createToolAnnotation,
    setPendingNote,
    setShowSignModal,
  });

  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (name: string) => setOpenMenu(prev => prev === name ? null : name);

  const { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems } = useAppMenus({
    hasDocument,
    viewMode,
    setViewMode,
    setActiveTool,
    openFile,
    closeDocument,
    exportPdf,
    compressDocument,
    addWatermark,
    mergeDocuments,
    splitDocument,
    convertToImages,
    undoAnnotations,
    redoAnnotations,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    runOcr,
    setDocumentTool,
    runDocumentTool,
  });

  // ── Web Persistence ───────────────────────────────────────────────────
  useEffect(() => {
    if (hasDesktopBridge) return;
    async function initDraft() {
      const draft = await loadFullDraft();
      if (draft && draft.bytes && draft.state) {
        setFileName(draft.state.fileName);
        setDocBytes(draft.bytes);
        setAnnotations(draft.state.annotations || []);
        setPage(draft.state.page || 1);
        if (draft.state.thumbnails && draft.state.thumbnails.length > 0) {
          const restored = draft.state.thumbnails.map(t => ({
            ...t,
            url: URL.createObjectURL(t.blob)
          }));
          setThumbnails(restored);
        }
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(draft.state.fileName, draft.state.annotations || []);
        }
      }
    }
    void initDraft();
  }, [bridge, hasDesktopBridge]);

  useEffect(() => {
    if (hasDesktopBridge || !docBytes) return;
    void savePdfBytes(docBytes);
  }, [hasDesktopBridge, docBytes]);

  useEffect(() => {
    if (hasDesktopBridge || !hasDocument) return;
    const timeout = setTimeout(() => {
      saveWebState({
        fileName,
        annotations,
        thumbnails,
        page,
      });
    }, 1500);
    return () => clearTimeout(timeout);
  }, [hasDesktopBridge, hasDocument, fileName, annotations, thumbnails, page]);

  // ── Theme Effect ──────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("opdf-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");

  // ── Global keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (ctrl && e.key === "o") { e.preventDefault(); openFile(); return; }
      if (ctrl && e.key === "s") { e.preventDefault(); exportPdf(); return; }
      if (ctrl && e.key === "z") { e.preventDefault(); undoAnnotations(); return; }
      if (ctrl && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault(); redoAnnotations(); return;
      }
      if (ctrl && e.key === "f") {
        e.preventDefault();
        setShowFindBar(prev => {
          if (!prev) setTimeout(() => findInputRef.current?.focus(), 50);
          return !prev;
        });
        return;
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleTheme();
        return;
      }

      if (inInput) return;
      if (e.key === "+" || e.key === "=") { zoomIn(); return; }
      if (e.key === "-") { zoomOut(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrevPage(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNextPage(); return; }
      if (e.key === "Escape") { setShowFindBar(false); setOpenMenu(null); }

      // Acrobat single-key shortcuts
      if (e.key.toLowerCase() === "v") { setActiveTool("select"); return; }
      if (e.key.toLowerCase() === "i") { setActiveTool("highlight"); return; }
      if (e.key.toLowerCase() === "t") { setActiveTool("note"); return; }
      if (e.key.toLowerCase() === "r") { setActiveTool("redact"); return; }
      if (e.key.toLowerCase() === "s") { setActiveTool("signature"); return; }
      if (e.key.toLowerCase() === "q") { setActiveTool("shape"); return; }
      if (e.key.toLowerCase() === "m") { setActiveTool("measure"); return; }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFile, exportPdf, undoAnnotations, redoAnnotations, zoomIn, zoomOut, goPrevPage, goNextPage, theme]);

  // ── Drag & drop PDF onto viewer ────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(
      f => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setDocBytes(bytes);
    setPage(1);
    setViewerError(null);
    setThumbnails([]);
    setAnnotations([]);
  }

  return (
    <div className="app acrobat-shell">
      <AppHeader
        fileInputRef={fileInputRef}
        hasDesktopBridge={hasDesktopBridge}
        hasDocument={hasDocument}
        fileName={fileName}
        openFile={openFile}
        closeDocument={closeDocument}
        fileMenuItems={fileMenuItems}
        editMenuItems={editMenuItems}
        viewMenuItems={viewMenuItems}
        toolsMenuItems={toolsMenuItems}
        openMenu={openMenu}
        toggleMenu={toggleMenu}
        closeMenu={closeMenu}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        exportPdf={exportPdf}
        page={page}
        totalPages={totalPages}
        setPage={setPage}
        goPrevPage={goPrevPage}
        goNextPage={goNextPage}
        zoomOut={zoomOut}
        zoomIn={zoomIn}
        resetZoom={resetZoom}
        scale={scale}
        zoomPreset={zoomPreset}
        applyZoomPreset={applyZoomPreset}
        pageSearch={pageSearch}
        setPageSearch={setPageSearch}
        viewMode={viewMode}
        setViewMode={setViewMode}
        undoAnnotations={undoAnnotations}
        redoAnnotations={redoAnnotations}
        runOcr={runOcr}
        rotateLeft={rotateLeft}
        rotateRight={rotateRight}
        compressDocument={compressDocument}
        addWatermark={addWatermark}
        splitDocument={splitDocument}
        mergeDocuments={mergeDocuments}
        convertToImages={convertToImages}
        documentTool={documentTool}
        setDocumentTool={setDocumentTool}
        runDocumentTool={runDocumentTool}
        onSelectLocalFile={onSelectLocalFile}
        showFindBar={showFindBar}
        onToggleFindBar={() => setShowFindBar(p => !p)}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      <main className="workspace acrobat-body">
        <ThumbnailPanel thumbnails={thumbnails} page={page} hasDocument={hasDocument} onSelectPage={setPage} />

        <section
          className="viewer-area"
          tabIndex={0}
          onWheel={onViewerWheel}
          onDragOver={onDragOver}
          onDrop={onDrop}
          aria-label="PDF viewer area"
        >
          {/* Floating find bar — Ctrl+F */}
          {showFindBar && (
            <div className="find-bar">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                ref={findInputRef}
                className="find-bar-input"
                placeholder="Find in document…"
                value={pageSearch}
                onChange={e => setPageSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") { setShowFindBar(false); setPageSearch(""); }
                }}
              />
              {searchResult && <span className="find-bar-result">{searchResult}</span>}
              <button
                className="find-bar-close"
                onClick={() => { setShowFindBar(false); setPageSearch(""); }}
                title="Close (Esc)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}
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
            measureMode={activeTool === "measure"}
            activeTool={activeTool}
            searchText={pageSearch}
            onPageToolAction={onPageToolAction}
            onDocumentLoaded={onLoaded}
            onSearchResult={onSearchResult}
            onError={setViewerError}
            onActivePageChange={onActivePageChange}
            onThumbsLoaded={setThumbnails}
            initialThumbnails={thumbnails}
            onAnnotationUpdated={updateAnnotation}
            onAnnotationDeleted={removeAnnotation}
          />
        </section>
        <OverlayEditors
          pendingNote={pendingNote}
          activeTool={activeTool}
          noteText={noteText}
          setNoteText={setNoteText}
          signatureStyle={signatureStyle}
          setSignatureStyle={setSignatureStyle}
          showSignModal={showSignModal}
          setShowSignModal={setShowSignModal}
          setPendingNote={setPendingNote}
          createToolAnnotation={createToolAnnotation}
        />

        <RightInfoPanel
          hasDocument={hasDocument}
          fileName={fileName}
          totalPages={totalPages}
          page={page}
          scale={scale}
          viewerError={viewerError}
          searchResult={searchResult}
          annotations={annotations}
          ocrJobs={ocrJobs}
          onRemoveAnnotation={removeAnnotation}
        />
      </main>
      <StatusBar hasDocument={hasDocument} page={page} totalPages={totalPages} viewerError={viewerError} scale={scale} viewMode={viewMode} activeTool={activeTool} />
    </div>
  );
}
