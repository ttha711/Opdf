import { useEffect, useRef, useState } from "react";
import "../styles/native-edit-surface.css";
import type { PdfContentObject } from "@opdf/core";
import { applyVerifiedNativePatches } from "../lib/nativeEditPatchVerification";
import { pdfiumContentEditingEngine } from "../lib/pdfiumContentEngine";
import { findDirectTextObject, type DirectTextTarget } from "../lib/directPdfTextHit";

export type DirectTextRequest = DirectTextTarget & {
  id: number;
  anchorX: number;
  anchorY: number;
};

type Props = {
  request: DirectTextRequest;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  onApplyBytes: (bytes: Uint8Array, page: number) => void;
  onClose: () => void;
};

export function DirectPdfTextEditor({
  request, getDocumentBytes, onApplyBytes, onClose,
}: Props) {
  const [object, setObject] = useState<PdfContentObject | null>(null);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setFinding(true);
    setObject(null);
    setMessage(null);
    void getDocumentBytes()
      .then(async (bytes) => {
        if (!bytes) throw new Error("Unable to read this PDF.");
        const objects = await pdfiumContentEditingEngine.inspectPage(bytes, request.pageIndex);
        return { bytes, found: findDirectTextObject(objects, request) };
      })
      .then(({ bytes, found }) => {
        if (cancelled) return;
        if (!found) {
          setMessage("No editable PDF text at this position.");
          return;
        }
        setSource(bytes);
        setObject(found);
        setDraft(found.text ?? "");
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => { if (!cancelled) setFinding(false); });
    return () => { cancelled = true; };
  }, [getDocumentBytes, request]);

  const save = async () => {
    if (!object || !source || applying.current) return;
    if (draft === (object.text ?? "")) { onClose(); return; }
    applying.current = true;
    setBusy(true);
    setMessage(null);
    try {
      // Verify the PDF itself retained the replacement, rather than painting
      // a temporary text annotation that will disappear on reopen.
      const { edited } = await applyVerifiedNativePatches(source, [
        { type: "replace-text", objectId: object.id, text: draft },
      ], request.pageIndex);
      onApplyBytes(edited, request.pageIndex + 1);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      applying.current = false;
      setBusy(false);
    }
  };

  const position = {
    left: Math.max(12, Math.min(request.anchorX, window.innerWidth - 400)),
    top: Math.max(12, Math.min(request.anchorY, window.innerHeight - 220)),
  };

  return (
    <div className="opdf-quick-text" style={position} data-opdf-direct-text-edit="true"
      onDoubleClick={(event) => event.stopPropagation()}>
      {finding ? <span role="status">Finding PDF text…</span> : object ? (
        <>
          <label htmlFor="opdf-direct-text-input">Edit PDF text</label>
          <textarea
            id="opdf-direct-text-input"
            data-opdf-direct-text-input="true"
            autoFocus
            spellCheck={false}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") { event.stopPropagation(); onClose(); }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); event.stopPropagation(); void save();
              }
            }}
          />
          <div className="opdf-quick-text-actions">
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Apply"}
            </button>
          </div>
        </>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      {!finding && !object ? <button type="button" onClick={onClose}>Close</button> : null}
    </div>
  );
}
