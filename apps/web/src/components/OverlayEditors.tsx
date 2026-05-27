import type { PendingNote, ActiveTool } from "../lib/app-types";

export function OverlayEditors({
  pendingNote,
  activeTool,
  noteText,
  setNoteText,
  signatureStyle,
  setSignatureStyle,
  showSignModal,
  setShowSignModal,
  setPendingNote,
  createToolAnnotation,
}: {
  pendingNote: PendingNote;
  activeTool: ActiveTool;
  noteText: string;
  setNoteText: (value: string) => void;
  signatureStyle: string;
  setSignatureStyle: (value: string) => void;
  showSignModal: boolean;
  setShowSignModal: (value: boolean) => void;
  setPendingNote: (value: PendingNote) => void;
  createToolAnnotation: (
    kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image",
    pageNumber: number,
    rect: { x: number; y: number; width: number; height: number; image?: string; imageType?: string },
  ) => Promise<void>;
}) {
  return (
    <>
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
    </>
  );
}
