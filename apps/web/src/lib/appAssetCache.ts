type ViteManifestEntry = {
  file?: string;
  css?: string[];
  assets?: string[];
};

type ViteManifest = Record<string, ViteManifestEntry>;

function collectAssetPaths(manifest: ViteManifest) {
  const paths = new Set<string>();
  for (const entry of Object.values(manifest)) {
    if (entry.file) paths.add(entry.file);
    entry.css?.forEach((path) => paths.add(path));
    entry.assets?.forEach((path) => paths.add(path));
  }
  return [...paths].filter((path) => !path.endsWith(".map"));
}

async function warmOne(path: string) {
  const url = new URL(path, document.baseURI);
  await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  });
}

async function warmAssets(paths: string[]) {
  const queue = [...paths];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const path = queue.shift();
      if (!path) return;
      try {
        await warmOne(path);
      } catch {
        // Cache warming is best-effort and must never block the application.
      }
    }
  });
  await Promise.all(workers);
}

export function warmAppAssetCache() {
  if (!import.meta.env.PROD) return;

  const start = async () => {
    try {
      const response = await fetch(new URL("asset-manifest.json", document.baseURI), {
        cache: "no-cache",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const manifest = await response.json() as ViteManifest;
      await warmAssets(collectAssetPaths(manifest));
    } catch {
      // The current page is already usable; warming is only an optimization.
    }
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => void start(), { timeout: 4000 });
  } else {
    window.setTimeout(() => void start(), 1000);
  }
}
