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
import { getNativeEditRevisionKey } from "./native-edit/revisionKey";
import "../styles/native-edit-surface.css";

const EDIT_DOCUMENT_ID = "tpdf-native-edit-document";

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function serverApiBase(documentUrl: string) {
  const url = new URL(documentUrl, window.location.href);
  url.pathname = url.pathname.replace(/\/documents\/[0-9a-f-]{36}$/i, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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
  const [remoteRenderAvailable, setRemoteRenderAvailable] = useState<{ source: string; value: boolean } | null>(null);
  const initialSourceUrlRef = useRef<string | null>(null);
  const pinnedPointsRef = useRef<NativeEditPinnedPoints | null>(null);
  const serverUrl = useMemo(
    () => sourceIdentity.startsWith("server://") ? getServerDocumentUrl(sourceIdentity) : null,
    [sourceIdentity],
  );
  const matchingBuffer = initialBuffer?.sourceUrl === (localUrl ?? serverUrl) ? initialBuffer.buffer : null;
  const currentBytes = data?.byteLength ?? sourceBlob?.size ?? matchingBuffer?.byteLength ?? 0;
  const isLargeServerPdf = currentBytes >= 100 * 1024 * 1024 && Boolean(serverUrl);

  useEffect(() => {
    if (isLargeServerPdf) {
      setLocalUrl(null);
      return;
    }
    const blob = data ? new Blob([data as unknown as BlobPart], { type: "application/pdf" }) : sourceBlob;
    if (!blob) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, isLargeServerPdf, sourceBlob]);

  const sourceUrl = localUrl ?? serverUrl;
  const revisionKey = isLargeServerPdf && data
    ? matchingBuffer === data.buffer ? sourceUrl ?? "" : getNativeEditRevisionKey(data.buffer as ArrayBuffer)
    : sourceUrl ?? "";
  useEffect(() => { pinnedPointsRef.current = null; }, [sourceIdentity]);
  if (!initialSourceUrlRef.current && sourceUrl) {
    initialSourceUrlRef.current = sourceUrl;
  }
  const initialSourceUrl = initialSourceUrlRef.current;
  const needsServerBuffer = Boolean(sourceIdentity.startsWith("server://") && !sourceBlob && !data);
  const previewBase = isLargeServerPdf && serverUrl && remoteRenderAvailable?.source === serverUrl && remoteRenderAvailable.value
    ? `${serverApiBase(serverUrl)}/native-edit-previews`
    : null;

  useEffect(() => {
    if (!isLargeServerPdf || !serverUrl) return;
    const controller = new AbortController();
    setRemoteRenderAvailable(null);
    const healthUrl = `${serverApiBase(serverUrl)}/health`;
    void fetch(healthUrl, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((health) => {
        if (!controller.signal.aborted) {
          setRemoteRenderAvailable({ source: serverUrl, value: health?.capabilities?.remoteRendering === true });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemoteRenderAvailable({ source: serverUrl, value: false });
      });
    return () => controller.abort();
  }, [isLargeServerPdf, serverUrl]);

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
            skipRevisionReload={isLargeServerPdf}
            revisionKey={revisionKey}
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
                    revisionKey={revisionKey}
                    pinnedPointsRef={pinnedPointsRef}
                    getDocumentBytes={getDocumentBytes}
                    remoteRenderBase={previewBase}
                    disableNativeRender={isLargeServerPdf}
                    onDocumentLoaded={onDocumentLoaded}
                    onActivePageChange={onActivePageChange}
                    onViewerScaleChange={onViewerScaleChange}
                  />
                );
              }}
            </DocumentContent>
          ) : <div className="native-edit-loading">Opening PDF…</div>}
          <NativeEditPaintShield revisionKey={revisionKey} activeDocumentId={activeDocumentId} />
        </div>
      )}
    </EmbedPDF>
  );
}
