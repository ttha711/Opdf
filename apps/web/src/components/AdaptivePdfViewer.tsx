import { useEffect, useMemo, useState } from "react";
import type { PdfViewerProps } from "./PdfViewer.types";
import { PdfViewer } from "./PdfViewer";
import { PdfRangeViewer } from "./PdfRangeViewer";
import { NativeEditPdfViewer } from "./NativeEditPdfViewer";
import { getServerDocumentUrl } from "../lib/documentSource";

const RANGE_PREVIEW_THRESHOLD = 32 * 1024 * 1024;

export function AdaptivePdfViewer(props: PdfViewerProps) {
  const sourceIdentity = props.sourceIdentity ?? "";
  const sourceUrl = useMemo(() => getServerDocumentUrl(sourceIdentity), [sourceIdentity]);
  const serverOnlySource = Boolean(sourceUrl && !props.data && !props.sourceBlob);
  const [largeServerPdf, setLargeServerPdf] = useState(false);

  useEffect(() => {
    if (!serverOnlySource || !sourceUrl) {
      setLargeServerPdf(false);
      return;
    }
    let cancelled = false;
    void fetch(sourceUrl, { method: "HEAD" }).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      const size = Number(response.headers.get("content-length") || 0);
      if (!cancelled) setLargeServerPdf(Number.isFinite(size) && size >= RANGE_PREVIEW_THRESHOLD);
    }).catch(() => {
      if (!cancelled) setLargeServerPdf(false);
    });
    return () => {
      cancelled = true;
    };
  }, [serverOnlySource, sourceUrl]);

  if (props.activeTool === "edit-content") return <NativeEditPdfViewer {...props} />;

  const requiresFullPdfium = (props.activeTool ?? "select") !== "select";
  if (largeServerPdf && !requiresFullPdfium) {
    return <PdfRangeViewer {...props} />;
  }
  return <PdfViewer {...props} />;
}
