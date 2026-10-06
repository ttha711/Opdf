import { refreshPages } from "@embedpdf/core";

type EmbedPdfRegistryLike = {
  getPlugin?: (id: string) => any;
  getStore?: () => {
    getState: () => any;
    dispatch: (action: unknown) => unknown;
  };
};

function documentPageIndexes(registry: EmbedPdfRegistryLike, documentId: string) {
  const pages = registry.getStore?.().getState()?.core?.documents?.[documentId]?.document?.pages;
  return Array.isArray(pages) ? pages.map((_: unknown, index: number) => index) : [];
}

/**
 * EmbedPDF 2.15.x thumbnails rasterize pages without annotations and do not
 * invalidate their cache after annotation commits. Patch only the thumbnail
 * render path, not the main render plugin defaults, so the live annotation
 * layer in the main viewer is never double-drawn.
 */
export function installAnnotationThumbnailSync(
  registry: EmbedPdfRegistryLike,
  documentId: string,
) {
  const thumbnailPlugin = registry.getPlugin?.("thumbnail") as any;
  const renderCapability = registry.getPlugin?.("render")?.provides?.() as any;
  const annotationCapability = registry.getPlugin?.("annotation")?.provides?.() as any;
  const store = registry.getStore?.();

  if (
    !thumbnailPlugin ||
    typeof thumbnailPlugin.renderThumb !== "function" ||
    !renderCapability?.forDocument ||
    !store
  ) {
    return () => {};
  }

  const originalRenderThumb = thumbnailPlugin.renderThumb;
  const patchedRenderThumb = (pageIndex: number, dpr: number, requestedDocumentId?: string) => {
    const id = requestedDocumentId ?? documentId;
    const page = store.getState()?.core?.documents?.[id]?.document?.pages?.[pageIndex];
    if (!page?.size?.width || !page?.size?.height) {
      return originalRenderThumb.call(thumbnailPlugin, pageIndex, dpr, requestedDocumentId);
    }

    const outerWidth = thumbnailPlugin.cfg?.width ?? 120;
    const imagePadding = thumbnailPlugin.cfg?.imagePadding ?? 0;
    const innerWidth = Math.max(1, outerWidth - 2 * imagePadding);
    const scaleFactor = innerWidth / page.size.width;

    return renderCapability.forDocument(id).renderPageRect({
      pageIndex,
      rect: {
        origin: { x: 0, y: 0 },
        size: page.size,
      },
      options: {
        scaleFactor,
        dpr,
        rotation: page.rotation,
        withAnnotations: true,
      },
    });
  };

  thumbnailPlugin.renderThumb = patchedRenderThumb;

  const refresh = (pageIndexes: number[]) => {
    const unique = [...new Set(pageIndexes.filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0))];
    if (unique.length > 0) store.dispatch(refreshPages(documentId, unique));
  };

  // Existing thumbnails may have been rendered before this bridge effect ran.
  // Invalidate them once so every visible card switches to annotation-aware rendering.
  refresh(documentPageIndexes(registry, documentId));

  const annotationScope =
    annotationCapability?.forDocument?.(documentId) ?? annotationCapability;
  const off = annotationScope?.onAnnotationEvent?.((event: any) => {
    if (event?.documentId && event.documentId !== documentId) return;

    if (event?.type === "loaded") {
      refresh(documentPageIndexes(registry, documentId));
      return;
    }

    if (
      event?.committed === true &&
      (event.type === "create" || event.type === "update" || event.type === "delete")
    ) {
      refresh([event.pageIndex]);
    }
  });

  return () => {
    if (thumbnailPlugin.renderThumb === patchedRenderThumb) {
      thumbnailPlugin.renderThumb = originalRenderThumb;
    }
    if (typeof off === "function") off();
  };
}
