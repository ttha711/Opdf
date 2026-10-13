import { useRef, useState } from "react";
import type { PdfContentObject } from "@tpdf/core";
import type { InlineTextLayout } from "./nativeInlineTextLayout";

type Props = {
  object: PdfContentObject;
  layout: InlineTextLayout;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => Promise<Uint8Array | null>;
  isApplying: boolean;
  coverSelectedText: boolean;
  externalError: string | null;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function NativeInlineTextEditor({
  object,
  layout,
  value,
  onChange,
  onCommit,
  isApplying,
  coverSelectedText,
  externalError,
  onCancel,
  onError,
}: Props) {
  const cancelRef = useRef(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const submit = () => {
    setCommitError(null);
    onError("");
    void onCommit().catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCommitError(message);
      onError(message);
    });
  };
  const displayedError = commitError || externalError;
  return (
    <>
    <textarea
      autoFocus
      spellCheck={false}
      aria-label="Edit PDF text"
      className={`native-edit-inline-text${coverSelectedText ? " is-covered" : ""}`}
      value={value}
      readOnly={isApplying}
      aria-busy={isApplying}
      onChange={(event) => { setCommitError(null); onChange(event.target.value); }}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        if (!isApplying) submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (isApplying) return;
          cancelRef.current = true;
          onCancel();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          if (!isApplying) submit();
        }
      }}
      style={{
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        fontFamily: object.fontFamily || undefined,
        fontSize: layout.fontSize,
        lineHeight: 1.35,
        color: "#111827",
      }}
      data-tpdf-inline-text-editor="true"
      data-tpdf-inline-object-id={object.id}
    />
    {isApplying ? (
      <div className="native-edit-inline-feedback" role="status" style={{ left: layout.left, top: layout.top + layout.height + 4 }}>
        Applying PDF edit…
      </div>
    ) : null}
    {displayedError && !isApplying ? (
      <div className="native-edit-inline-feedback is-error" role="alert" style={{ left: layout.left, top: layout.top + layout.height + 4 }}>
        <span>{displayedError}</span>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={submit}>Retry</button>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={onCancel}>Cancel</button>
      </div>
    ) : null}
    </>
  );
}
