import { useEffect, useRef } from "react";
import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";

type Props = {
  documentId: string;
  buffer: ArrayBuffer | null;
  sourceUrl: string;
  onError: (message: string) => void;
};

/** Open the first document after the headless document manager is ready. */
export function NativeEditInitialDocument({ documentId, buffer, sourceUrl, onError }: Props) {
  const { provides: manager } = useDocumentManagerCapability();
  const started = useRef(false);

  useEffect(() => {
    if (!manager || started.current) return;
    started.current = true;
    const request = buffer
      ? manager.openDocumentBuffer({
          buffer: buffer.slice(0),
          name: "editable.pdf",
          documentId,
          autoActivate: true,
        })
      : manager.openDocumentUrl({ url: sourceUrl, documentId, autoActivate: true });

    void request.toPromise().catch((reason) => {
      onError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [buffer, documentId, manager, onError, sourceUrl]);

  return null;
}
