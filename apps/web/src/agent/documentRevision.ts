import { buildDocumentFingerprint } from "../lib/documentFingerprint";

const objectIds = new WeakMap<object, number>();
let nextId = 0;

function identity(value: object | null | undefined): number {
  if (!value) return 0;
  let id = objectIds.get(value);
  if (!id) {
    id = ++nextId;
    objectIds.set(value, id);
  }
  return id;
}

/** In-memory optimistic concurrency token. Changes whenever React replaces a document,
 * annotations or tab; also samples bytes and viewer edits for in-place changes.
 * The token is not a persistence key or a cryptographic document checksum. */
export function agentDocumentRevision(input: {
  hasDocument: boolean;
  fileName: string;
  activeTabId: string | null;
  sourceIdentity: string;
  docBytes: Uint8Array | null;
  sourceBlob: Blob | null;
  annotations: unknown[];
  viewerEditRevision: number;
}): string {
  if (!input.hasDocument) return "";
  return JSON.stringify([
    input.activeTabId,
    input.fileName,
    input.sourceIdentity,
    identity(input.docBytes),
    identity(input.sourceBlob),
    identity(input.annotations),
    buildDocumentFingerprint({
      fileName: input.fileName,
      docBytes: input.docBytes,
      documentIdentity: input.sourceIdentity,
      annotations: input.annotations,
      viewerRevision: input.viewerEditRevision,
    }),
  ]);
}
