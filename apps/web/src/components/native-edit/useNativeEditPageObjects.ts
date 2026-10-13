import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { PdfContentObject } from "@tpdf/core";
import { pdfiumContentEditingEngine } from "../../lib/pdfiumContentEngine";
import { consumeNativeInlineTextEdit, emitNativeEditSelection, getNativeEditSelection } from "../../lib/nativeEditRuntime";
import { findTextObjectAtPoint } from "./nativeEditCanvasTextEdit";
import { nativeEditTextRun } from "./nativeEditTextRun";
import type { NativeEditTextLine } from "./nativeEditTextRun";

type Props = {
  pageIndex: number;
  enabled: boolean;
  revisionKey: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  setObjects: Dispatch<SetStateAction<PdfContentObject[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string | null>>;
  setEditingObject: Dispatch<SetStateAction<PdfContentObject | null>>;
  setGroupedTextLines: Dispatch<SetStateAction<NativeEditTextLine[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useNativeEditPageObjects({
  pageIndex, enabled, revisionKey, getDocumentBytes, setObjects, setSelectedId,
  setEditingText, setEditingObject, setGroupedTextLines, setError,
}: Props) {
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setObjects([]);
      return () => { cancelled = true; };
    }
    setError(null);
    void getDocumentBytes()
      .then((bytes) => !cancelled && bytes ? pdfiumContentEditingEngine.inspectPage(bytes, pageIndex) : [])
      .then((next) => {
        if (cancelled) return;
        setObjects(next);
        const pending = consumeNativeInlineTextEdit(pageIndex);
        const target = pending
          ? "text" in pending
            ? next.find((item) => item.kind === "text" && (item.text ?? "").includes(pending.text))
            : findTextObjectAtPoint(next, pending.x, pending.y)
          : null;
        if (target) {
          const run = nativeEditTextRun(next, target);
          setSelectedId(run.object.id);
          setEditingObject(run.object);
          setGroupedTextLines(run.lines);
          setEditingText(run.object.text ?? "");
          emitNativeEditSelection({ pageIndex, objectId: run.object.id });
        } else {
          setEditingObject(null);
          setGroupedTextLines([]);
          // Inspection can finish after an inspector click. Reconcile against
          // the latest requested selection, not a stale captured state update.
          setSelectedId((current) => {
            const request = getNativeEditSelection();
            const target = request?.pageIndex === pageIndex ? request.objectId : current;
            return next.some((item) => item.id === target) ? target : null;
          });
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to inspect PDF objects.");
      });
    return () => { cancelled = true; };
  }, [enabled, getDocumentBytes, pageIndex, revisionKey, setEditingObject, setEditingText,
    setGroupedTextLines, setObjects, setSelectedId, setError]);

  return useCallback(async (bytes: Uint8Array) => {
    const next = await pdfiumContentEditingEngine.inspectPage(bytes, pageIndex);
    setObjects(next);
    setEditingObject(null);
    setGroupedTextLines([]);
    setSelectedId((current) => next.some((item) => item.id === current) ? current : null);
  }, [pageIndex, setEditingObject, setGroupedTextLines, setObjects, setSelectedId]);
}
