import { computeBlobHash } from "./web-storage";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SERVER_IDENTITY_RE = new RegExp(`^server:\\/\\/(${UUID})\\/(.+)$`, "i");
const API_DOCUMENT_RE = new RegExp(`(?:^|/)api/opdf/documents/(${UUID})(?:/|$)`, "i");
const STORAGE_DOCUMENT_RE = new RegExp(`(?:^|[\\\\/])documents[\\\\/](${UUID})(?:[\\\\/]|$)`, "i");

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function leafName(value: string) {
  const clean = value.split(/[?#]/, 1)[0] ?? value;
  return safeDecode(clean.split(/[\\/]/).pop() || "");
}

export function normalizeServerDocumentReference(reference: string) {
  const direct = SERVER_IDENTITY_RE.exec(reference);
  if (direct) {
    return {
      identity: reference,
      id: direct[1],
      displayName: safeDecode(direct[2].split(/[?#]/, 1)[0] || "document.pdf"),
    };
  }

  let pathname = reference;
  try {
    pathname = new URL(reference, "https://opdf.invalid").pathname;
  } catch {
    // Keep the raw reference for local storage-path matching.
  }

  const api = API_DOCUMENT_RE.exec(pathname);
  const storage = STORAGE_DOCUMENT_RE.exec(reference.replaceAll("\\", "/"));
  const id = api?.[1] ?? storage?.[1];
  if (!id) return null;

  const rawLeaf = leafName(reference);
  const displayName =
    rawLeaf && rawLeaf.toLowerCase() !== id.toLowerCase() && rawLeaf !== "document.pdf"
      ? rawLeaf
      : "document.pdf";

  return {
    identity: `server://${id}/${encodeURIComponent(displayName)}`,
    id,
    displayName,
  };
}

export async function resolveBrowserDocumentReference(
  reference: string,
  {
    allowViteFs = import.meta.env.DEV,
    fetchImpl = fetch,
  }: {
    allowViteFs?: boolean;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const server = normalizeServerDocumentReference(reference);
  if (server) {
    return {
      identity: server.identity,
      displayName: server.displayName,
      blob: null as Blob | null,
      isServerDocument: true,
    };
  }

  if (!allowViteFs) {
    throw new Error("Local filesystem paths are only available in Desktop or Vite development mode.");
  }

  const normalizedPath = reference.replaceAll("\\", "/");
  const response = await fetchImpl(`/@fs/${normalizedPath}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when trying to load file`);
  }
  const blob = await response.blob();
  const displayName = leafName(reference) || "document.pdf";
  const identity = await computeBlobHash(blob, displayName, 0);

  return {
    identity,
    displayName,
    blob,
    isServerDocument: false,
  };
}
