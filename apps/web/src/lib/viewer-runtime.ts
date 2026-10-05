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
  executeCommand?: (commandId: string) => void | Promise<void>;
};

type ViewerBytesProvider = () => Promise<Uint8Array | null>;
let activeProvider: ViewerBytesProvider | null = null;
let activeProviderSource: unknown = null;
let activeControls: ActiveViewerControls | null = null;

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
  activeControls = controls;
  return () => {
    if (activeControls === controls) activeControls = null;
  };
}

export function getViewerControls() {
  return activeControls;
}

export async function executeViewerCommand(commandId: string) {
  await activeControls?.executeCommand?.(commandId);
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
