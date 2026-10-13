import { useCallback, useEffect, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { NativeEditEnginePreloader, type NativeEditEngine } from "./native-edit/NativeEditEnginePreloader";
import { RemotePdfViewer } from "./RemotePdfViewer";
import { getServerDocumentUrl } from "../lib/documentSource";
import { preloadPdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";
import { ViewerQuickTools } from "./ViewerQuickTools";
import { TpdfIcon } from "./TpdfIcon";
import { commitPendingNativeInlineEdit } from "../lib/nativeEditRuntime";

const LARGE_DOCUMENT_BYTES = 100 * 1024 * 1024;

// Keep the existing fast local PDFium viewer untouched on desktop.
export function AdaptivePdfViewer(props: PdfViewerProps) {
  const isEditing = props.activeTool === "edit-content";
  const serverSource = (props.sourceIdentity || "").startsWith("server://");
  const [capability, setCapability] = useState<{ source: string; available: boolean } | null>(null);
  const [hasOpenedDocument, setHasOpenedDocument] = useState(false);
  const [documentSize, setDocumentSize] = useState<{ source: string; bytes: number | null } | null>(null);
  const [nativeEditEngine, setNativeEditEngine] = useState<NativeEditEngine | null>(null);
  const [nativeEditEngineError, setNativeEditEngineError] = useState<Error | null>(null);
  const [forceFullViewer, setForceFullViewer] = useState(false);
  const [finishingEdit, setFinishingEdit] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [preference, setPreference] = useState<"auto" | "full" | "remote">(() => {
    const value = window.localStorage.getItem("tpdf-render-mode");
    return value === "full" || value === "remote" ? value : "auto";
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const onChange = () => setMobileLayout(media.matches);
    media.addEventListener("change", onChange);
    onChange();
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => { setPreference("auto"); setForceFullViewer(false); }, [props.sourceIdentity]);

  useEffect(() => {
    const localSize = props.sourceBlob?.size ?? props.data?.byteLength ?? null;
    if (localSize !== null) {
      setDocumentSize({ source: props.sourceIdentity || "", bytes: localSize });
      return;
    }
    const documentUrl = getServerDocumentUrl(props.sourceIdentity || "");
    if (!documentUrl) {
      setDocumentSize({ source: props.sourceIdentity || "", bytes: null });
      return;
    }

    const controller = new AbortController();
    setDocumentSize(null);
    fetch(documentUrl, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        const size = Number(response.headers.get("content-length"));
        if (!controller.signal.aborted) setDocumentSize({ source: props.sourceIdentity || "", bytes: response.ok && Number.isFinite(size) && size > 0 ? size : null });
      })
      .catch(() => { if (!controller.signal.aborted) setDocumentSize({ source: props.sourceIdentity || "", bytes: null }); });
    return () => controller.abort();
  }, [props.data, props.sourceBlob, props.sourceIdentity]);

  const documentSizeBytes = documentSize?.source === (props.sourceIdentity || "") ? documentSize.bytes : null;
  const available = capability?.source === (props.sourceIdentity || "") && capability.available;
  const capabilityPending = serverSource && (!capability || capability.source !== props.sourceIdentity);
  const sizePending = serverSource && documentSize === null;
  const shouldPreloadEditEngines = isEditing || (
    hasOpenedDocument && documentSizeBytes !== null && documentSizeBytes < LARGE_DOCUMENT_BYTES
  );
  const usePdfiumWorker = !import.meta.env.DEV || documentSizeBytes === null ||
    documentSizeBytes >= LARGE_DOCUMENT_BYTES;
  const shouldPreloadContentEngine = shouldPreloadEditEngines ||
    (hasOpenedDocument && serverSource && available);
  const largeDocument = documentSizeBytes !== null && documentSizeBytes >= LARGE_DOCUMENT_BYTES;
  const waitingForLargeUpload = !forceFullViewer && !isEditing &&
    window.__TPDF_RUNTIME__ === "server" &&
    (props.sourceIdentity || "").startsWith("local-upload://") &&
    documentSizeBytes !== null && documentSizeBytes >= LARGE_DOCUMENT_BYTES;

  useEffect(() => {
    if (shouldPreloadEditEngines) return;
    setNativeEditEngine(null);
    setNativeEditEngineError(null);
  }, [shouldPreloadEditEngines]);

  useEffect(() => {
    if (!serverSource || window.__TPDF_RUNTIME__ !== "server") {
      setCapability({ source: props.sourceIdentity || "", available: false });
      return;
    }
    const controller = new AbortController();
    fetch((window.__TPDF_SERVER_BASE__ || "/api/tpdf") + "/health", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (!controller.signal.aborted) setCapability({ source: props.sourceIdentity || "", available: Boolean(value?.capabilities?.remoteRendering) }); })
      .catch(() => { if (!controller.signal.aborted) setCapability({ source: props.sourceIdentity || "", available: false }); });
    return () => controller.abort();
  }, [serverSource, props.sourceIdentity]);

  const handleViewerReady = useCallback(() => {
    setHasOpenedDocument(true);
    props.onViewerReady?.();
  }, [props.onViewerReady]);

  useEffect(() => {
    if (!shouldPreloadContentEngine) return;
    let timer: number | null = null;
    let idleId: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const preload = () => {
      void preloadPdfiumContentEditingEngine().catch(() => undefined);
    };
    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(preload, { timeout: 1500 });
    } else {
      timer = window.setTimeout(preload, 0);
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
    };
  }, [shouldPreloadContentEngine]);

  const needsEditor = props.hasUnsavedChanges === true ||
    (props.activeTool !== undefined && props.activeTool !== "select");
  const remote = !forceFullViewer && !needsEditor && serverSource && available && (
    preference === "remote" ||
    (preference === "auto" && documentSizeBytes !== null && documentSizeBytes >= LARGE_DOCUMENT_BYTES)
  );

  useEffect(() => {
    if (!needsEditor || preference !== "remote") return;
    setPreference("full");
  }, [needsEditor, preference]);

  const switchMode = () => {
    const next = remote ? "full" : "remote";
    setPreference(next);
    window.localStorage.setItem("tpdf-render-mode", next);
  };

  const awaitingDecision = serverSource && !forceFullViewer && !needsEditor && (capabilityPending || sizePending);
  const requiresExplicitFull = serverSource && !forceFullViewer && !needsEditor && !available && documentSizeBytes !== null && documentSizeBytes >= LARGE_DOCUMENT_BYTES;

  return (
    <div className="relative h-full w-full" style={{ minHeight: 0 }}>
      {awaitingDecision || requiresExplicitFull ? (
        <div role="status" style={{ display: "grid", placeContent: "center", gap: 12, height: "100%", color: "#475569", textAlign: "center", padding: 16 }}>
          <span>{awaitingDecision ? "Checking PDF viewing capabilities…" : "Lightweight rendering is unavailable. Opening this large PDF will download the full file."}</span>
          {requiresExplicitFull ? <button type="button" onClick={() => setForceFullViewer(true)}>Download and open full PDF</button> : null}
        </div>
      ) : waitingForLargeUpload ? (
        <div role="status" style={{ display: "grid", placeContent: "center", gap: 12, height: "100%", color: "#475569", textAlign: "center" }}>
          <span>Preparing a lightweight preview while the PDF uploads…</span>
          <button type="button" onClick={() => setForceFullViewer(true)} style={{ justifySelf: "center", padding: "7px 12px", borderRadius: 8, border: "1px solid #94a3b8" }}>
            Open with full PDF viewer
          </button>
        </div>
      ) : remote ? <RemotePdfViewer {...props} onViewerReady={handleViewerReady} onRequestFull={() => setForceFullViewer(true)} /> : (
        <>
          {(!isEditing || !largeDocument) ? <div className="absolute inset-0">
            <PdfViewer {...props} onViewerReady={handleViewerReady} />
          </div> : null}
          {shouldPreloadEditEngines ? <NativeEditEnginePreloader
            worker={usePdfiumWorker}
            onEngineReady={setNativeEditEngine}
            onError={setNativeEditEngineError}
          /> : null}
          {isEditing ? (
            <div className="absolute inset-0">
              {nativeEditEngine ? (
                <NativeEditPdfViewer {...props} engine={nativeEditEngine} />
              ) : nativeEditEngineError ? (
                <div className="native-edit-error" role="alert">{nativeEditEngineError.message}</div>
              ) : (
                <div className="native-edit-loading" style={{ background: "transparent" }}>Loading native PDF editor…</div>
              )}
            </div>
          ) : null}
        </>
      )}
      {mobileLayout && props.onActiveToolChange && !remote ? (
        <div className="tpdf-mobile-edit-toolbar" data-tpdf-mobile-edit-toolbar="true">
          {isEditing ? (
            <button type="button" className="tpdf-mobile-done-edit" data-tpdf-action="mobile-done-edit"
              disabled={finishingEdit} onClick={() => {
                if (finishingEdit) return;
                setFinishingEdit(true);
                void commitPendingNativeInlineEdit()
                  .then(() => props.onActiveToolChange?.("select"))
                  .catch((error) => props.onError?.(error instanceof Error ? error.message : String(error)))
                  .finally(() => setFinishingEdit(false));
              }}>{finishingEdit ? "Applying…" : "Done editing"}</button>
          ) : <>
            <ViewerQuickTools activeTool={props.activeTool ?? "select"} onActiveToolChange={props.onActiveToolChange} />
            <button type="button" className="tpdf-mobile-edit-select" data-tpdf-action="mobile-select"
              aria-label="Move and select PDF" aria-pressed={!props.activeTool || props.activeTool === "select"}
              onClick={() => props.onActiveToolChange?.("select")}>
              <TpdfIcon name="view" size={19} />
            </button>
          </>}
        </div>
      ) : null}
      {serverSource && available && !needsEditor ? (
        <button type="button" data-tpdf-action="toggle-remote-render"
          aria-label={remote ? "Use full PDF editor" : "Use lightweight remote rendering"}
          onClick={switchMode}
          style={{
            position: "absolute", right: 10, bottom: 34, zIndex: 20,
            padding: "7px 12px", background: "#0f172a", color: "white",
            borderRadius: 9, fontSize: 12, boxShadow: "0 2px 9px #0003",
          }}>{remote ? "Full viewer" : "Lightweight viewer"}</button>
      ) : null}
    </div>
  );
}
