const CACHE_PREFIX = "opdf-app-";
const build = new URL(self.location.href).searchParams.get("build") || "unknown";
const CACHE_NAME = CACHE_PREFIX + build;
const scopeUrl = new URL(self.registration.scope);
const shellUrl = new URL("./", scopeUrl).href;
const manifestUrl = new URL("asset-manifest.json", scopeUrl).href;
const runtimeUrl = new URL("opdf-runtime.js", scopeUrl).href;

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok) return response;
  await cache.put(request, response.clone());
  return response;
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch(shellUrl, { cache: "no-cache", credentials: "same-origin" });
  if (shellResponse.ok) {
    await cache.put(shellUrl, shellResponse.clone());
  }

  try {
    const runtimeResponse = await fetch(runtimeUrl, {
      cache: "no-cache",
      credentials: "same-origin",
    });
    await cacheResponse(cache, runtimeUrl, runtimeResponse);
  } catch {
    // Static/local builds do not expose server runtime configuration.
  }

  const manifestResponse = await fetch(manifestUrl, {
    cache: "no-cache",
    credentials: "same-origin",
  });
  if (!manifestResponse.ok) return;

  await cache.put(manifestUrl, manifestResponse.clone());
  const manifest = await manifestResponse.json();
  const paths = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry?.file) paths.add(entry.file);
    for (const css of entry?.css || []) paths.add(css);
    for (const asset of entry?.assets || []) paths.add(asset);
  }

  await Promise.all([...paths].map(async (path) => {
    if (!path || path.endsWith(".map")) return;
    const url = new URL(path, scopeUrl).href;
    try {
      const response = await fetch(url, { cache: "no-cache", credentials: "same-origin" });
      await cacheResponse(cache, url, response);
    } catch {
      // Installation should still succeed if one optional asset is unavailable.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(shellUrl, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request))
          || (await cache.match(shellUrl))
          || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      return await cacheResponse(cache, request, response);
    } catch {
      return Response.error();
    }
  })());
});
