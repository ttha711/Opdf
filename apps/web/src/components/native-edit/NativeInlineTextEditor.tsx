import { useRef } from "react";
import type { PdfContentObject } from "@opdf/core";
import { pdfPointToDom, type NativeObjectGeometry } from "../../lib/nativeEditGeometry";

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
  const center = pdfPointToDom(geometry.center, object.pageWidth, object.pageHeight, width, height);
  const boxWidth = Math.max(80, geometry.width * width / object.pageWidth);
  const boxHeight = Math.max(30, geometry.height * height / object.pageHeight);
  const angle = -Math.atan2(geometry.u.y, geometry.u.x) * 180 / Math.PI;

  return (
    <textarea
      autoFocus
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
          cancelRef.current = true;
          onCancel();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      style={{
        left: center.x - boxWidth / 2,
        top: center.y - boxHeight / 2,
        width: boxWidth,
        minHeight: boxHeight,
        transform: `rotate(${angle}deg)`,
        fontSize: Math.max(11, (object.fontSize ?? 12) * width / object.pageWidth),
      }}
      data-opdf-inline-text-editor="true"
    />
  );
}
