import type { PdfContentObject, PdfMatrix } from "@tpdf/core";
import { createNativeEditTextRunCandidateLookup, nativeEditTextRun, type NativeEditTextLine } from "./nativeEditTextRun";

export type NativeEditInteractiveObject = {
  object: PdfContentObject;
  objectIds: string[];
  lines?: NativeEditTextLine[];
};

export function getNativeEditInteractiveObjects(objects: PdfContentObject[]) {
  const consumed = new Set<string>();
  const interactive: NativeEditInteractiveObject[] = [];
  const findRunCandidates = createNativeEditTextRunCandidateLookup(objects);

  for (const object of objects) {
    if (consumed.has(object.id)) continue;
    if (object.kind !== "text" || (object.depth ?? 0) > 1 || !object.text) {
      consumed.add(object.id);
      interactive.push({ object, objectIds: [object.id] });
      continue;
    }
    const run = nativeEditTextRun(objects, object, findRunCandidates(object));
    const objectIds = run.objectIds.filter((id) => !consumed.has(id));
    if (!objectIds.length) continue;
    objectIds.forEach((id) => consumed.add(id));
    interactive.push({ object: run.object, objectIds, lines: run.lines });
  }

  return interactive;
}

export function nativeEditTransformPatches(objectIds: string[], matrix: PdfMatrix) {
  return [...new Set(objectIds)].map((objectId) => ({
    type: "relative-transform" as const,
    objectId,
    matrix,
  }));
}
