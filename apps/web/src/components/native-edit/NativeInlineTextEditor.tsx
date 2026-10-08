import { useRef } from "react";
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
  onCancel,
  onError,
}: Props) {
  const cancelRef = useRef(false);
  const layout = nativeInlineTextLayout(object, geometry, width, height, value);

  return (
    <textarea
      autoFocus
      spellCheck={false}
      aria-label="Edit PDF text"
      className="native-edit-inline-text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        void onCommit().catch((reason) => onError(reason instanceof Error ? reason.message : String(reason)));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelRef.current = true;
          onCancel();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.blur();
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
  );
}
