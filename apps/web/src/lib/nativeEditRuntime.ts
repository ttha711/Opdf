import type { PdfContentPatch } from "@tpdf/core";

export type NativeEditSelection = {
  pageIndex: number;
  objectId: string | null;
};
export type NativeInlineTextEditRequest = {
  pageIndex: number;
  objectId: string;
};

type SelectionListener = (selection: NativeEditSelection) => void;
type InlineTextEditRequestListener = (request: NativeInlineTextEditRequest) => void;
type PatchApplier = (patches: PdfContentPatch[], successMessage: string) => Promise<Uint8Array | null>;
type InlineCommitter = () => Promise<Uint8Array | null>;
type PendingInlineTextEdit =
  | { pageIndex: number; text: string }
  | { pageIndex: number; x: number; y: number };

const selectionListeners = new Set<SelectionListener>();
const inlineTextEditRequestListeners = new Set<InlineTextEditRequestListener>();
let currentSelection: NativeEditSelection | null = null;
let patchApplier: PatchApplier | null = null;
let inlineCommitter: InlineCommitter | null = null;
let pendingInlineText: PendingInlineTextEdit | null = null;

export function emitNativeEditSelection(selection: NativeEditSelection) {
  currentSelection = selection;
  selectionListeners.forEach((listener) => listener(selection));
}

export function getNativeEditSelection() {
  return currentSelection;
}

export function requestNativeInlineTextEditById(request: NativeInlineTextEditRequest) {
  inlineTextEditRequestListeners.forEach((listener) => listener(request));
}

export function registerNativeInlineTextEditRequestListener(listener: InlineTextEditRequestListener) {
  inlineTextEditRequestListeners.add(listener);
  return () => { inlineTextEditRequestListeners.delete(listener); };
}

export function registerNativeEditSelectionListener(listener: SelectionListener) {
  selectionListeners.add(listener);
  if (currentSelection) listener(currentSelection);
  return () => { selectionListeners.delete(listener); };
}

export function requestNativeInlineTextEdit(pageIndex: number, text: string) {
  pendingInlineText = { pageIndex, text: text.trim() };
}

export function requestNativeInlineTextEditAtPoint(pageIndex: number, x: number, y: number) {
  pendingInlineText = { pageIndex, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

export type NativeEditScrollMemory = { x: number; y: number };
let scrollMemory: NativeEditScrollMemory | null = null;

/** Last scroll offset of whichever viewer (reader or editor) the user was in. */
export function setNativeEditScrollMemory(position: NativeEditScrollMemory | null) {
  scrollMemory = position;
}

export function peekNativeEditScrollMemory() {
  return scrollMemory;
}

export function takeNativeEditScrollMemory() {
  const position = scrollMemory;
  scrollMemory = null;
  return position;
}

export type NativeEditViewportAnchor = { pageIndex: number; pageY: number; screenY: number };
let viewportAnchor: NativeEditViewportAnchor | null = null;

/** Where on screen (and on which page) the user was looking when editing started. */
export function setNativeEditViewportAnchor(anchor: NativeEditViewportAnchor | null) {
  viewportAnchor = anchor;
}

export function consumeNativeEditViewportAnchor() {
  const anchor = viewportAnchor;
  viewportAnchor = null;
  return anchor;
}

export function consumeNativeInlineTextEdit(pageIndex: number) {
  if (!pendingInlineText || pendingInlineText.pageIndex !== pageIndex) return null;
  const pending = pendingInlineText;
  pendingInlineText = null;
  return pending;
}

export function registerNativeEditPatchApplier(applier: PatchApplier) {
  patchApplier = applier;
  return () => {
    if (patchApplier === applier) patchApplier = null;
  };
}

let lastPatchFailure: string | null = null;
export function setNativeEditPatchFailure(message: string | null) { lastPatchFailure = message; }
export function getNativeEditPatchFailure() { return lastPatchFailure; }

export async function applyNativeEditPatches(
  patches: PdfContentPatch[],
  successMessage: string,
) {
  if (!patchApplier) throw new Error("Native editor is still initializing.");
  return patchApplier(patches, successMessage);
}

export function registerNativeInlineCommitter(committer: InlineCommitter) {
  inlineCommitter = committer;
  return () => { if (inlineCommitter === committer) inlineCommitter = null; };
}

export async function commitPendingNativeInlineEdit() {
  return (await inlineCommitter?.()) ?? null;
}

export function clearNativeEditRuntime() {
  currentSelection = null;
  inlineTextEditRequestListeners.clear();
  patchApplier = null;
  inlineCommitter = null;
  pendingInlineText = null;
}
