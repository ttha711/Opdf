import { useEffect, useMemo, useRef, useState } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from "@embedpdf/plugin-document-manager/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { getServerDocumentUrl } from "../lib/documentSource";
import type { NativeEditEngine } from "./native-edit/NativeEditEnginePreloader";
import { NativeEditDocument } from "./native-edit/NativeEditDocument";
import { NativeEditDocumentRevisionBridge } from "./native-edit/NativeEditDocumentRevisionBridge";
import { NativeEditPaintShield } from "./native-edit/NativeEditPaintShield";
import type { NativeEditPinnedPoints } from "./native-edit/NativeEditSelectionLayer";
import "../styles/native-edit-surface.css";

const EDIT_DOCUMENT_ID = "tpdf-native-edit-document";

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function NativeEditPdfViewer({
  data,
  sourceBlob = null,
  sourceIdentity = "",
  page,
  scale,
  getDocumentBytes,
  onDocumentLoaded,
  onError,
  onActivePageChange,
  onViewerScaleChange,
  engine,
}: PdfViewerProps & { engine: NativeEditEngine }) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [initialBuffer, setInitialBuffer] = useState<{ sourceUrl: string; buffer: ArrayBuffer } | null>(null);
  const [initialBufferError, setInitialBufferError] = useState<string | null>(null);
  const initialSourceUrlRef = useRef<string | null>(null);
  const pinnedPointsRef = useRef<NativeEditPinnedPoints | null>(null);
  const serverUrl = useMemo(
    () => sourceIdentity.startsWith("server://") ? getServerDocumentUrl(sourceIdentity) : null,
    [sourceIdentity],
  );

  useEffect(() => {
    const blob = data ? new Blob([data as unknown as BlobPart], { type: "application/pdf" }) : sourceBlob;
    if (!blob) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, sourceBlob]);

  const sourceUrl = localUrl ?? serverUrl;
  useEffect(() => { pinnedPointsRef.current = null; }, [sourceIdentity]);
  if (!initialSourceUrlRef.current && sourceUrl) {
    initialSourceUrlRef.current = sourceUrl;
  }
  const initialSourceUrl = initialSourceUrlRef.current;
  const needsServerBuffer = Boolean(sourceIdentity.startsWith("server://") && !sourceBlob && !data);
  const matchingBuffer = initialBuffer?.sourceUrl === initialSourceUrl ? initialBuffer.buffer : null;

  useEffect(() => {
    if (!needsServerBuffer || !initialSourceUrl || !getDocumentBytes) return;
    let cancelled = false;
    setInitialBufferError(null);
    void getDocumentBytes().then((bytes) => {
      if (!bytes) throw new Error("Unable to read the current PDF.");
      if (!cancelled) setInitialBuffer({ sourceUrl: initialSourceUrl, buffer: exactArrayBuffer(bytes) });
    }).catch((error: unknown) => {
      if (!cancelled) setInitialBufferError(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [getDocumentBytes, initialSourceUrl, needsServerBuffer]);

  const plugins = useMemo(() => {
    if (!initialSourceUrl) return [];
    const initialDocument = matchingBuffer
      ? { buffer: matchingBuffer, name: "document.pdf", documentId: EDIT_DOCUMENT_ID, autoActivate: true }
      : { url: initialSourceUrl, documentId: EDIT_DOCUMENT_ID, autoActivate: true };
    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [initialDocument],
        maxDocuments: 2,
      }),
      createPluginRegistration(ViewportPluginPackage, { viewportGap: 20 }),
      createPluginRegistration(ScrollPluginPackage, { defaultPageGap: 16 }),
      createPluginRegistration(RenderPluginPackage, {
        withForms: true,
        withAnnotations: true,
      }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.Automatic,
        minZoom: 0.05,
        maxZoom: 5,
      }),
    ];
  }, [initialSourceUrl, matchingBuffer]);

  if (!sourceUrl || !initialSourceUrl) {
    return <div className="native-edit-error">No PDF source is available for editing.</div>;
  }
  if (!getDocumentBytes) {
    return <div className="native-edit-error">Native editor bytes provider is unavailable.</div>;
  }
  if (needsServerBuffer && !matchingBuffer) {
    return initialBufferError
      ? <div className="native-edit-error" role="alert">{initialBufferError}</div>
      : <div className="native-edit-loading">Loading PDF data for text editing…</div>;
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) => (
        <div className="native-edit-surface">
          <NativeEditDocumentRevisionBridge
            baseDocumentId={EDIT_DOCUMENT_ID}
            initialRevisionKey={initialSourceUrl}
            revisionKey={sourceUrl}
            data={data}
            sourceBlob={sourceBlob}
            sourceUrl={sourceUrl}
            onError={(message) => {
              if (message) onError?.(message);
            }}
          />
          {activeDocumentId ? (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded, isError }) => {
                if (isError) return <div className="native-edit-error">Unable to load PDF for editing.</div>;
                if (!isLoaded) return <div className="native-edit-loading">Preparing editable pages…</div>;
                return (
                  <NativeEditDocument
                    documentId={activeDocumentId}
                    page={page}
                    scale={scale}
                    revisionKey={sourceUrl}
                    pinnedPointsRef={pinnedPointsRef}
                    getDocumentBytes={getDocumentBytes}
                    onDocumentLoaded={onDocumentLoaded}
                    onActivePageChange={onActivePageChange}
                    onViewerScaleChange={onViewerScaleChange}
                  />
                );
              }}
            </DocumentContent>
          ) : <div className="native-edit-loading">Opening PDF…</div>}
          <NativeEditPaintShield revisionKey={sourceUrl} activeDocumentId={activeDocumentId} />
        </div>
      )}
    </EmbedPDF>
  );
}
