import { useEffect, useMemo, useState } from "react";

type PageSize = { width: number; height: number };
type Props = {
  pageIndex: number;
  width: number;
  height: number;
  enabled: boolean;
  revisionKey: string;
  previewBase: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
};

const TILE = 512;
const LEVELS = [0.25, 0.5, 1, 2, 4] as const;
type Preview = { id: string; pages: PageSize[]; expiresAt: number };
const previewRequests = new Map<string, { promise: Promise<Preview>; expiresAt: number; token: symbol }>();

function getPreview(revisionKey: string, previewBase: string, getDocumentBytes: Props["getDocumentBytes"]) {
  const key = `${previewBase}:${revisionKey}`;
  const cached = previewRequests.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  previewRequests.delete(key);
  for (const [otherKey, entry] of previewRequests) {
    if (entry.expiresAt <= Date.now()) previewRequests.delete(otherKey);
  }
  while (previewRequests.size >= 3) previewRequests.delete(previewRequests.keys().next().value!);
  const token = Symbol(key);
  const request = (async () => {
    const bytes = await getDocumentBytes();
    if (!bytes) throw new Error("Unable to read the edited PDF revision.");
    const response = await fetch(previewBase, {
      method: "POST", headers: { "Content-Type": "application/pdf" }, body: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    });
    if (!response.ok) throw new Error(`Preview upload failed (HTTP ${response.status}).`);
    const { id, expiresInMs } = await response.json() as { id: string; expiresInMs: number };
    const metadata = await fetch(`${previewBase}/${id}/render/meta`, { cache: "no-store" });
    if (!metadata.ok) throw new Error(`Preview metadata failed (HTTP ${metadata.status}).`);
    const document = await metadata.json() as { pages: PageSize[] };
    const expiresAt = Date.now() + Math.max(1000, expiresInMs - 5000);
    const entry = previewRequests.get(key);
    if (entry?.token === token) entry.expiresAt = expiresAt;
    return { id, pages: document.pages, expiresAt };
  })();
  previewRequests.set(key, { promise: request, expiresAt: Date.now() + 60_000, token });
  void request.catch(() => { if (previewRequests.get(key)?.promise === request) previewRequests.delete(key); });
  return request;
}

/** Bounded server tiles keep large vector pages out of the browser PDFium bitmap path. */
export function NativeEditRemoteRaster({
  pageIndex, width, height, enabled, revisionKey, previewBase, getDocumentBytes,
}: Props) {
  const [preview, setPreview] = useState<(Preview & { revision: string }) | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError("");
    setPreview(null);
    void getPreview(revisionKey, previewBase, getDocumentBytes).then((document) => {
      if (!cancelled) {
        setPreview({ revision: revisionKey, ...document });
        timer = setTimeout(() => setRefresh((value) => value + 1), Math.max(1000, document.expiresAt - Date.now()));
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, getDocumentBytes, previewBase, revisionKey, refresh]);

  const pageSize = preview?.revision === revisionKey ? preview.pages[pageIndex] : null;
  const scale = pageSize ? width / Math.max(1, pageSize.width) : 1;
  const level = LEVELS.find((candidate) => candidate >= scale) ?? 4;
  const tiles = useMemo(() => {
    if (!preview || !pageSize || !enabled) return [];
    const cols = Math.ceil(pageSize.width * level / TILE);
    const rows = Math.ceil(pageSize.height * level / TILE);
    return Array.from({ length: cols * rows }, (_, index) => {
      const x = index % cols;
      const y = Math.floor(index / cols);
      const unit = TILE / level;
      return {
        key: `${x}:${y}`,
        src: `${previewBase}/${preview.id}/render/tile?page=${pageIndex}&level=${level}&x=${x}&y=${y}`,
        left: x * unit * scale,
        top: y * unit * scale,
        width: Math.min(unit, pageSize.width - x * unit) * scale,
        height: Math.min(unit, pageSize.height - y * unit) * scale,
      };
    });
  }, [enabled, level, pageIndex, pageSize, preview, previewBase, scale]);

  return <div aria-label="Edited PDF page preview" data-tpdf-native-edit-remote-raster="true"
    style={{ position: "absolute", inset: 0, width, height, overflow: "hidden", pointerEvents: "none", background: "white" }}>
    {tiles.map((tile) => <img key={tile.key} src={tile.src} alt="" draggable={false}
      onError={() => setError("A preview tile could not be loaded.")}
      style={{ position: "absolute", left: tile.left, top: tile.top, width: tile.width, height: tile.height }} />)}
    {enabled && error && <span role="status" className="native-edit-error">Unable to render edited page: {error}</span>}
  </div>;
}
