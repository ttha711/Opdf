import type { PdfContentObject, PdfContentPatch } from "@tpdf/core";
import type { NativeEditTextLine } from "./nativeEditTextRun";

export function nativeEditTextCommitPatches(
  selected: PdfContentObject,
  sourceLines: NativeEditTextLine[],
  nextText: string,
): PdfContentPatch[] {
  const lines = sourceLines.length ? sourceLines : [{ object: selected, objectIds: [selected.id] }];
  const nextLines = nextText.split(/\r?\n/);
  if (nextLines.length > lines.length && nextLines.slice(lines.length).some((line) => line.trim())) {
    throw new Error(`This PDF paragraph has ${lines.length} editable lines. Remove extra line breaks before applying.`);
  }
  const unicodeFallback = /[^\x00-\x7F]/.test(nextText);
  const patches: PdfContentPatch[] = [];
  for (const [index, line] of lines.entries()) {
    const sourceIds = line.objectIds.length ? line.objectIds : [line.object.id];
    const anchorId = sourceIds[0];
    const text = nextLines[index];
    if (text === undefined || !text.trim()) {
      sourceIds.forEach((objectId) => patches.push({ type: "delete", objectId }));
      continue;
    }
    if (unicodeFallback) patches.push({
      type: "style-text", objectId: anchorId,
      fontFamily: "__tpdf_unicode__", fontSize: line.object.fontSize,
    });
    patches.push({ type: "replace-text", objectId: anchorId, text });
    sourceIds.slice(1).forEach((objectId) => patches.push({ type: "delete", objectId }));
  }
  return patches;
}
