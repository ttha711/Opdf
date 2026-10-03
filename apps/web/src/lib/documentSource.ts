export type PdfSource = Blob | Uint8Array | string | null;

export function getServerDocumentUrl(
  identity: string,
  baseUrl = typeof window !== "undefined"
    ? (window.__OPDF_SERVER_BASE__ || "/api/opdf")
    : "/api/opdf",
) {
  const match = /^server:\/\/([0-9a-f-]{36})\//i.exec(identity);
  if (!match) return null;
  return `${baseUrl.replace(/\/$/, "")}/documents/${match[1]}`;
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
  if (sourceBlob) return sourceBlob;
  if (docBytes) return docBytes;
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
