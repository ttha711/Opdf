import { useEffect, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfRangeViewer } from "./PdfRangeViewer";
import { PdfViewer } from "./PdfViewer";
import { getServerDocumentUrl } from "../lib/documentSource";

const FAST_PREVIEW_THRESHOLD_BYTES = 16 * 1024 * 1024;
const NATIVE_START_FALLBACK_MS = 1500;

export function ProgressiveServerPdfViewer(props: PdfViewerProps) {
  const { sourceIdentity = "" } = props;
  const [useFastPreview, setUseFastPreview] = useState<boolean | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [nativeStarted, setNativeStarted] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUseFastPreview(null);
    setPreviewReady(false);
    setNativeStarted(false);
    setNativeReady(false);

    const url = getServerDocumentUrl(sourceIdentity);
    if (!url) {
      setUseFastPreview(false);
      return;
    }

    void fetch(url, { method: "HEAD", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HEAD failed: ${response.status}`);
        const size = Number(response.headers.get("content-length") || 0);
        if (!cancelled) setUseFastPreview(size >= FAST_PREVIEW_THRESHOLD_BYTES);
      })
      .catch(() => {
        if (!cancelled) setUseFastPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceIdentity]);

  useEffect(() => {
    if (!useFastPreview || nativeStarted) return;
    if (previewReady) {
      setNativeStarted(true);
      return;
    }
    const timer = window.setTimeout(() => setNativeStarted(true), NATIVE_START_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [nativeStarted, previewReady, useFastPreview]);

  if (useFastPreview === false) {
    return <PdfViewer {...props} />;
  }

  if (useFastPreview === null) {
    return (
      <div className="viewer-shell flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        Preparing document preview...
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden" data-opdf-progressive-viewer="true">
      {!nativeReady ? (
        <div className="absolute inset-0 z-10">
          <PdfRangeViewer
            {...props}
            onViewerReady={() => setPreviewReady(true)}
          />
        </div>
      ) : null}

      {nativeStarted ? (
        <div
          className="absolute inset-0"
          style={{
            opacity: nativeReady ? 1 : 0,
            pointerEvents: nativeReady ? "auto" : "none",
          }}
          aria-hidden={nativeReady ? undefined : true}
        >
          <PdfViewer
            {...props}
            onViewerReady={() => {
              setNativeReady(true);
              props.onViewerReady?.();
            }}
          />
        </div>
      ) : null}

      {!nativeReady ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-black/60 px-2 py-1 text-[11px] text-white">
          Fast preview · loading editing tools
        </div>
      ) : null}
    </div>
  );
}
