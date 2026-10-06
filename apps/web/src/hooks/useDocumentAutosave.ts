import { useCallback, useEffect, useRef } from "react";

type SaveState = "idle" | "saving" | "saved";

type AutosaveArgs = {
  hasDocument: boolean;
  saveState: SaveState;
  docBytes: Uint8Array | null;
  annotations: unknown[];
  sourceIdentity: string;
  savePdf: (options?: { silent?: boolean }) => void | Promise<void>;
  delayMs?: number;
};

export function useDocumentAutosave({
  hasDocument,
  saveState,
  docBytes,
  annotations,
  sourceIdentity,
  savePdf,
  delayMs = 1800,
}: AutosaveArgs) {
  const timerRef = useRef<number | null>(null);
  const savePdfRef = useRef(savePdf);
  const stateRef = useRef({ hasDocument, saveState });

  useEffect(() => {
    savePdfRef.current = savePdf;
  }, [savePdf]);

  useEffect(() => {
    stateRef.current = { hasDocument, saveState };
  }, [hasDocument, saveState]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    cancel();
    if (!stateRef.current.hasDocument || stateRef.current.saveState !== "idle") return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!stateRef.current.hasDocument || stateRef.current.saveState !== "idle") return;
      void savePdfRef.current({ silent: true });
    }, delayMs);
  }, [cancel, delayMs]);

  useEffect(() => {
    if (!hasDocument || saveState !== "idle") {
      cancel();
      return;
    }
    schedule();
    return cancel;
  }, [annotations, cancel, docBytes, hasDocument, saveState, schedule, sourceIdentity]);

  useEffect(() => cancel, [cancel]);

  return {
    autosaveEnabled: true,
    scheduleAutosave: schedule,
  };
}
