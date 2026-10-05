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
};

type ViewerBytesProvider = () => Promise<Uint8Array | null>;
let activeProvider: ViewerBytesProvider | null = null;
let activeControls: ActiveViewerControls | null = null;

export function registerViewerBytesProvider(provider: ViewerBytesProvider) {
  activeProvider = provider;
  return () => {
    if (activeProvider === provider) activeProvider = null;
  };
}

export async function getViewerDocumentBytes() {
  return activeProvider ? activeProvider() : null;
}

export function registerViewerControls(controls: ActiveViewerControls) {
  activeControls = controls;
  return () => {
    if (activeControls === controls) activeControls = null;
  };
}

export function getViewerControls() {
  return activeControls;
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
