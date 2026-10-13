import { useEffect, useState } from "react";
import type { PdfContentObject } from "@tpdf/core";

type Props = {
  object: PdfContentObject;
  onApply: (text: string) => Promise<boolean>;
  onCancel: () => void;
};

/** Reliable text editing when a large CAD overlay has been virtualized away. */
export function NativeContentPanelTextEditor({ object, onApply, onCancel }: Props) {
  const [text, setText] = useState(object.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(object.text ?? ""); setError(null); }, [object.id]);

  const commit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await onApply(text)) onCancel();
      else setError("Unable to apply PDF text. Your draft is preserved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="native-content-editor__inline-panel" aria-label="Edit selected PDF text">
      <textarea autoFocus aria-label="Edit PDF text" data-tpdf-inline-text-editor="true"
        data-tpdf-inline-object-id={object.id} aria-busy={busy}
        value={text} disabled={busy} onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void commit();
          }
        }} />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void commit()}>
          {busy ? "Applying…" : "Apply text"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
