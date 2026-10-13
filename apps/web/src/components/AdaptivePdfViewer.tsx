import { useCallback, useEffect, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { NativeEditEnginePreloader, type NativeEditEngine } from "./native-edit/NativeEditEnginePreloader";
import { RemotePdfViewer } from "./RemotePdfViewer";
import { getServerDocumentUrl } from "../lib/documentSource";
import { preloadPdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";

const LARGE_DOCUMENT_BYTES = 100 * 1024 * 1024;

// Keep the existing fast local PDFium viewer untouched on desktop.
export function AdaptivePdfViewer(props: PdfViewerProps) {
  const isEditing = props.activeTool === "edit-content";
  const serverSource = (props.sourceIdentity || "").startsWith("server://");
  const [available, setAvailable] = useState(false);
  const [hasOpenedDocument, setHasOpenedDocument] = useState(false);
  const [documentSizeBytes, setDocumentSizeBytes] = useState<number | null>(null);
  const [nativeEditEngine, setNativeEditEngine] = useState<NativeEditEngine | null>(null);
  const [nativeEditEngineError, setNativeEditEngineError] = useState<Error | null>(null);
  const [forceFullViewer, setForceFullViewer] = useState(false);
  const [preference, setPreference] = useState<"auto" | "full" | "remote">(() => {
    const value = window.localStorage.getItem("tpdf-render-mode");
    return value === "full" || value === "remote" ? value : "auto";
  });

  useEffect(() => {
    const localSize = props.sourceBlob?.size ?? props.data?.byteLength ?? null;
    if (localSize !== null) {
      setDocumentSizeBytes(localSize);
      return;
    }
    const documentUrl = getServerDocumentUrl(props.sourceIdentity || "");
    if (!documentUrl) {
      setDocumentSizeBytes(null);
      return;
    }

    const controller = new AbortController();
    setDocumentSizeBytes(null);
    fetch(documentUrl, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        const size = Number(response.headers.get("content-length"));
        if (response.ok && Number.isFinite(size) && size > 0 && !controller.signal.aborted) {
          setDocumentSizeBytes(size);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [props.data, props.sourceBlob, props.sourceIdentity]);

  const shouldPreloadEditEngines = hasOpenedDocument && (
    isEditing || (documentSizeBytes !== null && documentSizeBytes < LARGE_DOCUMENT_BYTES)
  );
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
      setAvailable(false);
      return;
    }
    const controller = new AbortController();
    fetch((window.__TPDF_SERVER_BASE__ || "/api/tpdf") + "/health", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (!controller.signal.aborted) setAvailable(Boolean(value?.capabilities?.remoteRendering)); })
      .catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, [serverSource]);

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

  const mobile = window.matchMedia("(max-width: 800px)").matches;
  const remote = !forceFullViewer && !isEditing && serverSource && available && (
    preference === "remote" ||
    (preference === "auto" && (mobile || (documentSizeBytes !== null && documentSizeBytes >= LARGE_DOCUMENT_BYTES)))
  );

  const switchMode = () => {
    const next = remote ? "full" : "remote";
    setPreference(next);
    window.localStorage.setItem("tpdf-render-mode", next);
  };

  return (
    <div className="relative h-full w-full" style={{ minHeight: 0 }}>
      {waitingForLargeUpload ? (
        <div role="status" style={{ display: "grid", placeContent: "center", gap: 12, height: "100%", color: "#475569", textAlign: "center" }}>
          <span>Preparing a lightweight preview while the PDF uploads…</span>
          <button type="button" onClick={() => setForceFullViewer(true)} style={{ justifySelf: "center", padding: "7px 12px", borderRadius: 8, border: "1px solid #94a3b8" }}>
            Open with full PDF viewer
          </button>
        </div>
      ) : remote ? <RemotePdfViewer {...props} onViewerReady={handleViewerReady} /> : (
        <>
          {(!isEditing || !largeDocument) ? <div className="absolute inset-0">
            <PdfViewer {...props} onViewerReady={handleViewerReady} />
          </div> : null}
          {shouldPreloadEditEngines ? <NativeEditEnginePreloader
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
      {serverSource && available && !isEditing ? (
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
