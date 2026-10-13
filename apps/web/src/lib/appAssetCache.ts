export function registerOfflineAppCache(buildSha: string) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const scriptUrl = new URL("tpdf-sw.js", document.baseURI);
  scriptUrl.searchParams.set("build", buildSha);
  void navigator.serviceWorker.register(scriptUrl.href, {
    scope: new URL("./", document.baseURI).pathname,
    updateViaCache: "none",
  }).catch(() => {
    // Offline support must never prevent the current online session from loading.
  });
}
