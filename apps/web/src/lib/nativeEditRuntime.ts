import type { PdfContentPatch } from "@opdf/core";

export type NativeEditSelection = {
  pageIndex: number;
  objectId: string | null;
};

type SelectionListener = (selection: NativeEditSelection) => void;
type PatchApplier = (patches: PdfContentPatch[], successMessage: string) => Promise<void>;

const selectionListeners = new Set<SelectionListener>();
let currentSelection: NativeEditSelection | null = null;
let patchApplier: PatchApplier | null = null;

export function emitNativeEditSelection(selection: NativeEditSelection) {
  currentSelection = selection;
  selectionListeners.forEach((listener) => listener(selection));
}

export function getNativeEditSelection() {
  return currentSelection;
}

export function registerNativeEditSelectionListener(listener: SelectionListener) {
  selectionListeners.add(listener);
  if (currentSelection) listener(currentSelection);
  return () => selectionListeners.delete(listener);
}

export function registerNativeEditPatchApplier(applier: PatchApplier) {
  patchApplier = applier;
  return () => {
    if (patchApplier === applier) patchApplier = null;
  };
}

export async function applyNativeEditPatches(
  patches: PdfContentPatch[],
  successMessage: string,
) {
  if (!patchApplier) throw new Error("Native editor is still initializing.");
  await patchApplier(patches, successMessage);
}

export function clearNativeEditRuntime() {
  currentSelection = null;
  patchApplier = null;
}
