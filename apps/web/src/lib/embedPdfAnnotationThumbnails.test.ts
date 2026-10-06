import { describe, expect, it, vi } from "vitest";
import { installAnnotationThumbnailSync } from "./embedPdfAnnotationThumbnails";

describe("annotation-aware EmbedPDF thumbnails", () => {
  it("renders thumbnail rasters with annotations and refreshes committed pages", () => {
    const annotationListener = { current: null as ((event: any) => void) | null };
    const renderedTask = { wait: vi.fn(), abort: vi.fn() };
    const renderPageRect = vi.fn(() => renderedTask);
    const originalRenderThumb = vi.fn(() => ({ original: true }));

    const thumbnailPlugin = {
      cfg: { width: 120, imagePadding: 0 },
      renderThumb: originalRenderThumb,
    };
    const annotationScope = {
      onAnnotationEvent: vi.fn((listener: (event: any) => void) => {
        annotationListener.current = listener;
        return vi.fn();
      }),
    };
    const dispatch = vi.fn();
    const registry = {
      getPlugin: (id: string) => {
        if (id === "thumbnail") return thumbnailPlugin;
        if (id === "render") {
          return {
            provides: () => ({
              forDocument: () => ({ renderPageRect }),
            }),
          };
        }
        if (id === "annotation") {
          return {
            provides: () => ({
              forDocument: () => annotationScope,
            }),
          };
        }
        return null;
      },
      getStore: () => ({
        getState: () => ({
          core: {
            documents: {
              "opdf-active-document": {
                document: {
                  pages: [
                    { size: { width: 600, height: 800 }, rotation: 0 },
                    { size: { width: 800, height: 600 }, rotation: 1 },
                  ],
                },
              },
            },
          },
        }),
        dispatch,
      }),
    };

    const cleanup = installAnnotationThumbnailSync(registry, "opdf-active-document");

    const task = (thumbnailPlugin.renderThumb as any)(0, 2, "opdf-active-document");
    expect(task).toBe(renderedTask);
    expect(renderPageRect).toHaveBeenCalledWith({
      pageIndex: 0,
      rect: {
        origin: { x: 0, y: 0 },
        size: { width: 600, height: 800 },
      },
      options: {
        scaleFactor: 0.2,
        dpr: 2,
        rotation: 0,
        withAnnotations: true,
      },
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "REFRESH_PAGES",
      payload: {
        documentId: "opdf-active-document",
        pageIndexes: [0, 1],
      },
    });

    dispatch.mockClear();
    annotationListener.current?.({
      type: "update",
      documentId: "opdf-active-document",
      pageIndex: 1,
      committed: false,
    });
    expect(dispatch).not.toHaveBeenCalled();

    annotationListener.current?.({
      type: "update",
      documentId: "opdf-active-document",
      pageIndex: 1,
      committed: true,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "REFRESH_PAGES",
      payload: {
        documentId: "opdf-active-document",
        pageIndexes: [1],
      },
    });

    cleanup();
    expect(thumbnailPlugin.renderThumb).toBe(originalRenderThumb);
  });
});
