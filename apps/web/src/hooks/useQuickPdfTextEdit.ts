import { useEffect, useRef, useState, type RefObject } from "react";
import type { DirectTextRequest } from "../components/DirectPdfTextEditor";
import { findPageCanvasRect } from "../lib/directPdfTextHit";

type Revision = {
  tabId: string | null;
  identity: string;
  bytes: Uint8Array | null;
  blob: Blob | null;
  page: number;
  activeTool: string;
};

function sameRevision(a: Revision, b: Revision) {
  return a.tabId === b.tabId && a.identity === b.identity &&
    a.bytes === b.bytes && a.blob === b.blob &&
    a.page === b.page && a.activeTool === "select" && b.activeTool === "select";
}

export function useQuickPdfTextEdit({
  revision, viewerAreaRef, applyBytes,
}: {
  revision: Revision;
  viewerAreaRef: RefObject<HTMLElement | null>;
  applyBytes: (bytes: Uint8Array, page: number) => void;
}) {
  const [session, setSession] = useState<{ request: DirectTextRequest; revision: Revision } | null>(null);
  const currentRef = useRef(revision);
  const nextId = useRef(0);
  currentRef.current = revision;

  useEffect(() => {
    setSession((previous) => previous && sameRevision(previous.revision, revision) ? previous : null);
  }, [revision.tabId, revision.identity, revision.bytes, revision.blob, revision.page, revision.activeTool]);

  const open = (clientX: number, clientY: number, selectedText = "") => {
    const root = viewerAreaRef.current;
    if (!root || !revision.tabId || revision.activeTool !== "select") return;
    const rect = findPageCanvasRect(root, clientX, clientY);
    if (!rect) return;
    nextId.current += 1;
    setSession({
      revision: { ...revision },
      request: {
        id: nextId.current, pageIndex: Math.max(0, revision.page - 1),
        clientX, clientY, anchorX: clientX + 12, anchorY: clientY + 12,
        rect, selectedText,
      },
    });
  };

  const valid = session && sameRevision(session.revision, revision) ? session : null;
  const close = (id: number) => setSession((previous) =>
    previous?.request.id === id ? null : previous);
  const apply = (id: number, bytes: Uint8Array, page: number) => {
    if (!session || session.request.id !== id ||
        !sameRevision(session.revision, currentRef.current)) {
      throw new Error("The document changed during editing. Reopen the text before applying.");
    }
    applyBytes(bytes, page);
  };
  return { session: valid, open, close, apply };
}
