import { useCallback, type Dispatch, type MouseEvent, type RefObject, type SetStateAction } from "react";
import type { PdfContentObject } from "@tpdf/core";
import { emitNativeEditSelection } from "../../lib/nativeEditRuntime";
import { geometryForObject } from "../../lib/nativeEditGeometry";
import { nativeEditTextRun, type NativeEditTextLine } from "./nativeEditTextRun";
import type { NativeEditInteractiveObject } from "./nativeEditInteractiveObjects";

export function findTextObjectAtPoint(objects: PdfContentObject[], x: number, y: number) {
  const pageWidth = objects[0]?.pageWidth;
  const pageHeight = objects[0]?.pageHeight;
  if (!pageWidth || !pageHeight) return null;
  const origin = objects[0]?.pageOrigin ?? { x: 0, y: 0 };
  const point = { x: x * pageWidth + origin.x, y: (1 - y) * pageHeight + origin.y };
  const tolerance = Math.max(pageWidth, pageHeight) * 0.01;
  let closest: { object: PdfContentObject; score: number } | null = null;

  for (const object of objects) {
    if (object.kind !== "text" || (object.depth ?? 0) > 1) continue;
    const { center, u, v, width, height } = geometryForObject(object);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const alongX = Math.abs(dx * u.x + dy * u.y);
    const alongY = Math.abs(dx * v.x + dy * v.y);
    const outsideX = Math.max(0, alongX - width / 2);
    const outsideY = Math.max(0, alongY - height / 2);
    const distance = Math.hypot(outsideX, outsideY);
    if (distance > tolerance) continue;
    const score = distance * 1000 + Math.hypot(dx, dy);
    if (!closest || score < closest.score) closest = { object, score };
  }
  return closest?.object ?? null;
}

type Props = {
  overlayRef: RefObject<SVGSVGElement>;
  objects: PdfContentObject[];
  interactiveObjects: NativeEditInteractiveObject[];
  selected: PdfContentObject | null;
  editingText: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string | null>>;
  setEditingObject: Dispatch<SetStateAction<PdfContentObject | null>>;
  setGroupedTextLines: Dispatch<SetStateAction<NativeEditTextLine[]>>;
  commitInlineText: () => Promise<Uint8Array | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  pageIndex: number;
};

export function useNativeEditCanvasTextDoubleClick({
  overlayRef, objects, interactiveObjects, selected, editingText, setSelectedId, setEditingText,
  setEditingObject, setGroupedTextLines, commitInlineText, setError, pageIndex,
}: Props) {
  return useCallback((event: MouseEvent<SVGSVGElement>) => {
    const overlay = overlayRef.current;
    const rect = overlay?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const target = findTextObjectAtPoint(objects,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
    if (!target) return;
    // The overlay has already grouped the page's selectable text runs. Reuse
    // that result here instead of repeating the expensive grouping pass on
    // every double-click over a dense drawing index.
    const run = interactiveObjects.find((item) => item.objectIds.includes(target.id))
      ?? nativeEditTextRun(objects, target);
    event.preventDefault();
    event.stopPropagation();
    const beginEdit = () => {
      setSelectedId(run.object.id);
      setEditingObject(run.object);
      setGroupedTextLines(run.lines ?? [{ object: run.object, objectIds: run.objectIds }]);
      emitNativeEditSelection({ pageIndex, objectId: run.object.id });
      setEditingText(run.object.text ?? "");
    };
    if (editingText !== null && selected?.id !== run.object.id) {
      void commitInlineText().then(beginEdit).catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)));
    } else beginEdit();
  }, [commitInlineText, editingText, interactiveObjects, objects, overlayRef, pageIndex, selected?.id, setEditingObject, setGroupedTextLines, setEditingText, setError, setSelectedId]);
}
