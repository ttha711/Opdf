type FingerprintInput = {
  fileName: string;
  docBytes: Uint8Array | null;
  documentIdentity?: string;
  annotations?: unknown;
  pageRotations?: unknown;
};

function fnv1aUpdate(hash: number, value: number) {
  hash ^= value & 0xff;
  return Math.imul(hash, 16777619) >>> 0;
}

function hashString(hash: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    hash = fnv1aUpdate(hash, text.charCodeAt(i));
  }
  return hash;
}

function hashBytes(hash: number, bytes: Uint8Array) {
  // Dirty-state checks run whenever document metadata changes. Scanning an
  // entire 300+ MB PDF here stalls the main thread, so keep the fingerprint
  // bounded by sampling at most 4096 bytes plus the document length.
  const sampleCount = Math.min(4096, bytes.length);
  const step = sampleCount > 0 ? Math.max(1, Math.floor(bytes.length / sampleCount)) : 1;
  hash = hashString(hash, String(bytes.length));
  for (let i = 0, seen = 0; i < bytes.length && seen < sampleCount; i += step, seen += 1) {
    hash = fnv1aUpdate(hash, bytes[i]);
  }
  return hash;
}

export function buildDocumentFingerprint({
  fileName,
  docBytes,
  documentIdentity = "",
  annotations = [],
  pageRotations = {},
}: FingerprintInput): string {
  if (!fileName || (!docBytes && !documentIdentity)) return "";

  let hash = 0x811c9dc5;
  hash = hashString(hash, fileName);
  hash = docBytes ? hashBytes(hash, docBytes) : hashString(hash, documentIdentity);
  hash = hashString(hash, JSON.stringify(annotations));
  hash = hashString(hash, JSON.stringify(pageRotations));
  return hash.toString(36);
}
