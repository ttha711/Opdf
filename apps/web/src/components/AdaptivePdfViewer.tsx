import { useEffect, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { RemotePdfViewer } from "./RemotePdfViewer";
import { ViewerQuickTools } from "./ViewerQuickTools";
import { OpdfIcon } from "./OpdfIcon";
import { commitPendingNativeInlineEdit } from "../lib/nativeEditRuntime";

// Keep the existing fast local PDFium viewer untouched on desktop.
export function AdaptivePdfViewer(props: PdfViewerProps) {
  const isEditing = props.activeTool === "edit-content";
  const serverSource = (props.sourceIdentity || "").startsWith("server://");
  const [available, setAvailable] = useState(false);
  const [finishingEdit, setFinishingEdit] = useState(false);
  // View-only mode is temporary and document-scoped. Persisting "remote" in
  // localStorage can unexpectedly disable tools for the next opened PDF.
  const [preference, setPreference] = useState<"full" | "remote">("full");
  useEffect(() => { setPreference("full"); }, [props.sourceIdentity]);

  useEffect(() => {
    if (!serverSource || window.__OPDF_RUNTIME__ !== "server") {
      setAvailable(false);
      return;
    }
    const controller = new AbortController();
    fetch((window.__OPDF_SERVER_BASE__ || "/api/opdf") + "/health", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (!controller.signal.aborted) setAvailable(Boolean(value?.capabilities?.remoteRendering)); })
      .catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, [serverSource]);

  // The remote tile renderer is view-only. Never auto-enable it on touch devices:
  // doing so silently disables annotations, editing and the PDF tool registry.
  // Never unmount the editable viewer while it has unsaved PDFium changes.
  const needsEditor = props.hasUnsavedChanges === true ||
    (props.activeTool !== undefined && props.activeTool !== "select");
  const remote = !needsEditor && serverSource && available && preference === "remote";

  useEffect(() => {
    if (!needsEditor || preference !== "remote") return;
    setPreference("full");
  }, [needsEditor, preference]);

  const switchMode = () => {
    const next = remote ? "full" : "remote";
    setPreference(next);
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
      {props.onActiveToolChange && !remote ? (
        <div className="opdf-mobile-edit-toolbar" data-opdf-mobile-edit-toolbar="true">
          {isEditing ? (
            <button type="button" className="opdf-mobile-done-edit" data-opdf-action="mobile-done-edit"
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
          <button type="button" className="opdf-mobile-edit-select" data-opdf-action="mobile-select"
            aria-label="Move and select PDF" aria-pressed={!props.activeTool || props.activeTool === "select"}
            onClick={() => props.onActiveToolChange?.("select")}>
            <OpdfIcon name="view" size={19} />
          </button>
          </>}
        </div>
      ) : null}
      {serverSource && available && !needsEditor ? (
        <button type="button" data-opdf-action="toggle-remote-render" className="opdf-render-mode-toggle"
          aria-label={remote ? "Use full PDF editor" : "Use read-only lightweight rendering"}
          onClick={switchMode}
          style={{
            position: "absolute", right: 10, bottom: 34, zIndex: 20,
            padding: "7px 12px", background: "#0f172a", color: "white",
            borderRadius: 9, fontSize: 12, boxShadow: "0 2px 9px #0003",
          }}>{remote ? "Full editor" : "View only"}</button>
      ) : null}
    </div>
  );
}
