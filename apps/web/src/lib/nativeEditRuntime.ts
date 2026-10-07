import type { PdfContentPatch } from "@opdf/core";

export type NativeEditSelection = {
  pageIndex: number;
  objectId: string | null;
};

type SelectionListener = (selection: NativeEditSelection) => void;
type PatchApplier = (patches: PdfContentPatch[], successMessage: string) => Promise<void>;
type InlineCommitter = () => Promise<void>;
type RendererRefresher = (bytes: Uint8Array) => Promise<void>;

const selectionListeners = new Set<SelectionListener>();
let currentSelection: NativeEditSelection | null = null;
let patchApplier: PatchApplier | null = null;
let inlineCommitter: InlineCommitter | null = null;
let rendererRefresher: RendererRefresher | null = null;
let pendingInlineText: { pageIndex: number; text: string } | null = null;
let workingBytes: Uint8Array | null = null;

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
  return () => { selectionListeners.delete(listener); };
}

export function requestNativeInlineTextEdit(pageIndex: number, text: string) {
  pendingInlineText = { pageIndex, text: text.trim() };
}

export function consumeNativeInlineTextEdit(pageIndex: number) {
  if (!pendingInlineText || pendingInlineText.pageIndex !== pageIndex) return null;
  const pending = pendingInlineText;
  pendingInlineText = null;
  return pending;
}

export function registerNativeInlineCommitter(committer: InlineCommitter) {
  inlineCommitter = committer;
  return () => {
    if (inlineCommitter === committer) inlineCommitter = null;
  };
}

export async function commitNativeInlineEdit() {
  await inlineCommitter?.();
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

export function registerNativeEditRendererRefresher(refresher: RendererRefresher) {
  rendererRefresher = refresher;
  return () => {
    if (rendererRefresher === refresher) rendererRefresher = null;
  };
}

export async function refreshNativeEditRenderer(bytes: Uint8Array) {
  await rendererRefresher?.(bytes);
}

export function setNativeEditWorkingBytes(bytes: Uint8Array | null) {
  workingBytes = bytes;
}

export function getNativeEditWorkingBytes() {
  return workingBytes;
}

export function clearNativeEditRuntime() {
  currentSelection = null;
  patchApplier = null;
  inlineCommitter = null;
  rendererRefresher = null;
  pendingInlineText = null;
  workingBytes = null;
}
