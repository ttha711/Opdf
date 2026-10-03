type PageCountSource = {
  pageCount?: unknown;
  document?: { pageCount?: unknown } | null;
};

type PdfiumPageCountArgs = {
  documentId: string;
  scrollScope?: { getTotalPages?: () => unknown } | null;
  documentManager?: {
    getDocumentState?: (documentId: string) => PageCountSource | null;
    getDocument?: (documentId: string) => PageCountSource | null;
    getActiveDocument?: () => PageCountSource | null;
  } | null;
  openedDocument?: PageCountSource | null;
};

function asPositivePageCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}

export function resolvePdfiumPageCount({
  documentId,
  scrollScope,
  documentManager,
  openedDocument,
}: PdfiumPageCountArgs): number | null {
  const state = documentManager?.getDocumentState?.(documentId);
  const document = documentManager?.getDocument?.(documentId);
  const activeDocument = documentManager?.getActiveDocument?.();

  const candidates = [
    scrollScope?.getTotalPages?.(),
    openedDocument?.pageCount,
    openedDocument?.document?.pageCount,
    state?.pageCount,
    state?.document?.pageCount,
    document?.pageCount,
    document?.document?.pageCount,
    activeDocument?.pageCount,
    activeDocument?.document?.pageCount,
  ];

  for (const candidate of candidates) {
    const count = asPositivePageCount(candidate);
    if (count) return count;
  }
  return null;
}
