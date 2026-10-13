import type { Page, CDPSession } from "@playwright/test";

// Browser-side transfer audit. Network.loadingFinished.encodedDataLength is
// wire-size (including protocol overhead), NOT Content-Length and NOT a
// synthetic request's advertised size. dataReceived covers in-flight bytes.
type Entry = {
  kind: "document" | "meta" | "tile" | "text";
  method: string;
  status: number | null;
  range: boolean;
  level: number | null;
  wireProgress: number;
  wireFinished: number;
  finished: boolean;
  failed: boolean;
  canceled: boolean;
};

export type PdfTrafficSnapshot = {
  headCount: number;
  headRespondedCount: number;
  headResponseStatuses: number[];
  documentGetCount: number;
  fullDocumentGetCount: number;
  rangedDocumentGetCount: number;
  documentGetStatuses: Array<number | null>;
  documentGetWireBytes: number;
  tileGetCount: number;
  tileGetWireBytes: number;
  metadataGetCount: number;
  metadataGetWireBytes: number;
  totalPdfGetWireBytes: number;
  maxTileLevel: number;
  pendingPdfGets: number;
  pendingTileGets: number;
  completedTileGets: number;
  canceledTileGets: number;
  failedPdfGets: number;
};

export async function auditPdfTraffic(page: Page, documentId: string) {
  const session: CDPSession = await page.context().newCDPSession(page);
  const entries = new Map<string, Entry>();
  const prefix = `/api/tpdf/documents/${documentId}`;
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Network.setBypassServiceWorker", { bypass: true });

  session.on("Network.requestWillBeSent", (event: {
    requestId: string; request: { url: string; method: string; headers: Record<string, string> };
  }) => {
    let parsed: URL;
    try { parsed = new URL(event.request.url); } catch { return; }
    const path = parsed.pathname;
    if (path !== prefix && !path.startsWith(prefix + "/render/")) return;
    const kind = path === prefix ? "document" :
      path.endsWith("/render/tile") ? "tile" :
      path.endsWith("/render/meta") ? "meta" : "text";
    const levelRaw = parsed.searchParams.get("level");
    const level = levelRaw === null ? null : Number(levelRaw);
    entries.set(event.requestId, {
      kind, method: event.request.method, status: null,
      range: Object.keys(event.request.headers).some((key) => key.toLowerCase() === "range"),
      level, wireProgress: 0, wireFinished: 0, finished: false, failed: false,
      canceled: false,
    });
  });
  session.on("Network.responseReceived", (event: { requestId: string; response: { status: number } }) => {
    const entry = entries.get(event.requestId);
    if (entry) entry.status = event.response.status;
  });
  session.on("Network.dataReceived", (event: { requestId: string; encodedDataLength: number }) => {
    const entry = entries.get(event.requestId);
    if (entry) entry.wireProgress += event.encodedDataLength;
  });
  session.on("Network.loadingFinished", (event: { requestId: string; encodedDataLength: number }) => {
    const entry = entries.get(event.requestId);
    if (entry) {
      entry.wireFinished = event.encodedDataLength;
      entry.finished = true;
    }
  });
  session.on("Network.loadingFailed", (event: { requestId: string; canceled?: boolean }) => {
    const entry = entries.get(event.requestId);
    if (entry) {
      entry.failed = true;
      entry.canceled = event.canceled === true;
    }
  });

  function snapshot(): PdfTrafficSnapshot {
    const rows = [...entries.values()];
    const documentGets = rows.filter((row) => row.kind === "document" && row.method === "GET");
    const tileGets = rows.filter((row) => row.kind === "tile" && row.method === "GET");
    const metaGets = rows.filter((row) => row.kind === "meta" && row.method === "GET");
    const allGets = rows.filter((row) => row.method === "GET");
    const wireBytes = (row: Entry) => Math.max(row.wireProgress, row.wireFinished);
    const sum = (items: Entry[]) => items.reduce((total, row) => total + wireBytes(row), 0);
    return {
      headCount: rows.filter((row) => row.kind === "document" && row.method === "HEAD").length,
      // Some Chromium versions never emit loadingFinished for HEAD. A
      // responseReceived status is the relevant proof the metadata probe replied.
      headRespondedCount: rows.filter((row) => row.kind === "document" && row.method === "HEAD" && row.status !== null).length,
      headResponseStatuses: rows.filter((row) => row.kind === "document" && row.method === "HEAD" && row.status !== null).map((row) => row.status!),
      documentGetCount: documentGets.length,
      fullDocumentGetCount: documentGets.filter((row) => !row.range).length,
      rangedDocumentGetCount: documentGets.filter((row) => row.range).length,
      documentGetStatuses: documentGets.map((row) => row.status),
      documentGetWireBytes: sum(documentGets),
      tileGetCount: tileGets.length,
      tileGetWireBytes: sum(tileGets),
      metadataGetCount: metaGets.length,
      metadataGetWireBytes: sum(metaGets),
      totalPdfGetWireBytes: sum(allGets),
      maxTileLevel: Math.max(0, ...tileGets.map((row) => row.level ?? 0)),
      pendingPdfGets: allGets.filter((row) => !row.finished && !row.failed).length,
      pendingTileGets: tileGets.filter((row) => !row.finished && !row.failed).length,
      completedTileGets: tileGets.filter((row) => row.finished).length,
      canceledTileGets: tileGets.filter((row) => row.canceled).length,
      failedPdfGets: allGets.filter((row) => row.failed && !row.canceled).length,
    };
  }

  return { snapshot, close: () => session.detach() };
}
