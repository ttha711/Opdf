export type ActiveViewerControls = {
  zoomIn?: () => void;
  zoomOut?: () => void;
  resetZoom?: () => void;
  fitWidth?: () => void;
  fitPage?: () => void;
  rotateForward?: () => void;
  rotateBackward?: () => void;
  undo?: () => void;
  redo?: () => void;
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  goToPage?: (pageNumber: number) => void;
  executeCommand?: (commandId: string) => void | Promise<void>;
};

type ViewerBytesProvider = () => Promise<Uint8Array | null>;
type ViewerPageImageProvider = (pageNumber: number) => Promise<Blob | null>;
let activeProvider: ViewerBytesProvider | null = null;
let activeProviderSource: unknown = null;
let activePageImageProvider: ViewerPageImageProvider | null = null;
let activeControls: ActiveViewerControls | null = null;
const viewerControlsStack: ActiveViewerControls[] = [];

export function registerViewerBytesProvider(provider: ViewerBytesProvider, source: unknown = null) {
  activeProvider = provider;
  activeProviderSource = source;
  return () => {
    if (activeProvider !== provider) return;
    activeProvider = null;
    activeProviderSource = null;
  };
}

export async function getViewerDocumentBytes(expectedSource?: unknown) {
  if (!activeProvider) return null;
  if (arguments.length > 0 && expectedSource !== activeProviderSource) return null;
  return activeProvider();
}

export function registerViewerControls(controls: ActiveViewerControls) {
  viewerControlsStack.push(controls);
  activeControls = controls;
  return () => {
    const index = viewerControlsStack.lastIndexOf(controls);
    if (index >= 0) viewerControlsStack.splice(index, 1);
    activeControls = viewerControlsStack.at(-1) ?? null;
  };
}

export function getViewerControls() {
  return activeControls;
}

export async function executeViewerCommand(commandId: string) {
  await activeControls?.executeCommand?.(commandId);
}


export function registerViewerPageImageProvider(provider: ViewerPageImageProvider) {
  activePageImageProvider = provider;
  return () => {
    if (activePageImageProvider === provider) activePageImageProvider = null;
  };
}

export async function renderViewerPageImage(pageNumber: number) {
  return activePageImageProvider ? activePageImageProvider(pageNumber) : null;
}

export async function renderViewerPageImages(pageCount: number) {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];
  const pages: Array<{ page: number; blob: Blob }> = [];
  for (let page = 1; page <= pageCount; page += 1) {
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 20 && !blob; attempt += 1) {
      blob = await renderViewerPageImage(page);
      if (!blob && attempt < 19) await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    if (!blob) throw new Error(`Unable to render page ${page} from the active viewer.`);
    pages.push({ page, blob });
  }
  return pages;
}


export type ViewerContentArea = {
  pageIndex: number;
  rect: { origin: { x: number; y: number }; size: { width: number; height: number } };
};

let activeContentPickStarter: (() => void) | null = null;
let activeContentAreaListener: ((area: ViewerContentArea) => void) | null = null;

export function registerViewerContentPickStarter(start: () => void) {
  activeContentPickStarter = start;
  return () => {
    if (activeContentPickStarter === start) activeContentPickStarter = null;
  };
}

export function beginViewerContentPick() {
  activeContentPickStarter?.();
}

export function registerViewerContentAreaListener(listener: (area: ViewerContentArea) => void) {
  activeContentAreaListener = listener;
  return () => {
    if (activeContentAreaListener === listener) activeContentAreaListener = null;
  };
}

export function emitViewerContentArea(area: ViewerContentArea) {
  activeContentAreaListener?.(area);
}

// Document-scoped EmbedPDF printing, never window.print() of OPDF chrome.
let activePdfPrint: (() => void) | null = null;
export function registerViewerPrint(print: () => void) {
  activePdfPrint = print;
  return () => { if (activePdfPrint === print) activePdfPrint = null; };
}
export function printViewerDocument() {
  if (!activePdfPrint) throw new Error("The PDF print engine is not ready.");
  activePdfPrint();
}
