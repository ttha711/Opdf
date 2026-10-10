import { useEffect, useMemo, useRef, useState } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { pdfiumRuntimeFontFallback, pdfiumRuntimeWasmUrl } from "../lib/pdfiumRuntimeAssets";
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
import { NativeEditDocument } from "./native-edit/NativeEditDocument";
import { NativeEditDocumentRevisionBridge } from "./native-edit/NativeEditDocumentRevisionBridge";
import { NativeEditPaintShield } from "./native-edit/NativeEditPaintShield";
import { NativeEditInitialDocument } from "./native-edit/NativeEditInitialDocument";
import "../styles/native-edit-surface.css";

const EDIT_DOCUMENT_ID = "opdf-native-edit-document";

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
}: PdfViewerProps) {
  const { engine, isLoading, error: engineError } = usePdfiumEngine({
    wasmUrl: pdfiumRuntimeWasmUrl,
    fontFallback: pdfiumRuntimeFontFallback,
  });
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [initialBuffer, setInitialBuffer] = useState<ArrayBuffer | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const initialSourceUrlRef = useRef<string | null>(null);
  const serverUrl = useMemo(
    () => sourceIdentity.startsWith("server://") ? getServerDocumentUrl(sourceIdentity) : null,
    [sourceIdentity],
  );

  useEffect(() => {
    const blob = sourceBlob ?? (data
      ? new Blob([data as unknown as BlobPart], { type: "application/pdf" })
      : null);
    if (!blob) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, sourceBlob]);

  // Browser uploads live in sourceBlob, not data. Give the editor its own
  // immutable PDF buffer instead of opening a transient object URL. The
  // headless document manager can otherwise remain in "loading" indefinitely.
  useEffect(() => {
    let cancelled = false;
    if (initialBuffer || (!data && !sourceBlob)) return;
    const read = data
      ? Promise.resolve(data.slice().buffer as ArrayBuffer)
      : sourceBlob!.arrayBuffer();
    void read.then((buffer) => {
      if (!cancelled) setInitialBuffer((current) => current ?? buffer);
    }).catch((reason) => {
      if (!cancelled) onError?.(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [data, initialBuffer, onError, sourceBlob]);

  useEffect(() => {
    if (engineError) onError?.(engineError.message);
  }, [engineError, onError]);

  const sourceUrl = localUrl ?? serverUrl;
  if (!initialSourceUrlRef.current && sourceUrl) {
    initialSourceUrlRef.current = sourceUrl;
  }
  const initialSourceUrl = initialSourceUrlRef.current;

  const plugins = useMemo(() => {
    if (!initialSourceUrl) return [];
    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [],
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
  }, [initialSourceUrl]);

  if (!sourceUrl || !initialSourceUrl) {
    return <div className="native-edit-error">No PDF source is available for editing.</div>;
  }
  if (isLoading || !engine || ((data || sourceBlob) && !initialBuffer)) {
    return <div className="native-edit-loading">Loading native PDF editor…</div>;
  }
  if (engineError) {
    return <div className="native-edit-error">{engineError.message}</div>;
  }
  if (!getDocumentBytes) {
    return <div className="native-edit-error">Native editor bytes provider is unavailable.</div>;
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) => (
        <div className="native-edit-surface">
          <NativeEditInitialDocument
            documentId={EDIT_DOCUMENT_ID}
            buffer={initialBuffer}
            sourceUrl={initialSourceUrl}
            onError={setOpenError}
          />
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
          {openError ? (
            <div role="alert" className="native-edit-error">Unable to open editable PDF: {openError}</div>
          ) : activeDocumentId ? (
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
