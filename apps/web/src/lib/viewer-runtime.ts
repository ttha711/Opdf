export type ActiveViewerControls = {
  zoomIn?: () => void;
  zoomOut?: () => void;
  resetZoom?: () => void;
  fitWidth?: () => void;
  fitPage?: () => void;
  rotateForward?: () => void;
  rotateBackward?: () => void;
};

type ViewerBytesProvider = () => Promise<Uint8Array | null>;
type ViewerThumbnailProvider = (pageNumber: number) => Promise<Blob | null>;

let activeProvider: ViewerBytesProvider | null = null;
let activeThumbnailProvider: ViewerThumbnailProvider | null = null;
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

export function registerViewerThumbnailProvider(provider: ViewerThumbnailProvider) {
  activeThumbnailProvider = provider;
  return () => {
    if (activeThumbnailProvider === provider) activeThumbnailProvider = null;
  };
}

export async function getViewerThumbnail(pageNumber: number) {
  return activeThumbnailProvider ? activeThumbnailProvider(pageNumber) : null;
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
