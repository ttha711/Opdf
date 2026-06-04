type FingerprintInput = {
  fileName: string;
  docBytes: Uint8Array | null;
  annotations?: unknown;
  bookmarks?: unknown;
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
  for (let i = 0; i < bytes.length; i++) {
    hash = fnv1aUpdate(hash, bytes[i]);
  }
  return hash;
}

export function buildDocumentFingerprint({
  fileName,
  docBytes,
  annotations = [],
  bookmarks = [],
  pageRotations = {},
}: FingerprintInput): string {
  if (!fileName || !docBytes) return "";

  let hash = 0x811c9dc5;
  hash = hashString(hash, fileName);
  hash = hashBytes(hash, docBytes);
  hash = hashString(hash, JSON.stringify(annotations));
  hash = hashString(hash, JSON.stringify(bookmarks));
  hash = hashString(hash, JSON.stringify(pageRotations));
  return hash.toString(36);
}
