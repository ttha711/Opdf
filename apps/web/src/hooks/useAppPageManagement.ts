import { useCallback, type Dispatch, type SetStateAction } from "react";

type ControllerResult = ReturnType<typeof import("./useAppControllers").useAppControllers>;
type AppState = ControllerResult["state"];
type Bridge = ControllerResult["bridge"];
type MaterializeDocumentBytes = ControllerResult["materializeDocumentBytes"];
type ReplaceDocumentBytes = ControllerResult["replaceDocumentBytes"];

type Args = {
  state: AppState;
  bridge: Bridge;
  materializeDocumentBytes: MaterializeDocumentBytes;
  replaceDocumentBytes: ReplaceDocumentBytes;
  setSelectedThumbnailPages: Dispatch<SetStateAction<Set<number>>>;
};

function emitStoredMutation(sourceIdentity: string, updatedAt: number) {
  window.dispatchEvent(new CustomEvent("opdf:server-document-mutated", {
    detail: { sourceIdentity, updatedAt },
  }));
}

export function useAppPageManagement({
  state,
  bridge,
  materializeDocumentBytes,
  replaceDocumentBytes,
  setSelectedThumbnailPages,
}: Args) {
  const rotate = useCallback(async (pages: number[], degrees: number) => {
    if (state.sourceIdentity.startsWith("server://") && bridge.mutateStoredDocument) {
      const result = await bridge.mutateStoredDocument(state.sourceIdentity, {
        type: "rotate-pages",
        pageNumbers: pages,
        degrees,
      });
      emitStoredMutation(state.sourceIdentity, result.updatedAt);
      return;
    }
    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;
    replaceDocumentBytes(await bridge.rotatePages(bytes, pages, degrees), state.page);
  }, [bridge, materializeDocumentBytes, replaceDocumentBytes, state.docBytes, state.page, state.sourceIdentity]);

  const remove = useCallback(async (pages: number[]) => {
    if (state.sourceIdentity.startsWith("server://") && bridge.mutateStoredDocument) {
      const result = await bridge.mutateStoredDocument(state.sourceIdentity, {
        type: "delete-pages",
        pageNumbers: pages,
        totalPages: state.totalPages,
      });
      emitStoredMutation(state.sourceIdentity, result.updatedAt);
      state.setPage((current) => Math.min(current, Math.max(1, state.totalPages - pages.length)));
      state.setTotalPages((current) => Math.max(1, current - pages.length));
      return;
    }
    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;
    replaceDocumentBytes(
      await bridge.deletePages(bytes, pages),
      Math.min(state.page, state.totalPages - pages.length),
    );
  }, [
    bridge,
    materializeDocumentBytes,
    replaceDocumentBytes,
    state.docBytes,
    state.page,
    state.setPage,
    state.setTotalPages,
    state.sourceIdentity,
    state.totalPages,
  ]);

  const reorder = useCallback(async (fromPage: number, toPage: number) => {
    if (
      fromPage === toPage ||
      fromPage < 1 ||
      toPage < 1 ||
      fromPage > state.totalPages ||
      toPage > state.totalPages
    ) return;

    const pageOrder = Array.from({ length: state.totalPages }, (_, index) => index + 1);
    const [moved] = pageOrder.splice(fromPage - 1, 1);
    pageOrder.splice(toPage - 1, 0, moved);

    if (state.sourceIdentity.startsWith("server://") && bridge.mutateStoredDocument) {
      const result = await bridge.mutateStoredDocument(state.sourceIdentity, {
        type: "reorder-pages",
        pageOrder,
      });
      emitStoredMutation(state.sourceIdentity, result.updatedAt);
      state.setPage(toPage);
      setSelectedThumbnailPages(new Set());
      return;
    }

    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;

    let next: Uint8Array;
    if (bridge.reorderPages) {
      next = await bridge.reorderPages(bytes, pageOrder);
    } else {
      const pdfLib = await import("pdf-lib");
      const source = await pdfLib.PDFDocument.load(bytes);
      const output = await pdfLib.PDFDocument.create();
      const copied = await output.copyPages(source, pageOrder.map((pageNumber) => pageNumber - 1));
      copied.forEach((page) => output.addPage(page));
      next = await output.save();
    }

    replaceDocumentBytes(next, toPage);
    setSelectedThumbnailPages(new Set());
  }, [
    bridge,
    materializeDocumentBytes,
    replaceDocumentBytes,
    setSelectedThumbnailPages,
    state.docBytes,
    state.setPage,
    state.sourceIdentity,
    state.totalPages,
  ]);

  const duplicate = useCallback(async (pages: number[]) => {
    const selected = [...new Set(pages)].sort((a, b) => a - b);
    if (selected.length === 0) return;

    if (state.sourceIdentity.startsWith("server://") && bridge.mutateStoredDocument) {
      const result = await bridge.mutateStoredDocument(state.sourceIdentity, {
        type: "duplicate-pages",
        pageNumbers: selected,
      });
      emitStoredMutation(state.sourceIdentity, result.updatedAt);
      state.setTotalPages((current) => current + selected.length);
      setSelectedThumbnailPages(new Set());
      return;
    }

    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;
    const next = bridge.duplicatePages
      ? await bridge.duplicatePages(bytes, selected)
      : await (async () => {
          const pdfLib = await import("pdf-lib");
          const source = await pdfLib.PDFDocument.load(bytes);
          const order: number[] = [];
          const chosen = new Set(selected);
          for (let pageNumber = 1; pageNumber <= source.getPageCount(); pageNumber += 1) {
            order.push(pageNumber);
            if (chosen.has(pageNumber)) order.push(pageNumber);
          }
          const output = await pdfLib.PDFDocument.create();
          const copied = await output.copyPages(source, order.map((pageNumber) => pageNumber - 1));
          copied.forEach((page) => output.addPage(page));
          return output.save();
        })();

    replaceDocumentBytes(next, selected[0]);
    setSelectedThumbnailPages(new Set());
  }, [
    bridge,
    materializeDocumentBytes,
    replaceDocumentBytes,
    setSelectedThumbnailPages,
    state.docBytes,
    state.setTotalPages,
    state.sourceIdentity,
  ]);

  const extract = useCallback(async (pages: number[]) => {
    const selected = [...new Set(pages)].sort((a, b) => a - b);
    if (selected.length === 0) return;
    const bytes = state.docBytes ?? await materializeDocumentBytes();
    if (!bytes) return;

    const pdfLib = await import("pdf-lib");
    const source = await pdfLib.PDFDocument.load(bytes);
    const output = await pdfLib.PDFDocument.create();
    const copied = await output.copyPages(source, selected.map((pageNumber) => pageNumber - 1));
    copied.forEach((page) => output.addPage(page));
    const result = new Uint8Array(await output.save());
    const base = (state.fileName.split(/[\\/]/).pop() || "document.pdf").replace(/\.pdf$/i, "");
    await bridge.saveFile(result, `${base}-extracted-pages.pdf`, ["pdf"]);
  }, [bridge, materializeDocumentBytes, state.docBytes, state.fileName]);

  return {
    handleRotatePages: rotate,
    handleDeletePages: remove,
    handleReorderPages: reorder,
    handleDuplicatePages: duplicate,
    handleExtractPages: extract,
  };
}
