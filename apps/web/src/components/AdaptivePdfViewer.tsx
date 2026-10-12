import { useEffect, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { RemotePdfViewer } from "./RemotePdfViewer";

// Keep the existing fast local PDFium viewer untouched on desktop.
export function AdaptivePdfViewer(props: PdfViewerProps) {
  const isEditing = props.activeTool === "edit-content";
  const serverSource = (props.sourceIdentity || "").startsWith("server://");
  const [available, setAvailable] = useState(false);
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
            style={{ visibility: isEditing ? "hidden" : "visible", pointerEvents: isEditing ? "none" : "auto" }}
            aria-hidden={isEditing}>
            <PdfViewer {...props} />
          </div>
          {isEditing ? <div className="absolute inset-0"><NativeEditPdfViewer {...props} /></div> : null}
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
