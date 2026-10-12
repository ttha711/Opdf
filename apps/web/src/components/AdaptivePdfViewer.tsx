import { useCallback, useEffect, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { NativeEditEnginePreloader, type NativeEditEngine } from "./native-edit/NativeEditEnginePreloader";
import { RemotePdfViewer } from "./RemotePdfViewer";
import { preloadPdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";

// Keep the existing fast local PDFium viewer untouched on desktop.
export function AdaptivePdfViewer(props: PdfViewerProps) {
  const isEditing = props.activeTool === "edit-content";
  const serverSource = (props.sourceIdentity || "").startsWith("server://");
  const [available, setAvailable] = useState(false);
  const [hasOpenedDocument, setHasOpenedDocument] = useState(false);
  const [nativeEditEngine, setNativeEditEngine] = useState<NativeEditEngine | null>(null);
  const [nativeEditEngineError, setNativeEditEngineError] = useState<Error | null>(null);
  const [preference, setPreference] = useState<"auto" | "full" | "remote">(() => {
    const value = window.localStorage.getItem("tpdf-render-mode");
    return value === "full" || value === "remote" ? value : "auto";
  });

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
    if (!hasOpenedDocument) return;
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
  }, [hasOpenedDocument]);

  const mobile = window.matchMedia("(max-width: 800px)").matches;
  const remote = !isEditing && serverSource && available && (preference === "remote" || (preference === "auto" && mobile));

  const switchMode = () => {
    const next = remote ? "full" : "remote";
    setPreference(next);
    window.localStorage.setItem("tpdf-render-mode", next);
  };

  return (
    <div className="relative h-full w-full" style={{ minHeight: 0 }}>
      {remote ? <RemotePdfViewer {...props} /> : (
        <>
          <div className="absolute inset-0"
            style={{ visibility: "visible", pointerEvents: isEditing ? "none" : "auto" }}
            aria-hidden={isEditing}>
            <PdfViewer {...props} onViewerReady={handleViewerReady} />
          </div>
          {hasOpenedDocument ? <NativeEditEnginePreloader
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
