import { useEffect, useMemo, useRef, useState } from "react";
import {
  PDFViewer as EmbedPdfViewer,
  type PDFViewerRef,
  ZoomMode,
} from "@embedpdf/react-pdf-viewer";
import type { PdfViewerProps } from "./PdfViewer.types";
import { registerViewerBytesProvider, registerViewerControls } from "../lib/viewer-runtime";

const DOCUMENT_ID = "opdf-active-document";

function getServerDocumentUrl(identity: string) {
  const match = /^server:\/\/([0-9a-f-]{36})\//i.exec(identity);
  if (!match) return null;
  const baseUrl = window.__OPDF_SERVER_BASE__ || "/api/opdf";
  return `${baseUrl}/documents/${match[1]}`;
}

function mapAnnotationTool(activeTool?: string) {
  switch (activeTool) {
    case "highlight":
      return "highlight";
    case "underline":
      return "underline";
    case "strike":
      return "strikeout";
    case "shape":
      return "square";
    case "note":
      return "text";
    default:
      return null;
  }
}

export function PdfViewer({
  data,
  sourceBlob = null,
  sourceIdentity = "",
  page,
  scale,
  activeTool = "select",
  onDocumentLoaded,
  onSearchResult,
  onError,
  onActivePageChange,
  onViewerDirty,
  onViewerScaleChange,
}: PdfViewerProps) {
  const viewerRef = useRef<PDFViewerRef>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const suppressExternalPageRef = useRef(false);
  const lastPageRef = useRef(page);
  const lastScaleRef = useRef(scale);

  const serverUrl = useMemo(
    () => (sourceIdentity.startsWith("server://") ? getServerDocumentUrl(sourceIdentity) : null),
    [sourceIdentity],
  );

  useEffect(() => {
    if (serverUrl) {
      setLocalUrl(null);
      return;
    }

    const blob = sourceBlob ?? (data ? new Blob([data as unknown as BlobPart], { type: "application/pdf" }) : null);
    if (!blob) {
      setLocalUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, sourceBlob, serverUrl]);

  const sourceUrl = serverUrl ?? localUrl;

  const config = useMemo(() => {
    if (!sourceUrl) return null;
    return {
      documentManager: {
        initialDocuments: [
          {
            url: sourceUrl,
            documentId: DOCUMENT_ID,
            autoActivate: true,
          },
        ],
        maxDocuments: 1,
      },
      tabBar: "never",
      theme: { preference: "light" },
      annotation: { annotationAuthor: "OPDF" },
      pan: { defaultMode: "mobile" },
      zoom: {
        defaultZoomLevel: Math.max(0.05, Math.min(5, scale)),
        minZoom: 0.05,
        maxZoom: 5,
      },
      scroll: {
        defaultPageGap: 16,
      },
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) return;

    let cancelled = false;
    const unsubscribers: Array<() => void> = [];
    let timer = 0;

    const connect = async (attempt = 0) => {
      if (cancelled) return;
      const registry = await viewerRef.current?.registry;
      if (!registry) {
        if (attempt < 40) {
          timer = window.setTimeout(() => void connect(attempt + 1), 50);
        }
        return;
      }

      const scroll = registry.getPlugin?.("scroll")?.provides?.() as any;
      const documentManager = registry.getPlugin?.("document-manager")?.provides?.() as any;
      const exportApi = registry.getPlugin?.("export")?.provides?.() as any;
      const annotationApi = registry.getPlugin?.("annotation")?.provides?.() as any;
      const formApi = registry.getPlugin?.("form")?.provides?.() as any;
      const zoomApi = registry.getPlugin?.("zoom")?.provides?.() as any;
      const rotateApi = registry.getPlugin?.("rotate")?.provides?.() as any;

      const zoomScope = zoomApi?.forDocument?.(DOCUMENT_ID) ?? zoomApi;
      const rotateScope = rotateApi?.forDocument?.(DOCUMENT_ID) ?? rotateApi;
      const unregisterControls = registerViewerControls({
        zoomIn: () => zoomScope?.zoomIn?.(),
        zoomOut: () => zoomScope?.zoomOut?.(),
        resetZoom: () => zoomScope?.requestZoom?.(1),
        fitWidth: () => zoomScope?.requestZoom?.(ZoomMode.FitWidth),
        fitPage: () => zoomScope?.requestZoom?.(ZoomMode.FitPage),
        rotateForward: () => rotateScope?.rotateForward?.(),
        rotateBackward: () => rotateScope?.rotateBackward?.(),
      });
      unsubscribers.push(unregisterControls);

      if (zoomScope?.onStateChange) {
        const off = zoomScope.onStateChange((state: any) => {
          const next = state?.currentZoomLevel;
          if (typeof next !== "number" || !Number.isFinite(next)) return;
          lastScaleRef.current = next;
          onViewerScaleChange?.(next);
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const exportScope = exportApi?.forDocument?.(DOCUMENT_ID) ?? exportApi;
      if (exportScope?.saveAsCopy) {
        const unregister = registerViewerBytesProvider(async () => {
          const buffer = await exportScope.saveAsCopy().toPromise();
          return buffer ? new Uint8Array(buffer) : null;
        });
        unsubscribers.push(unregister);
      }

      if (annotationApi?.onAnnotationEvent) {
        const off = annotationApi.onAnnotationEvent((event: any) => {
          if (event?.documentId && event.documentId !== DOCUMENT_ID) return;
          if (event?.type === "create" || event?.type === "update" || event?.type === "delete") {
            onViewerDirty?.();
          }
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      const formScope = formApi?.forDocument?.(DOCUMENT_ID);
      if (formScope?.onFieldValueChange) {
        const off = formScope.onFieldValueChange(() => onViewerDirty?.());
        if (typeof off === "function") unsubscribers.push(off);
      }

      if (scroll?.onPageChange) {
        const off = scroll.onPageChange((event: any) => {
          if (event.documentId !== DOCUMENT_ID) return;
          suppressExternalPageRef.current = true;
          lastPageRef.current = event.pageNumber;
          onActivePageChange?.(event.pageNumber);
          if (typeof event.totalPages === "number") {
            onDocumentLoaded?.(event.totalPages);
          }
          queueMicrotask(() => {
            suppressExternalPageRef.current = false;
          });
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      if (scroll?.onLayoutReady) {
        const off = scroll.onLayoutReady((event: any) => {
          if (event.documentId !== DOCUMENT_ID) return;
          scroll.forDocument?.(DOCUMENT_ID)?.scrollToPage?.({
            pageNumber: Math.max(1, page),
            behavior: "instant",
          });
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      if (documentManager?.onDocumentOpened) {
        const off = documentManager.onDocumentOpened((doc: any) => {
          if (doc?.id !== DOCUMENT_ID) return;
          const count = doc?.pageCount ?? doc?.document?.pageCount;
          if (typeof count === "number") onDocumentLoaded?.(count);
          onError?.(null);
        });
        if (typeof off === "function") unsubscribers.push(off);
      }

      if (documentManager?.onDocumentError) {
        const off = documentManager.onDocumentError((event: any) => {
          if (event?.documentId !== DOCUMENT_ID) return;
          const message = event?.error instanceof Error
            ? event.error.message
            : String(event?.error ?? "Unable to open PDF");
          onError?.(message);
        });
        if (typeof off === "function") unsubscribers.push(off);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribers.forEach((off) => off());
    };
  }, [sourceUrl, onActivePageChange, onDocumentLoaded, onError, onViewerDirty, onViewerScaleChange]);

  useEffect(() => {
    if (!sourceUrl || suppressExternalPageRef.current || page === lastPageRef.current) return;
    let cancelled = false;
    void (async () => {
      const registry = await viewerRef.current?.registry;
      if (cancelled || !registry) return;
      const scroll = registry.getPlugin?.("scroll")?.provides?.() as any;
      scroll?.forDocument?.(DOCUMENT_ID)?.scrollToPage?.({
        pageNumber: Math.max(1, page),
        behavior: "instant",
      });
      lastPageRef.current = page;
    })();
    return () => {
      cancelled = true;
    };
  }, [page, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || scale === lastScaleRef.current) return;
    let cancelled = false;
    void (async () => {
      const registry = await viewerRef.current?.registry;
      if (cancelled || !registry) return;
      const zoom = registry.getPlugin?.("zoom")?.provides?.() as any;
      zoom?.forDocument?.(DOCUMENT_ID)?.requestZoom?.(Math.max(0.05, Math.min(5, scale)));
      lastScaleRef.current = scale;
    })();
    return () => {
      cancelled = true;
    };
  }, [scale, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    void (async () => {
      const registry = await viewerRef.current?.registry;
      if (cancelled || !registry) return;

      const annotation = registry.getPlugin?.("annotation")?.provides?.() as any;
      const redaction = registry.getPlugin?.("redaction")?.provides?.() as any;
      const redactionScope = redaction?.forDocument?.(DOCUMENT_ID) ?? redaction;

      if (activeTool === "redact") {
        annotation?.setActiveTool?.(null);
        if (!redactionScope?.isRedactActive?.()) redactionScope?.toggleRedact?.();
        return;
      }

      if (redactionScope?.isRedactActive?.()) redactionScope?.toggleRedact?.();
      annotation?.setActiveTool?.(mapAnnotationTool(activeTool));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTool, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || !onSearchResult) return;
    onSearchResult(false, "Use the PDFium viewer search tool for full-document search.");
  }, [sourceUrl, onSearchResult]);

  if (!sourceUrl || !config) {
    return (
      <div className="viewer-shell flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        Open a PDF to start viewing.
      </div>
    );
  }

  return (
    <div className="viewer-shell h-full min-h-0 overflow-hidden" data-opdf-engine="pdfium-wasm">
      <EmbedPdfViewer
        key={sourceUrl}
        ref={viewerRef}
        config={config as any}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
