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


export type ViewerThumbnail = {
  page: number;
  blob: Blob;
};

export async function collectViewerThumbnails(pageCount: number): Promise<ViewerThumbnail[]> {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];

  const thumbnails: ViewerThumbnail[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 20 && !blob; attempt += 1) {
      blob = await getViewerThumbnail(pageNumber);
      if (!blob && attempt < 19) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    }
    if (!blob) {
      throw new Error(`Unable to render page ${pageNumber} from the active PDFium viewer.`);
    }
    thumbnails.push({ page: pageNumber, blob });
  }
  return thumbnails;
}
