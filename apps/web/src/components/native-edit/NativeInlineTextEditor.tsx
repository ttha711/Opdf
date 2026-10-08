import { useRef, useState } from "react";
import type { PdfContentObject } from "@opdf/core";
import type { NativeObjectGeometry } from "../../lib/nativeEditGeometry";
import { nativeInlineTextLayout } from "./nativeInlineTextLayout";

type Props = {
  object: PdfContentObject;
  geometry: NativeObjectGeometry;
  width: number;
  height: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => Promise<void>;
  isApplying: boolean;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function NativeInlineTextEditor({
  object,
  geometry,
  width,
  height,
  value,
  onChange,
  onCommit,
  isApplying,
  onCancel,
  onError,
}: Props) {
  const cancelRef = useRef(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const submit = () => {
    setCommitError(null);
    void onCommit().catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCommitError(message);
      onError(message);
    });
  };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
  const layout = nativeInlineTextLayout(object, geometry, width, height, value, (line, size) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return line.length * size * 0.57;
    const family = (object.fontFamily || "Arial").replace(/["']/g, "");
    context.font = `${size}px "${family}"`;
    return context.measureText(line).width;
  });

  return (
    <>
    <textarea
      autoFocus
      spellCheck={false}
      aria-label="Edit PDF text"
      className="native-edit-inline-text"
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
      data-opdf-inline-text-editor="true"
    />
    {isApplying ? (
      <div className="native-edit-inline-feedback" role="status" style={{ left: layout.left, top: layout.top + layout.height + 4 }}>
        Applying PDF edit…
      </div>
    ) : null}
    {commitError && !isApplying ? (
      <div className="native-edit-inline-feedback is-error" role="alert" style={{ left: layout.left, top: layout.top + layout.height + 4 }}>
        <span>{commitError}</span>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={submit}>Retry</button>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={onCancel}>Cancel</button>
      </div>
    ) : null}
    </>
  );
}
