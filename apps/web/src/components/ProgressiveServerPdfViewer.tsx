import { useEffect, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!nativeReady || window.innerWidth < 900) return;
    const root = rootRef.current;
    if (!root) return;

    let timer = 0;
    let attempts = 0;
    const openSidebar = () => {
      const panel = root.querySelector<HTMLElement>('[data-sidebar-id="sidebar-panel"]');
      if (panel && panel.getBoundingClientRect().width > 0) return;

      const button = Array.from(
        root.querySelectorAll<HTMLButtonElement>('button[aria-label="Sidebar"]'),
      ).find((candidate) => {
        if (candidate.disabled) return false;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });

      if (button) button.click();
      attempts += 1;
      if (attempts < 10) timer = window.setTimeout(openSidebar, 500);
    };

    timer = window.setTimeout(openSidebar, 100);
    return () => window.clearTimeout(timer);
  }, [nativeReady]);

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
    <div ref={rootRef} className="relative h-full min-h-0 overflow-hidden" data-opdf-progressive-viewer="true">
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
