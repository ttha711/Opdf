type ViewerBytesProvider = () => Promise<Uint8Array | null>;

let activeProvider: ViewerBytesProvider | null = null;

export function registerViewerBytesProvider(provider: ViewerBytesProvider) {
  activeProvider = provider;
  return () => {
    if (activeProvider === provider) activeProvider = null;
  };
}

export async function getViewerDocumentBytes() {
  return activeProvider ? activeProvider() : null;
}
