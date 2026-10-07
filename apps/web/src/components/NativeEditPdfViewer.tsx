import { useEffect, useMemo, useRef, useState } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  DocumentContent,
  DocumentManagerPluginPackage,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { getServerDocumentUrl } from "../lib/documentSource";
import { registerNativeEditRendererRefresher } from "../lib/nativeEditRuntime";
import { NativeEditDocument } from "./native-edit/NativeEditDocument";
import "../styles/native-edit-surface.css";

const EDIT_DOCUMENT_ID = "opdf-native-edit-document";

async function taskToPromise<T>(task: any): Promise<T> {
  if (typeof task?.toPromise === "function") return task.toPromise();
  return Promise.resolve(task);
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

type RuntimeProps = Pick<
  PdfViewerProps,
  | "page"
  | "scale"
  | "getDocumentBytes"
  | "onDocumentLoaded"
  | "onActivePageChange"
  | "onViewerScaleChange"
> & {
  activeDocumentId: string | null;
};

function NativeEditRuntimeDocument({
  activeDocumentId,
  page,
  scale,
  getDocumentBytes,
  onDocumentLoaded,
  onActivePageChange,
  onViewerScaleChange,
}: RuntimeProps) {
  const { provides: documentManager } = useDocumentManagerCapability();
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!documentManager) return;
    return registerNativeEditRendererRefresher(async (bytes) => {
      const previousId = documentManager.getActiveDocumentId?.() ?? null;
      const nextId = `${EDIT_DOCUMENT_ID}-revision-${++revisionRef.current}`;
      await taskToPromise(documentManager.openDocumentBuffer({
        buffer: exactArrayBuffer(bytes),
        name: "OPDF edited document",
        documentId: nextId,
        autoActivate: true,
      }));
      documentManager.setActiveDocument?.(nextId);
      if (previousId && previousId !== nextId) {
        try {
          await taskToPromise(documentManager.closeDocument(previousId));
        } catch {
          // The new loaded revision is already active; stale revision cleanup is best-effort.
        }
      }
    });
  }, [documentManager]);

  if (!activeDocumentId) {
    return <div className="native-edit-loading">Opening PDF…</div>;
  }

  return (
    <DocumentContent documentId={activeDocumentId}>
      {({ isLoaded, isError }) => {
        if (isError) return <div className="native-edit-error">Unable to load PDF for editing.</div>;
        if (!isLoaded) return <div className="native-edit-loading">Preparing editable pages…</div>;
        return (
          <NativeEditDocument
            documentId={activeDocumentId}
            page={page}
            scale={scale}
            revisionKey={activeDocumentId}
            getDocumentBytes={getDocumentBytes!}
            onDocumentLoaded={onDocumentLoaded}
            onActivePageChange={onActivePageChange}
            onViewerScaleChange={onViewerScaleChange}
          />
        );
      }}
    </DocumentContent>
  );
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
}: PdfViewerProps) {
  const { engine, isLoading, error: engineError } = usePdfiumEngine();
  const serverUrl = useMemo(
    () => sourceIdentity.startsWith("server://") ? getServerDocumentUrl(sourceIdentity) : null,
    [sourceIdentity],
  );
  const [sessionSource] = useState(() => {
    const blob = sourceBlob ?? (data
      ? new Blob([data as unknown as BlobPart], { type: "application/pdf" })
      : null);
    if (blob) {
      return { url: URL.createObjectURL(blob), revoke: true };
    }
    return { url: serverUrl, revoke: false };
  });
  const viewerInstanceRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `native-${Date.now()}-${Math.random()}`,
  );

  useEffect(() => () => {
    if (sessionSource.revoke && sessionSource.url) URL.revokeObjectURL(sessionSource.url);
  }, [sessionSource]);

  useEffect(() => {
    if (engineError) onError?.(engineError.message);
  }, [engineError, onError]);

  const plugins = useMemo(() => {
    if (!sessionSource.url) return [];
    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{
          url: sessionSource.url,
          documentId: EDIT_DOCUMENT_ID,
          autoActivate: true,
        }],
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
  }, [sessionSource.url]);

  if (!sessionSource.url) {
    return <div className="native-edit-error">No PDF source is available for editing.</div>;
  }
  if (isLoading || !engine) {
    return <div className="native-edit-loading">Loading native PDF editor…</div>;
  }
  if (engineError) {
    return <div className="native-edit-error">{engineError.message}</div>;
  }
  if (!getDocumentBytes) {
    return <div className="native-edit-error">Native editor bytes provider is unavailable.</div>;
  }

  return (
    <div
      className="h-full min-h-0"
      data-opdf-native-viewer-root="true"
      data-opdf-native-viewer-instance={viewerInstanceRef.current}
    >
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) => (
          <NativeEditRuntimeDocument
            activeDocumentId={activeDocumentId}
            page={page}
            scale={scale}
            getDocumentBytes={getDocumentBytes}
            onDocumentLoaded={onDocumentLoaded}
            onActivePageChange={onActivePageChange}
            onViewerScaleChange={onViewerScaleChange}
          />
        )}
      </EmbedPDF>
    </div>
  );
}
