import { useEffect, useRef } from "react";
import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";

type Props = {
  baseDocumentId: string;
  initialRevisionKey: string;
  revisionKey: string;
  data: Uint8Array | null;
  sourceBlob: Blob | null;
  sourceUrl: string;
  onError?: (message: string | null) => void;
};

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function NativeEditDocumentRevisionBridge({
  baseDocumentId,
  initialRevisionKey,
  revisionKey,
  data,
  sourceBlob,
  sourceUrl,
  onError,
}: Props) {
  const { provides: documentManager } = useDocumentManagerCapability();
  const revisionRef = useRef(initialRevisionKey);
  const sequenceRef = useRef(1);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (!documentManager || !revisionKey || revisionKey === revisionRef.current) return;

    const targetRevision = revisionKey;
    const runRefresh = async () => {
      if (targetRevision === revisionRef.current) return;
      const previousId = documentManager.getActiveDocumentId();
      const documentId = `${baseDocumentId}-r${sequenceRef.current++}`;

      if (data) {
        await documentManager.openDocumentBuffer({
          buffer: exactArrayBuffer(data),
          name: "edited.pdf",
          documentId,
          autoActivate: false,
        }).toPromise();
      } else if (sourceBlob) {
        await documentManager.openDocumentBuffer({
          buffer: await sourceBlob.arrayBuffer(),
          name: "edited.pdf",
          documentId,
          autoActivate: false,
        }).toPromise();
      } else {
        await documentManager.openDocumentUrl({
          url: sourceUrl,
          documentId,
          autoActivate: false,
        }).toPromise();
      }

      documentManager.setActiveDocument(documentId);
      revisionRef.current = targetRevision;
      if (previousId && previousId !== documentId) {
        await documentManager.closeDocument(previousId).toPromise();
      }
    };

    const run = queueRef.current.then(runRefresh, runRefresh);
    queueRef.current = run.then(() => undefined, () => undefined);
    void run.catch((reason) => {
      onError?.(reason instanceof Error ? reason.message : String(reason));
    });
  }, [baseDocumentId, data, documentManager, onError, revisionKey, sourceBlob, sourceUrl]);

  return null;
}
