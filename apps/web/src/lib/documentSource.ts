export type PdfSource = Blob | Uint8Array | string | null;

export function getServerDocumentUrl(
  identity: string,
  baseUrl = typeof window !== "undefined"
    ? (window.__TPDF_SERVER_BASE__ || "/api/tpdf")
    : "/api/tpdf",
) {
  const match = /^server:\/\/([0-9a-f-]{36})\//i.exec(identity);
  if (!match) return null;
  const revision = /[?&]v=(\d+)/.exec(identity)?.[1];
  const url = `${baseUrl.replace(/\/$/, "")}/documents/${match[1]}`;
  return revision ? `${url}?v=${encodeURIComponent(revision)}` : url;
}

export function resolvePdfSource({
  sourceBlob,
  docBytes,
  sourceIdentity,
  serverBaseUrl,
}: {
  sourceBlob?: Blob | null;
  docBytes?: Uint8Array | null;
  sourceIdentity?: string | null;
  serverBaseUrl?: string;
}): PdfSource {
  // Edited working bytes take precedence over the original uploaded File.
  if (docBytes) return docBytes;
  if (sourceBlob) return sourceBlob;
  if (!sourceIdentity) return null;
  return getServerDocumentUrl(sourceIdentity, serverBaseUrl);
}

export async function pdfSourceToBytes(source: PdfSource): Promise<Uint8Array> {
  if (!source) throw new Error("No PDF loaded.");
  if (source instanceof Uint8Array) return source;
  if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load PDF source (HTTP ${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
